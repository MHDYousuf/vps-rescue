# Security Policy

`vps-rescue` ships code that runs as `root` on the user's VPS and stores
Tailscale API tokens in the user's OS keychain. We take security reports
seriously.

## Reporting a vulnerability

**Do not open public GitHub issues for security bugs.**

Email reports to: **mohd4yousuf@gmail.com**

<!-- TODO(owner): swap to a security@ alias once the project gets steady traffic. -->


Use this subject line: `[vps-rescue security] <one-line summary>`.

Include:

- A description of the issue and its impact.
- The version of `vps-rescue` (`vps-rescue --version`) and Node.js.
- Reproduction steps.
- Any suggested mitigation, if you have one.

We will acknowledge your report within 72 hours and aim to ship a fix
within 14 days for critical issues. We'll credit you in the release notes
unless you prefer to remain anonymous.

## Supported versions

| Version    | Supported   |
| ---------- | ----------- |
| `0.x.y`    | Latest only |

While we're pre-1.0 we only patch the latest minor release. We expect to
move to a "current + previous major" support window after 1.0.

## Security model

`vps-rescue` is a client-side tool. Its security properties are:

1. **No operator-side infrastructure.** We do not run a relay, control
   plane, or telemetry collector. Every network call is from the user's
   machine to either Tailscale's public API or the user's VPS.
2. **OS-keychain storage for credentials.** Tokens are stored via
   `@napi-rs/keyring` — macOS Keychain Services, Linux libsecret, Windows
   Credential Vault. Never plaintext on disk.
3. **Short-lived, single-use auth keys.** Rescue auth keys are minted with
   `reusable: false`, `preauthorized: true`, `expirySeconds: 300`. The
   blast radius if intercepted is 5 minutes, one device.
4. **No hidden code execution.** The bash one-liner displayed to the user
   before pasting is the *exact* script that runs on the VPS. We don't
   fetch additional payloads at runtime beyond the public Tailscale install
   script that Tailscale itself instructs users to run.
5. **Shell-injection guards.** All values embedded in rendered shell
   scripts go through strict allowlist sanitization (`/^[a-zA-Z0-9._-]+$/`
   for hostnames and usernames) and `escapeForBashC` for arbitrary text.
6. **No telemetry, ever.** If you ever see a network call from this tool
   to anything other than `api.tailscale.com` or your VPS, that is a bug.
   Please report it.

## Out of scope

The following are intentionally *not* in scope for security reports:

- Vulnerabilities in Tailscale itself, OpenSSH, or other dependencies —
  please report those to the upstream project.
- Misuse scenarios that require the attacker to already be `root` on the
  user's machine.
- Findings that depend on the user voluntarily pasting an obviously
  malicious script that we did not generate.

If you're not sure whether something is in scope, send it anyway. We'll
make the call.
