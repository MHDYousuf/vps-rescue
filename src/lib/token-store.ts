import { Entry } from "@napi-rs/keyring";

const SERVICE = "vps-rescue";
const ACCOUNT = "tailscale-api-token";

/**
 * Reject obviously-wrong token shapes before we even hit the Tailscale API.
 * In particular, auth keys (`tskey-auth-…`) cannot call the REST API and
 * users frequently confuse the two. Caller is responsible for catching.
 */
export function validateApiToken(token: string): void {
  if (!token || token.length < 16) {
    throw new Error("Token is empty or too short to be a Tailscale API token.");
  }
  if (token.startsWith("tskey-auth-")) {
    throw new Error(
      "That looks like an auth key ('tskey-auth-…'), which devices use to join your tailnet. " +
        "You need a personal API access token instead — generate one in the 'API access tokens' section at " +
        "https://login.tailscale.com/admin/settings/keys",
    );
  }
  if (!token.startsWith("tskey-api-")) {
    throw new Error(
      "Token must start with 'tskey-api-'. Generate one in the 'API access tokens' section at " +
        "https://login.tailscale.com/admin/settings/keys",
    );
  }
}

/**
 * Stores the user's Tailscale personal API access token in the OS keychain.
 *
 * - macOS: Keychain Services
 * - Linux: libsecret (gnome-keyring / kwallet)
 * - Windows: Credential Vault
 *
 * Tokens are NEVER written to plaintext files on disk.
 */
export class TokenStore {
  private entry: Entry;

  constructor() {
    this.entry = new Entry(SERVICE, ACCOUNT);
  }

  set(token: string): void {
    validateApiToken(token);
    this.entry.setPassword(token);
  }

  get(): string | null {
    try {
      return this.entry.getPassword();
    } catch {
      return null;
    }
  }

  clear(): boolean {
    try {
      return this.entry.deletePassword();
    } catch {
      return false;
    }
  }

  has(): boolean {
    return this.get() !== null;
  }
}
