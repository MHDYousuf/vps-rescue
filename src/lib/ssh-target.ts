import type { SshTarget } from "../types.js";

/**
 * Parse strings like `root@72.61.248.136`, `user@host:2222`, `192.0.2.10`.
 * Defaults user to `root` and port to `22` when omitted.
 */
export function parseSshTarget(input: string): SshTarget {
  const raw = input.trim();
  if (!raw) throw new Error("SSH target is empty.");

  let user = "root";
  let rest = raw;
  const atIdx = raw.indexOf("@");
  if (atIdx >= 0) {
    user = raw.slice(0, atIdx);
    rest = raw.slice(atIdx + 1);
  }
  if (!user) throw new Error(`Invalid SSH user in "${input}".`);

  let host = rest;
  let port = 22;
  const colonIdx = rest.lastIndexOf(":");
  if (colonIdx >= 0 && !rest.includes("[")) {
    const portPart = rest.slice(colonIdx + 1);
    if (/^\d+$/.test(portPart)) {
      host = rest.slice(0, colonIdx);
      port = Number(portPart);
    }
  }

  if (!host) throw new Error(`Invalid SSH host in "${input}".`);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid SSH port ${port}.`);
  }
  return { user, host, port };
}

/**
 * Build a friendly Tailscale hostname from a target.
 * Strips characters not allowed in tailnet hostnames (lowercase alphanumeric + hyphen).
 */
export function deriveTailnetHostname(target: SshTarget): string {
  const raw = `${target.host}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
  return raw || "vps-rescue-host";
}
