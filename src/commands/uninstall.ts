import { TokenStore } from "../lib/token-store.js";
import { ui } from "../lib/ui.js";

export async function runUninstall(): Promise<void> {
  const store = new TokenStore();
  if (!store.has()) {
    ui.info("No token to remove.");
    return;
  }
  const ok = store.clear();
  if (ok) {
    ui.ok("Removed Tailscale token from OS keychain.");
  } else {
    ui.warn("Token entry not found in keychain.");
  }
  ui.dim(
    "Note: this does not remove any devices from your Tailscale tailnet. Manage those at https://login.tailscale.com/admin/machines",
  );
}
