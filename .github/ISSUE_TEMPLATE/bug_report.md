---
name: Bug report
about: Something is broken or not behaving as documented
title: "[bug] "
labels: ["type: bug"]
assignees: []
---

## What happened

<!-- A clear, terse description of the bug. -->

## What you expected

<!-- What did you think would happen? -->

## Reproduction

```bash
# Exact command(s) you ran
vps-rescue ssh root@example.com --transport tailscale
```

**Full output** (use `VPS_RESCUE_DEBUG=1` to include stack traces):

```text
<paste here>
```

## Environment

- `vps-rescue --version`: <!-- e.g. 0.1.0 -->
- Node.js: <!-- `node --version` -->
- OS: <!-- e.g. macOS 14.5, Ubuntu 24.04 -->
- Shell: <!-- bash 5.2, zsh 5.9, fish 3.7 -->
- Transport: <!-- tailscale / cloudflared / ... -->

## Anything else?

<!-- Logs from the VPS, screenshots of `vps-rescue status`, etc.
     Remember to redact tokens, IPs, and any PII before sharing. -->
