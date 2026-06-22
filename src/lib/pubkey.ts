import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CANDIDATE_KEYS = [
  "id_ed25519.pub",
  "id_rsa.pub",
  "id_ecdsa.pub",
  "id_dsa.pub",
] as const;

export interface LocalPubkey {
  path: string;
  content: string;
  fingerprintHint: string;
}

/**
 * Find the user's local SSH public key. Prefers ed25519.
 * Returns null if no public key is found.
 */
export async function findLocalPubkey(): Promise<LocalPubkey | null> {
  const sshDir = join(homedir(), ".ssh");
  for (const file of CANDIDATE_KEYS) {
    const path = join(sshDir, file);
    try {
      const content = (await readFile(path, "utf8")).trim();
      if (!content) continue;
      return {
        path,
        content,
        fingerprintHint: extractFingerprintHint(content),
      };
    } catch {
      // Try next candidate
    }
  }
  return null;
}

/**
 * Pull the trailing comment field out of an OpenSSH public key line.
 * Returns the comment (typically the email/user@host) for display purposes.
 */
function extractFingerprintHint(pubkey: string): string {
  const parts = pubkey.trim().split(/\s+/);
  if (parts.length >= 3) return parts.slice(2).join(" ");
  return parts[0] ?? "unknown";
}
