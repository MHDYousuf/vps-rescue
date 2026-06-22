import ora from "ora";
import prompts from "prompts";

import { escapeForBashC } from "../lib/bash-escape.js";
import { copyToClipboard } from "../lib/clipboard.js";
import { renderRescueScript } from "../lib/rescue-script.js";
import {
  TailscaleApiError,
  TailscaleClient,
  pickTailnetIp,
} from "../lib/tailscale.js";
import { TokenStore, validateApiToken } from "../lib/token-store.js";
import { colors, maskSecret, ui } from "../lib/ui.js";
import type {
  ProvisionResult,
  Transport,
  TransportContext,
} from "./types.js";

/**
 * Tailscale rescue transport.
 *
 * Provisioning flow:
 *   1. Mint a single-use, pre-authorized auth key (5 min TTL) via the
 *      user's own Tailscale API access token.
 *   2. Render a bash one-liner that installs Tailscale on the VPS, joins
 *      the tailnet, and installs the user's local SSH pubkey.
 *   3. Copy the one-liner to clipboard; ask the user to paste it into a
 *      root shell on the VPS (Hostinger Browser Terminal, KVM, etc.).
 *   4. Poll Tailscale's REST API until the device appears, then return
 *      its 100.x.x.x address as the SSH config target.
 *
 * The transport never sees a packet between the user and their VPS.
 */
export class TailscaleTransport implements Transport {
  readonly id = "tailscale";
  readonly label = "Tailscale";
  readonly description =
    "Free zero-config WireGuard mesh. Recommended default. Requires a Tailscale account.";

  private readonly store = new TokenStore();

  async isConfigured(): Promise<boolean> {
    return this.store.has();
  }

  async setup(unattended?: Record<string, string>): Promise<void> {
    ui.heading("Configure Tailscale API access");
    ui.dim(
      "vps-rescue uses your own Tailscale account. Your token is stored only in the OS keychain, never on disk.",
    );
    ui.blank();
    ui.info(
      "Generate a personal access token in the 'API access tokens' section at:\n  https://login.tailscale.com/admin/settings/keys",
    );
    ui.dim(
      "It must start with 'tskey-api-' (NOT 'tskey-auth-'). Suggested TTL: 90 days.",
    );
    ui.blank();

    let token = unattended?.token;
    if (!token) {
      const response = await prompts(
        {
          type: "password",
          name: "token",
          message: "Paste your Tailscale API access token (tskey-api-…):",
          validate: (value: string) => {
            try {
              validateApiToken(value);
              return true;
            } catch (err) {
              return (err as Error).message;
            }
          },
        },
        { onCancel: () => process.exit(130) },
      );
      token = response.token as string | undefined;
    }
    if (!token) {
      ui.err("No token provided.");
      process.exit(1);
    }
    try {
      validateApiToken(token);
    } catch (err) {
      ui.err((err as Error).message);
      process.exit(1);
    }

    ui.info(`Verifying token ${maskSecret(token)} against Tailscale API...`);
    try {
      const client = new TailscaleClient(token);
      const result = await client.verifyToken();
      ui.ok(
        `Token works. Tailnet currently has ${result.deviceCount} device${result.deviceCount === 1 ? "" : "s"}.`,
      );
    } catch (err) {
      if (err instanceof TailscaleApiError) {
        ui.err(
          `Tailscale rejected this token (HTTP ${err.status}): ${err.apiMessage()}`,
        );
        if (err.status === 401) {
          ui.dim(
            "  → The token may be expired, revoked, or not a personal API access token.",
          );
        }
      } else {
        ui.err(`Could not reach Tailscale API: ${(err as Error).message}`);
      }
      process.exit(1);
    }

    this.store.set(token);
    ui.ok("Token saved to OS keychain (service: vps-rescue).");
    ui.blank();
    ui.info("Next:  vps-rescue ssh root@<your-vps-ip>");
  }

  async findExisting(ctx: TransportContext): Promise<ProvisionResult | null> {
    const client = this.getClient();
    try {
      const devices = await client.listDevices();
      const match = devices.find(
        (d) =>
          d.hostname === ctx.alias ||
          d.name === ctx.alias ||
          d.name.startsWith(`${ctx.alias}.`),
      );
      if (!match) return null;
      const tailnetIp = pickTailnetIp(match);
      if (!tailnetIp) return null;
      return {
        sshHostname: tailnetIp,
        displayName: match.name,
        reused: true,
        postInstructions: [
          `tailscale ssh ${ctx.target.user}@${ctx.alias}   # Tailscale SSH (no key needed)`,
        ],
      };
    } catch {
      // Fail open: a transient list failure shouldn't block a real provision.
      return null;
    }
  }

