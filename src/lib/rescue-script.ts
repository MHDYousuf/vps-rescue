import type { LocalPubkey } from "./pubkey.js";

export interface RescueScriptInput {
  authKey: string;
  hostname: string;
  sshUser: string;
  pubkey: LocalPubkey | null;
}

/**
 * Render the single bash one-liner the user pastes into Hostinger Browser
 * Terminal (or any other root shell on the VPS).
 *
 * What it does on the VPS:
 *   1. Install Tailscale (idempotent, runs install.sh from tailscale.com)
 *   2. Bring it up with the user's pre-authorized key + sane hostname
 *   3. Append the user's local SSH public key to authorized_keys so
 *      VSCode/Cursor Remote-SSH (which uses standard OpenSSH) works through
 *      the tunnel.
 *   4. Print the assigned tailnet IP for confirmation.
 *
 * Designed to be safe to re-run.
 */
export function renderRescueScript(input: RescueScriptInput): string {
  const { authKey, hostname, sshUser, pubkey } = input;

  const sanitizedHostname = sanitize(hostname);
  const sanitizedUser = sanitize(sshUser);

  const lines = [
    "set -euo pipefail",
    "if ! command -v tailscale >/dev/null 2>&1; then",
    "  curl -fsSL https://tailscale.com/install.sh | sh",
    "fi",
    `tailscale up --auth-key='${escapeSingleQuotes(authKey)}' --hostname='${sanitizedHostname}' --ssh --accept-routes`,
  ];

  if (pubkey && pubkey.content) {
    const safePub = escapeSingleQuotes(pubkey.content);
    const home = sanitizedUser === "root" ? "/root" : `/home/${sanitizedUser}`;
    lines.push(
      `install -d -m 700 -o ${sanitizedUser} -g ${sanitizedUser} ${home}/.ssh`,
      `touch ${home}/.ssh/authorized_keys && chmod 600 ${home}/.ssh/authorized_keys`,
      `grep -qxF '${safePub}' ${home}/.ssh/authorized_keys || echo '${safePub}' >> ${home}/.ssh/authorized_keys`,
      `chown ${sanitizedUser}:${sanitizedUser} ${home}/.ssh/authorized_keys`,
    );
  }

  lines.push(
    'echo "------------------------------------------------------------"',
    `echo "vps-rescue: ${sanitizedHostname} joined the tailnet."`,
    'echo "Tailnet IP:  $(tailscale ip -4 || echo unknown)"',
    'echo "Tailnet name: $(tailscale status --self=true --peers=false --json 2>/dev/null | grep -m1 DNSName || true)"',
    'echo "------------------------------------------------------------"',
  );

  return lines.join("\n");
}

function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, "'\\''");
}

function sanitize(value: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error(`Refusing to embed unsafe value: ${JSON.stringify(value)}`);
  }
  return value;
}
