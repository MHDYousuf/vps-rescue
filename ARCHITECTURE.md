# Architecture

This document explains how `vps-rescue` is structured so contributors can
add new transports, diagnostic checks, or providers without re-learning the
whole codebase.

If a section here is unclear or stale, that itself is a bug — please open a
PR.

---

## Layered design

```
                ┌────────────────────────────────────────────────┐
                │  CLI (commander)                               │
                │  src/cli.ts                                    │
                │  parses args → calls a command                 │
                └─────────────┬──────────────────────────────────┘
                              │
                              ▼
                ┌────────────────────────────────────────────────┐
                │  Commands (orchestration, transport-agnostic)  │
                │  src/commands/                                 │
                │  ssh.ts · init.ts · status.ts · uninstall.ts   │
                └──┬───────────────┬──────────────────────────┬──┘
                   │               │                          │
                   ▼               ▼                          ▼
        ┌──────────────────┐  ┌──────────────┐    ┌────────────────────┐
        │  Diagnostics     │  │  Transports  │    │  System libs       │
        │  src/lib/        │  │  src/        │    │  src/lib/          │
        │  diagnose.ts     │  │  transports/ │    │  ssh-config.ts     │
        │  ssh-target.ts   │  │  ┌─────────┐ │    │  pubkey.ts         │
        │                  │  │  │ types   │ │    │  token-store.ts    │
        │  Pure functions, │  │  │   .ts   │ │    │  bash-escape.ts    │
        │  no I/O beyond   │  │  └────┬────┘ │    │  ui.ts             │
        │  the network /   │  │       │      │    │                    │
        │  process spawn   │  │       ▼      │    │  OS-level wrappers │
        │  the user asked  │  │  ┌─────────┐ │    │  for SSH config,   │
        │  for.            │  │  │tailscale│ │    │  keychain, key     │
        │                  │  │  │   .ts   │ │    │  lookup, etc.      │
        │                  │  │  └─────────┘ │    │                    │
        │                  │  │  ┌─────────┐ │    │                    │
        │                  │  │  │(future) │ │    │                    │
        │                  │  │  └─────────┘ │    │                    │
        └──────────────────┘  └──────────────┘    └────────────────────┘
```

Three rules keep this clean:

1. **Commands never import a transport directly.** They go through
   `src/transports/index.ts` (the registry). This is what makes the seam
   pluggable.
2. **Transports own their user interaction.** Paste prompts, spinners,
   secret-handling flows live inside the transport. The command layer
   doesn't know what a "Tailscale auth key" is.
3. **`src/lib/` modules never depend on a transport.** They're pure
   utilities. If a transport needs a new shared helper, add it here.

---

## The Transport interface

```ts
// src/transports/types.ts
export interface Transport {
  readonly id: string;          // "tailscale", "cloudflared", ...
  readonly label: string;       // "Tailscale"
  readonly description: string; // shown in `--help`

  isConfigured(): Promise<boolean>;
  setup(unattended?: Record<string, string>): Promise<void>;
  findExisting(ctx: TransportContext): Promise<ProvisionResult | null>;
  provision(ctx: TransportContext): Promise<ProvisionResult>;
}
```

Lifecycle from the orchestrator's view (`src/commands/ssh.ts`):

1. **`isConfigured()`** — cheap check. If false, the orchestrator tells
   the user to run `vps-rescue init --transport <id>`.
2. **`findExisting(ctx)`** — best-effort idempotency. If a device with the
   target alias already exists in the transport's namespace, we skip the
   paste step entirely and just rewrite SSH config.
3. **`provision(ctx)`** — the real interactive rescue. May render scripts,
   poll APIs, prompt the user. Returns when the device is reachable.

`ProvisionResult.sshHostname` is whatever should land in the `~/.ssh/config`
`HostName` field — a `100.x.x.x` for Tailscale, a CloudFront-style domain
for Cloudflare Tunnel, etc.

---

## Diagnostic engine

`src/lib/diagnose.ts` produces a `DiagnosisVerdict`:

| Verdict          | Meaning                                                     | Rescue?   |
| ---------------- | ----------------------------------------------------------- | --------- |
| `reachable`      | TCP probe succeeded. Direct SSH works.                      | Skip      |
| `isp_blocked`    | Traceroute died near user (private/CGNAT hop, ≤5 hops).     | Yes       |
| `path_blocked`   | Traceroute crossed the user's ISP, then died upstream.      | Yes       |
| `host_offline`   | Traceroute reached destination IP; TCP port closed.         | No (fix sshd) |
| `dns_failure`    | Could not resolve the target hostname.                      | No (fix DNS) |
| `unknown`        | TCP failed, traceroute inconclusive.                        | Offer     |

Diagnoses are **observation**, not blame. We deliberately don't try to
distinguish "your ISP did it" from "Hostinger's WAF did it" beyond what
traceroute can prove — the *remediation* is identical, and over-confident
attribution erodes trust.

To add a new check, add a function to `diagnose.ts` and wire its output
into `pickVerdict()`. Keep checks under 5s each; users wait at a terminal.

---

## Why we don't operate any infrastructure

`vps-rescue` is a **client-side tool**. It:

- Stores secrets in the user's OS keychain (`@napi-rs/keyring`)
- Calls APIs the user owns (the user's Tailscale tenant)
- Mints credentials the user controls (5-minute single-use auth keys)
- Writes to the user's own `~/.ssh/config`

We never see a packet between the user and their VPS. We don't run a
relay, a DERP, a control plane, a database, a telemetry collector, or an
authentication service. This is non-negotiable — adding any of these would
change the trust model.

---

## File index (jump table)

```
src/
  cli.ts                     # commander definitions, version, --help text
  types.ts                   # shared types (SshTarget, DiagnosisResult, DiagnosisVerdict)
  commands/
    init.ts                  # delegates to Transport.setup()
    ssh.ts                   # diagnose → transport → write ~/.ssh/config
    status.ts                # show stored credentials + tailnet device table
    uninstall.ts             # nuke stored credentials
  lib/
    bash-escape.ts           # safe $'…' escaping (tested via real bash subprocess)
    diagnose.ts              # DNS + TCP + traceroute → DiagnosisVerdict
    pubkey.ts                # find ~/.ssh/id_ed25519.pub or sibling
    rescue-script.ts         # bash one-liner generator for Tailscale (will move under transports/)
    ssh-config.ts            # idempotent upsert of managed Host blocks
    ssh-target.ts            # parse "user@host:port"; derive tailnet hostnames
    tailscale.ts             # low-level Tailscale REST client
    token-store.ts           # OS keychain wrapper
    ui.ts                    # picocolors + masking helpers
  transports/
    types.ts                 # Transport / TransportContext / ProvisionResult interfaces
    index.ts                 # registry: getTransport(id), listTransports()
    tailscale.ts             # TailscaleTransport: implements Transport
tests/
    sanitize-description.test.ts
    parse-ssh-target.test.ts
    bash-escape.test.ts
```