  async provision(ctx: TransportContext): Promise<ProvisionResult> {
    const client = this.getClient();
    const token = this.store.get();
    if (token) ui.ok(`Using token ${maskSecret(token)} from OS keychain.`);

    ui.blank();
    ui.info("Minting single-use auth key (5 min TTL)...");
    let authKey: string;
    try {
      const key = await client.createAuthKey({
        hostname: ctx.alias,
        expirySeconds: 300,
        reusable: false,
        ephemeral: false,
        preauthorized: true,
      });
      authKey = key.key;
      ui.ok(`Got pre-authorized key (id: ${key.id}, expires ${key.expires}).`);
    } catch (err) {
      if (err instanceof TailscaleApiError) {
        const detail = err.apiMessage();
        if (err.status === 401 || err.status === 403) {
          throw new Error(
            `Tailscale rejected the auth-key request (HTTP ${err.status}): ${detail}. Token may be expired or lack required permissions. Re-run: vps-rescue init`,
          );
        }
        throw new Error(
          `Tailscale rejected the auth-key request (HTTP ${err.status}): ${detail}`,
        );
      }
      throw err;
    }

    ui.blank();
    ui.info("Building paste-able rescue command...");
    if (ctx.pubkey) {
      ui.ok(`Will install local pubkey: ${ctx.pubkey.path}`);
      ui.dim(`  ${ctx.pubkey.fingerprintHint}`);
    } else {
      ui.warn(
        "No local SSH public key found in ~/.ssh. Standard SSH (Cursor / VSCode Remote-SSH) will require Tailscale SSH only.",
      );
      ui.dim(
        '  Generate one with: ssh-keygen -t ed25519 -C "$(whoami)@$(hostname -s)"',
      );
    }

    const script = renderRescueScript({
      authKey,
      hostname: ctx.alias,
      sshUser: ctx.target.user,
      pubkey: ctx.pubkey,
    });
    const oneLiner = `bash -c $'${escapeForBashC(script)}'`;

    ui.blank();
    ui.raw(colors.bold("Paste this into your VPS's root shell:"));
    ui.dim("  Hostinger: hPanel → VPS → Browser Terminal");
    ui.dim("  DigitalOcean: droplet → Console");
    ui.dim("  Or any SSH session you can already reach the VPS through.");
    ui.blank();
    ui.raw(colors.cyan("---8<--- BEGIN ---8<---"));
    ui.raw(oneLiner);
    ui.raw(colors.cyan("---8<---  END  ---8<---"));
    ui.blank();

    if (!ctx.noCopy) {
      const copyResult = await copyToClipboard(oneLiner);
      if (copyResult.ok) {
        ui.ok("Copied to clipboard.");
      } else if (copyResult.reason === "linux-missing-helper") {
        ui.info(copyResult.message);
      } else {
        ui.warn("Could not copy to clipboard automatically.");
      }
    }

    if (!ctx.yes) {
      const pasted = await prompts({
        type: "confirm",
        name: "done",
        message:
          "After you paste it on the VPS and see the success banner, press Enter to poll Tailscale...",
        initial: true,
      });
      if (!pasted.done) {
        throw new Error("Cancelled before polling.");
      }
    }

    ui.blank();
    ui.info(
      `Waiting for "${ctx.alias}" to appear in your tailnet (up to 3 min)...`,
    );
    const pollSpinner = ora("Polling Tailscale API every 4s").start();
    const device = await client.waitForDevice(ctx.alias, {
      timeoutMs: 180_000,
      intervalMs: 4_000,
    });

    if (!device) {
      pollSpinner.fail(
        `Device "${ctx.alias}" did not appear within the timeout window.`,
      );
      throw new Error(
        "Device did not register. Check that `tailscale up` succeeded on the VPS and re-run.",
      );
    }

    const tailnetIp = pickTailnetIp(device);
    pollSpinner.succeed(
      `Device joined tailnet: ${device.name} (${tailnetIp ?? device.addresses[0] ?? "?"})`,
    );

    if (!tailnetIp) {
      throw new Error(
        "Device has no IPv4 tailnet address. Aborting SSH config write.",
      );
    }

    return {
      sshHostname: tailnetIp,
      displayName: device.name,
      reused: false,
      postInstructions: [
        `tailscale ssh ${ctx.target.user}@${ctx.alias}   # Tailscale SSH (no key needed)`,
      ],
    };
  }

  /**
   * Lazy-instantiate a Tailscale API client from the keychain-stored token.
   * Throws (rather than returning null) so `provision()` failure modes stay
   * uniform.
   */
  private getClient(): TailscaleClient {
    const token = this.store.get();
    if (!token) {
      throw new Error(
        "No Tailscale token configured. Run: vps-rescue init --transport tailscale",
      );
    }
    return new TailscaleClient(token);
  }
}
