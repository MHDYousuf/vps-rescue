# vps-rescue

[![npm version](https://img.shields.io/npm/v/vps-rescue.svg?color=blue)](https://www.npmjs.com/package/vps-rescue)
[![CI](https://github.com/MHDYousuf/vps-rescue/actions/workflows/ci.yml/badge.svg)](https://github.com/MHDYousuf/vps-rescue/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/npm/l/vps-rescue.svg?color=green)](https://github.com/MHDYousuf/vps-rescue/blob/main/LICENSE)
[![npm downloads](https://img.shields.io/npm/dm/vps-rescue.svg)](https://www.npmjs.com/package/vps-rescue)
[![GitHub stars](https://img.shields.io/github/stars/MHDYousuf/vps-rescue?style=social)](https://github.com/MHDYousuf/vps-rescue/stargazers)

> Diagnose unreachable VPS SSH connections and auto-provision a Tailscale rescue path — on **your own** Tailscale account. No relay infra, no SaaS, no tunnel data ever touches our servers.

```bash
npx vps-rescue@latest init       # one-time: store your Tailscale API token
npx vps-rescue@latest ssh root@<your-vps-ip>
```

`vps-rescue` exists because Indian (and other) ISPs frequently null-route public IP ranges belonging to budget VPS providers like Hostinger, Contabo, and OVH. The result: `ssh root@your-vps` times out from home Wi-Fi but works from cellular. The VPS is fine, your network is fine — the path between them is broken upstream.

This tool detects that situation in seconds and gives you a 1-paste fix using Tailscale's free tier.

---

## What it does

1. **Diagnoses** why the SSH target is unreachable (DNS, TCP probe, traceroute analysis).
2. If the cause looks like upstream filtering, it **mints a single-use, 5-minute pre-authorized auth key** via the Tailscale API using *your own* personal access token (stored in the OS keychain).
3. Renders a paste-able bash one-liner that installs Tailscale on the VPS, joins your tailnet with a stable hostname, and installs your local SSH pubkey so VSCode / Cursor Remote-SSH keeps working.
4. **Polls** the Tailscale API until the VPS appears in the tailnet.
5. Writes a `Host <alias>` block into `~/.ssh/config` pointing at the new `100.x.x.x` address.
6. Optionally runs `ssh <alias> hostname` to verify end-to-end.

Total user time: **~90 seconds** for the first VPS; ~30 seconds for each subsequent one.

---

## Install

```bash
npx vps-rescue@latest --help
```

Or globally:

```bash
npm install -g vps-rescue
```

Requirements:
- Node.js ≥ 20.0
- A Tailscale account (free tier is fine — 100 devices, 3 users)
- A way to run commands as root on the target VPS (e.g. Hostinger Browser Terminal, IPMI/KVM, recovery shell)
- Tailscale installed on **your local machine** too (download from <https://tailscale.com/download>) and signed in with the same account

---

## Quickstart

### 1. One-time setup

Get a personal API access token from <https://login.tailscale.com/admin/settings/keys>. Pick at least these scopes:

- `auth_keys: write`
- `devices: read`

Then store it:

```bash
vps-rescue init
# or non-interactively:
vps-rescue init --token tskey-api-xxxxxxxxxx
```

The token is stored in your OS keychain (macOS Keychain, Linux libsecret, Windows Credential Vault). It is **never** written to disk in plaintext.

### 2. Rescue a VPS

```bash
vps-rescue ssh root@72.61.248.136
```

Follow the prompts. The flow:

1. Diagnoses the connection (~10 s).
2. Mints a single-use auth key.
3. Prints + copies a bash one-liner to your clipboard.
4. You paste it into the **Hostinger Browser Terminal** (`hPanel → VPS → Browser Terminal`) or any other root shell on the VPS.
5. The tool polls Tailscale until the VPS joins, writes `~/.ssh/config`, and verifies.

Result: `ssh srv1517907` (or whatever alias you chose) works from any network, anywhere.

### 3. Inspect state

```bash
vps-rescue status      # show stored token (masked) and tailnet devices
vps-rescue uninstall   # remove the token from the keychain
```

---

## CLI reference

```text
vps-rescue ssh <target> [options]

  <target>             user@host[:port], e.g. root@72.61.248.136 or admin@vps.example.com:2222
  --alias <name>       Custom SSH alias / tailnet hostname (default: derived from host)
  --force              Provision rescue even if direct SSH already works
  --no-copy            Do not copy the paste-able command to clipboard
  -y, --yes            Skip interactive confirmations (CI-friendly)
```

---

## Security model

Read this before you trust the tool with a root shell.

- **You hold the keys.** `vps-rescue` uses *your* Tailscale API token. We do not operate any relay, control plane, or backend. Every network packet between your Mac and your VPS travels through Tailscale's existing WireGuard mesh, encrypted end-to-end with keys neither we nor Tailscale possess.
- **No plaintext token on disk.** The token lives in the OS keychain (macOS Keychain Services, Linux libsecret, Windows Credential Vault) via `@napi-rs/keyring`.
- **Ephemeral auth keys.** Every rescue mints a fresh key with: `reusable: false`, `preauthorized: true`, `expirySeconds: 300`. Even if intercepted, the window is 5 minutes and the key is single-use.
- **No hidden code execution.** The bash one-liner printed to your terminal is the exact script that runs on your VPS. Read it before pasting. We don't fetch additional payloads; the only network call is the Tailscale install script (`https://tailscale.com/install.sh`), which is the same one Tailscale itself instructs users to run.
- **No telemetry.** This CLI makes exactly two outbound calls: to `api.tailscale.com` (for your tailnet) and to your target VPS. That's it.

If anything in the source looks fishy, please open an issue.

---

## Why not just use Tailscale directly?

You can! `vps-rescue` is a thin orchestration + UX layer on top of Tailscale. We just:

- automate the auth-key creation,
- generate a battle-tested install one-liner (with your pubkey already wired in),
- detect when the rescue path is even needed,
- and update your `~/.ssh/config` for you.

If you're already comfortable doing all that manually, skip the tool. If you're not — or you do this often enough that 5 minutes of friction has compounded into hours — install it.

---

## Caveats

- **Doesn't fix every case.** A few VPS providers also null-route Tailscale's DERP relays. Rare, but it happens. If `tailscale up` itself fails on the VPS, this tool can't help — you're in deeper trouble.
- **Free tier limits.** Tailscale's free plan allows 100 devices and 3 users. Plenty for personal use; you'll hit limits if you have a large fleet.
- **Hostinger Browser Terminal can't be auto-pasted.** Browser security prevents us from injecting commands directly. The flow is "copy here, paste there" — automated only on your end.
- **One-time cost: install Tailscale on your local machine.** Use the Mac App Store version (the Homebrew cask is intermittently broken). On Linux, `curl -fsSL https://tailscale.com/install.sh | sh`.

---

## Available transports

Today `vps-rescue` ships with one rescue transport. The architecture is
pluggable; see [CONTRIBUTING.md](./CONTRIBUTING.md) for how to add more.

| ID | Status | Notes |
|---|---|---|
| `tailscale` | ✅ Shipping | Free up to 100 devices / 3 users. Runs on your own tailnet. |
| `cloudflared` | 🟡 Planned | Cloudflare Tunnel — no account needed for the tunnel itself. |
| `tor` | 🟡 Planned | Last-resort hidden service. Slow but works through almost anything. |
| `ngrok` | 🟡 Planned | Existing ngrok users; free tier has port limitations. |
| `aws-ssm` | 🟡 Planned | AWS Session Manager for EC2 — no SSH at all. |

---

## Roadmap

Possible next features (in rough priority):

- [ ] `cloudflared` transport.
- [ ] OAuth client flow so users don't paste long-lived Tailscale tokens.
- [ ] Direct Hostinger / DigitalOcean / Linode / Vultr API integration to skip the Browser-Terminal paste entirely.
- [ ] `vps-rescue harden` — first-30-minutes-on-a-new-VPS wizard (UFW, non-root user, swap, unattended-upgrades).
- [ ] Outside-vantage diagnostic probe (so we can distinguish "your network" from "the destination" with certainty).
- [ ] `vps-rescue list` / `vps-rescue remove <alias>` — manage devices the tool has provisioned.
- [ ] Detection of Tailscale DERP being blocked + automatic fallback to a self-hosted DERP.
- [ ] Team mode: shared tagged keys for fleets.

---

## Contributing

This project is open source and we welcome contributions. The scope is
deliberately focused — please read [CONTRIBUTING.md](./CONTRIBUTING.md)
before starting work. The most useful things you can contribute:

- A new **transport** (see the dedicated guide in `CONTRIBUTING.md`).
- A new **diagnostic check** (e.g. provider-specific IP-range heuristics).
- A new **provider integration** (so we can skip the Browser-Terminal paste).
- A **hardening module** for `vps-rescue harden` (UFW, deploy user, swap, …).

Architecture overview: [ARCHITECTURE.md](./ARCHITECTURE.md).
Security policy: [SECURITY.md](./SECURITY.md).
Code of Conduct: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

---

## License

MIT — see [LICENSE](./LICENSE).
