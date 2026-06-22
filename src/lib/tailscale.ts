import type { TailscaleAuthKey, TailscaleDevice } from "../types.js";

const API_BASE = "https://api.tailscale.com/api/v2";

export interface CreateAuthKeyOptions {
  hostname: string;
  expirySeconds?: number;
  tags?: string[];
  ephemeral?: boolean;
  reusable?: boolean;
  preauthorized?: boolean;
}

export class TailscaleApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = "TailscaleApiError";
  }

  /**
   * Try to extract the human-readable `message` field from a Tailscale error
   * response body. Falls back to a truncated raw body when the JSON shape is
   * unexpected, so callers can always show *something* useful.
   */
  apiMessage(): string {
    if (!this.body) return "(empty response body)";
    try {
      const parsed = JSON.parse(this.body) as { message?: string };
      if (typeof parsed.message === "string" && parsed.message.length > 0) {
        return parsed.message;
      }
    } catch {
      // not JSON, fall through
    }
    return this.body.length > 200 ? `${this.body.slice(0, 200)}…` : this.body;
  }
}

/**
 * Tailscale auth-key descriptions allow only alphanumeric characters,
 * hyphens, and spaces, up to 50 characters total.
 * See: https://github.com/tailscale/tailscale/blob/main/api.md#create-auth-key
 *
 * Exported so we can unit-test the rule (regression guard for the colon bug
 * that returned HTTP 400 in v0.1.0-dev).
 */
export function sanitizeDescription(input: string): string {
  const cleaned = input
    .replace(/[^a-zA-Z0-9 -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 50);
}

/**
 * Minimal Tailscale REST API client.
 *
 * Uses the special tailnet identifier `-` which resolves to the default
 * tailnet for the calling API token.
 * https://tailscale.com/api
 */
export class TailscaleClient {
  constructor(private readonly token: string) {
    if (!token.startsWith("tskey-api-")) {
      throw new Error(
        "Tailscale REST API requires a personal access token starting with 'tskey-api-'. " +
          "Auth keys ('tskey-auth-…') can only be used by devices joining the tailnet, " +
          "not for API calls.",
      );
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new TailscaleApiError(
        `Tailscale API ${method} ${path} failed: ${res.status} ${res.statusText}`,
        res.status,
        text,
      );
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  /**
   * Mint a single-use, pre-authorized auth key with a short TTL.
   * Default: 5 minute expiry, single-use, persistent device (not ephemeral),
   * no tags (lives under the user's own identity).
   */
  async createAuthKey(opts: CreateAuthKeyOptions): Promise<TailscaleAuthKey> {
    const {
      expirySeconds = 300,
      tags,
      ephemeral = false,
      reusable = false,
      preauthorized = true,
    } = opts;

    const create: Record<string, unknown> = {
      reusable,
      ephemeral,
      preauthorized,
    };
    if (tags && tags.length > 0) create.tags = tags;

    interface CreateKeyResponse {
      id: string;
      key: string;
      expires: string;
    }

    const data = await this.request<CreateKeyResponse>(
      "POST",
      "/tailnet/-/keys",
      {
        capabilities: { devices: { create } },
        expirySeconds,
        description: sanitizeDescription(`vps-rescue ${opts.hostname}`),
      },
    );

    return data;
  }

  async listDevices(): Promise<TailscaleDevice[]> {
    interface DevicesResponse {
      devices: TailscaleDevice[];
    }
    const data = await this.request<DevicesResponse>("GET", "/tailnet/-/devices");
    return data.devices;
  }

  /**
   * Poll for a newly-provisioned device by hostname.
   * Returns the first matching device or null on timeout.
   */
  async waitForDevice(
    hostname: string,
    opts: { timeoutMs?: number; intervalMs?: number } = {},
  ): Promise<TailscaleDevice | null> {
    const { timeoutMs = 180_000, intervalMs = 4_000 } = opts;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const devices = await this.listDevices();
      const match = devices.find(
        (d) =>
          d.hostname === hostname ||
          d.name.startsWith(`${hostname}.`) ||
          d.name === hostname,
      );
      if (match) return match;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return null;
  }

  /**
   * Verify the token works and return the tailnet name.
   * Calls /tailnet/-/devices as a lightweight probe.
   */
  async verifyToken(): Promise<{ ok: true; deviceCount: number }> {
    const devices = await this.listDevices();
    return { ok: true, deviceCount: devices.length };
  }
}

/**
 * Pick the primary IPv4 address from a device (the 100.x.x.x tailnet IP).
 */
export function pickTailnetIp(device: TailscaleDevice): string | null {
  const v4 = device.addresses.find(
    (a) => /^100\./.test(a) && !a.includes(":"),
  );
  return v4 ?? null;
}
