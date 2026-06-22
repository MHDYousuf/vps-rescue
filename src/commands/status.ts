import { TailscaleClient, TailscaleApiError, pickTailnetIp } from "../lib/tailscale.js";
import { TokenStore } from "../lib/token-store.js";
import { maskSecret, ui } from "../lib/ui.js";

export async function runStatus(): Promise<void> {
  const store = new TokenStore();
  const token = store.get();

  ui.heading("vps-rescue status");
  if (!token) {
    ui.warn("No Tailscale token configured.");
    ui.dim("Run: vps-rescue init");
    return;
  }

  ui.ok(`Token in keychain: ${maskSecret(token)}`);

  try {
    const client = new TailscaleClient(token);
    const devices = await client.listDevices();
    ui.ok(`Tailnet has ${devices.length} device${devices.length === 1 ? "" : "s"}.`);

    if (devices.length === 0) return;

    ui.blank();
    const rows = devices.map((d) => {
      const ip = pickTailnetIp(d) ?? "—";
      const tag = d.tags?.length ? d.tags.join(",") : "";
      return { name: d.name, ip, os: d.os, tag };
    });
    const nameWidth = Math.max(...rows.map((r) => r.name.length), 4);
    const ipWidth = Math.max(...rows.map((r) => r.ip.length), 2);
    const osWidth = Math.max(...rows.map((r) => r.os.length), 2);

    ui.raw(
      `  ${"NAME".padEnd(nameWidth)}  ${"IP".padEnd(ipWidth)}  ${"OS".padEnd(osWidth)}  TAGS`,
    );
    for (const r of rows) {
      ui.raw(
        `  ${r.name.padEnd(nameWidth)}  ${r.ip.padEnd(ipWidth)}  ${r.os.padEnd(osWidth)}  ${r.tag}`,
      );
    }
  } catch (err) {
    if (err instanceof TailscaleApiError) {
      ui.err(
        `Token rejected by Tailscale (HTTP ${err.status}): ${err.apiMessage()}`,
      );
      ui.dim("  → It may have expired. Re-run: vps-rescue init");
    } else {
      ui.err(`Failed to reach Tailscale API: ${(err as Error).message}`);
    }
    process.exit(1);
  }
}
