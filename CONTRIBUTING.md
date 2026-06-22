# Contributing to vps-rescue

Thanks for considering a contribution. Before you write code, please read the
scope statement below — it will save both of us time.

---

## What this project is

A **client-side diagnostic and rescue toolkit** for individual developers
whose SSH connections to budget VPS providers (Hostinger, Contabo, OVH,
Vultr, Linode, DigitalOcean, …) get stuck at the network layer — usually
because of upstream ISP / transit / ingress filtering.

`vps-rescue` runs entirely on the user's own machine and on credentials the
user owns. We operate no relay, no SaaS, no telemetry collector. This is
not negotiable — every PR has to keep that property intact.

---

## Scope: what we accept (and don't)

### Yes, please ✅

- **New transports.** Cloudflare Tunnel (`cloudflared`), Tor hidden
  services, ngrok / localtunnel, SSH-over-Cloudflare-Access, AWS SSM
  Session Manager, self-hosted WireGuard, etc. Anything that can move a
  user's SSH packets through a path their ISP isn't blocking, on the
  user's own credentials.
- **New diagnostics.** Outside-vantage probes (so we can tell "your
  network" from "the destination" without ambiguity), provider-specific
  hints from IP-range databases, SSH-protocol-level checks (host key
  changes, auth method probing).
- **New providers.** API integrations with VPS providers so we can skip
  the Hostinger-Browser-Terminal paste step: DigitalOcean droplet
  console, Linode LISH, AWS SSM, Vultr, etc.
- **Hardening modules.** Optional `vps-rescue harden` subcommand: UFW
  defaults, non-root deploy user, swap setup, unattended-upgrades,
  fail2ban / crowdsec. **Opt-in only**, never run as part of a rescue.

### No, thanks ❌

- **Configuration management.** Use Ansible / cloud-init for "install
  Docker", "deploy my app", "configure Nginx". Not our job. We will
  reject these even if they're well-implemented.
- **Server-side components we operate.** No relay, no telemetry, no
  hosted dashboard, no "vps-rescue.com signs you in". The trust model
  is built on us not having any of that.
- **Anything that mutates the VPS without user consent.** Every action
  on the remote machine must be visible in the bash one-liner we print
  before pasting.
- **Closed-source dependencies** in production code paths.

If you're unsure, open a discussion before writing the PR.

---

## How to add a new transport

This is the most-requested extension point, so it has its own playbook.

### 1. Pick an `id`

Lowercase, hyphenated, stable. Examples: `tailscale`, `cloudflared`,
`tor`, `ngrok`. The id appears in `--transport <id>`, in CI logs, and in
saved state — change it later and you break users.

### 2. Implement the `Transport` interface

```ts
// src/transports/<id>.ts
import type { Transport, TransportContext, ProvisionResult } from "./types.js";

export class MyTransport implements Transport {
  readonly id = "my-transport";
  readonly label = "My Transport";
  readonly description = "One-sentence summary for --help output.";

  async isConfigured(): Promise<boolean> { /* … */ }
  async setup(unattended?: Record<string, string>): Promise<void> { /* … */ }
  async findExisting(ctx: TransportContext): Promise<ProvisionResult | null> { /* … */ }
  async provision(ctx: TransportContext): Promise<ProvisionResult> { /* … */ }
}
```

Look at `src/transports/tailscale.ts` for a worked example.

### 3. Register it

```ts
// src/transports/index.ts
import { MyTransport } from "./my-transport.js";

const REGISTRY: Transport[] = [
  new TailscaleTransport(),
  new MyTransport(),     // ← add here
];
```

Insertion order = default order shown in `--help`. Don't reorder existing
entries — that changes the default for users.

### 4. Write tests

At minimum:
- `isConfigured()` returns false when credentials are absent.
- `findExisting()` returns null on lookup failure (fail-open is required).
- One round-trip of any string templating you do (cf. `tests/bash-escape.test.ts`).

For full network-touching tests, mock at the HTTP layer (`vitest-fetch-mock`
or a hand-rolled stub). Do not commit tests that hit real third-party APIs.

### 5. Document it

- Add a row to the "Available transports" table in `README.md`.
- Add a paragraph to the security model in `README.md` explaining what
  trust assumption your transport adds.
- Update `CHANGELOG.md` under the unreleased section.

### 6. Open the PR

Use the "New transport" PR template (in `.github/PULL_REQUEST_TEMPLATE/`).

---

## Local development

```bash
git clone https://github.com/MHDYousuf/vps-rescue.git
cd vps-rescue
npm install
npm run build        # tsc → dist/
npm test             # vitest
npm run typecheck    # tsc --noEmit
node bin/vps-rescue.js --help
```

For an interactive dev loop: `npm run dev -- ssh root@example.com`.

---

## Coding standards

The TL;DR (the `cursor/team-kit` rules in this repo enforce some of these):

- **TypeScript strict.** No `any` in exported types. Use discriminated
  unions + `never` checks in switches over enums.
- **Imports at the top.** No inline `import()` in function bodies.
- **No code-narrating comments.** `// increment the counter` is noise.
  Comments should explain *why*, not *what*.
- **Tests for pure functions.** If a function is reachable from the public
  CLI surface and doesn't do I/O, it should have a test.
- **No secrets in logs.** Use `maskSecret()` from `src/lib/ui.ts`.
- **Pass values through `escapeForBashC` / shell-safe sanitizers** before
  embedding them in any shell command rendered to the user. Shell injection
  in a rescue script that runs as root is catastrophic.

The CI will check formatting (via TypeScript) and run tests on Node 18,
20, and 22 for every PR. Get those green before requesting review.

---

## Reviews and merging

- I (the maintainer) review PRs as they come in. Aim is "first response
  within 72h", though that may slip during travel.
- For non-trivial changes: please **open a discussion or draft PR** before
  spending a weekend on the implementation. I'd rather give you direction
  early than reject a polished PR.
- We prefer many small PRs to one big one. If your change is over ~500
  lines of diff, consider splitting.

---

## Reporting bugs

Use the bug-report issue template. Include:
- `node --version`, OS, terminal emulator
- The exact command you ran
- The full output (use `--debug` to print stack traces)
- What you expected vs. what happened

For security-sensitive bugs, see `SECURITY.md` — please don't file public
issues for those.

---

## Code of conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md).
Be kind. We're all here because budget VPS hosting in 2026 is still
surprisingly hard.
