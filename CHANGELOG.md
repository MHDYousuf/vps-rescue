# Changelog

All notable changes to `vps-rescue` are documented here.
This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Linux clipboard auto-copy now detects missing `xclip` / `xsel` helpers and
  prints an install tip instead of the generic copy failure warning.

## [0.1.0] — 2026-06-22

Initial public release. Diagnoses unreachable VPS SSH connections caused by
upstream routing / ISP filtering and provisions a Tailscale rescue path on
the user's own Tailscale account — no relay infrastructure operated by us.

### Added

- `vps-rescue init` — store a Tailscale personal API access token in the OS
  keychain (`@napi-rs/keyring`: macOS Keychain, Linux libsecret, Windows
  Credential Vault). Never written to plaintext on disk.
- `vps-rescue ssh <target>` — full diagnose → mint → paste → poll → SSH
  rescue flow. Default command.
  - Diagnoses TCP connectivity, DNS, and traceroute, producing one of:
    `reachable`, `isp_blocked`, `path_blocked`, `host_offline`,
    `dns_failure`, `unknown`.
  - Mints a single-use, pre-authorized auth key with a 5-minute TTL via the
    Tailscale REST API.
  - Renders a paste-able bash one-liner that installs Tailscale, joins the
    tailnet with a stable hostname, and appends the user's local SSH public
    key to `authorized_keys` for standard SSH (Cursor / VSCode Remote-SSH).
  - Polls the Tailscale API until the device appears, writes a managed
    `Host <alias>` block to `~/.ssh/config`, and offers a verification
    `ssh <alias> hostname` test.
- `vps-rescue status` — show the masked stored token and current tailnet
  devices in a table.
- `vps-rescue uninstall` — remove the stored token from the OS keychain.
- `--force` to override "already reachable" and "host offline" short-circuits.
- `--alias <name>` for a custom SSH alias / tailnet hostname.
- `--no-copy` to skip the clipboard copy.
- `-y, --yes` for non-interactive runs.
- Idempotent re-runs: if a tailnet device with the matching hostname
  already exists, the tool skips minting and just refreshes the SSH config.

### Security

- Tokens are stored only in the OS keychain via `@napi-rs/keyring`. No
  plaintext on disk.
- Token validation rejects auth keys (`tskey-auth-…`) before any network
  call and explains the difference to the user.
- Auth keys minted by the rescue flow are `reusable: false`,
  `preauthorized: true`, `expirySeconds: 300`. Five-minute blast radius even
  if intercepted.
- All values embedded in the rescue bash script are sanitized
  (`escapeForBashC`) and the hostname / SSH user are validated against a
  strict alphanumeric pattern to prevent shell injection.
- No telemetry. Outbound network is exactly two endpoints: `api.tailscale.com`
  and (during the verify step) the target VPS.

### Tested

- Unit tests for `sanitizeDescription`, `parseSshTarget`,
  `deriveTailnetHostname`, and `escapeForBashC` — including a live
  round-trip of escaped strings through a real `bash -c` subprocess to
  guard against shell-quoting regressions.
- End-to-end manual validation on a fresh, ISP-blocked Hostinger VPS:
  diagnose → paste → SSH worked in ~90 seconds.

[0.1.0]: https://github.com/MHDYousuf/vps-rescue/releases/tag/v0.1.0
