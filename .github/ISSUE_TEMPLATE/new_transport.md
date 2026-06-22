---
name: New transport proposal
about: Propose adding a new rescue transport (Cloudflare Tunnel, Tor, ngrok, …)
title: "[transport] "
labels: ["type: transport"]
assignees: []
---

## Transport name

<!-- e.g. "Cloudflare Tunnel (cloudflared)" -->

Proposed `id` (lowercase, hyphenated, stable forever): `<id>`

## Why this transport?

<!-- What user case does it serve that the existing transports don't? -->

## User-facing flow

Describe the rescue UX end to end, paste-by-paste. Example:

1. `vps-rescue init --transport <id>` →
2. `vps-rescue ssh root@<ip> --transport <id>` →
3. We render a script that does **X** on the VPS →
4. The user pastes it into **Y** →
5. We poll **Z** until the device appears →
6. We write `Host <alias>` pointing at `<hostname>` in `~/.ssh/config`.

## Credentials & trust model

- What credential does the user supply? (API token, OAuth, etc.)
- Where is it stored? (OS keychain, please.)
- What's the blast radius if it leaks?
- Does this transport's vendor see traffic between the user and their VPS? **It must not.**

## Failure modes

What happens if:
- The transport's API is down?
- The user pastes the script on the wrong VPS?
- The user re-runs the rescue against a host that's already provisioned?

## Implementation sketch

<!-- Optional: pseudocode or a file outline. See
     [src/transports/tailscale.ts](../src/transports/tailscale.ts) for the reference. -->

## Scope check

- [ ] Implementable as a single file in `src/transports/<id>.ts`.
- [ ] User owns all credentials; no operator-side service required.
- [ ] No closed-source dependencies.
- [ ] Tests planned for `isConfigured()`, `findExisting()`, and any string
      templating.
