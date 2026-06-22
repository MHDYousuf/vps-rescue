import { Command } from "commander";

import { runInit } from "./commands/init.js";
import { runSshRescue } from "./commands/ssh.js";
import { runStatus } from "./commands/status.js";
import { runUninstall } from "./commands/uninstall.js";
import { ui } from "./lib/ui.js";
import { DEFAULT_TRANSPORT_ID, listTransports } from "./transports/index.js";

const PROGRAM = "vps-rescue";
const VERSION = "0.1.0";

const transportListForHelp = listTransports()
  .map((t) => t.id)
  .join("|");

const program = new Command();
program
  .name(PROGRAM)
  .version(VERSION)
  .description(
    "Diagnose unreachable VPS SSH connections and provision a rescue path through pluggable tunnel transports (Tailscale today; Cloudflare Tunnel, Tor, … tomorrow). Runs on your own credentials — we operate no relay infrastructure.",
  )
  .showHelpAfterError();

program
  .command("init")
  .description("Configure credentials for a rescue transport.")
  .option(
    "--transport <id>",
    `Rescue transport to configure (${transportListForHelp})`,
    DEFAULT_TRANSPORT_ID,
  )
  .option("--token <token>", "Transport-specific token (non-interactive)")
  .action(async (opts: { token?: string; transport?: string }) => {
    await runInit(opts);
  });

program
  .command("status")
  .description("Show stored credentials (masked) and known rescue devices.")
  .action(async () => {
    await runStatus();
  });

program
  .command("uninstall")
  .description("Remove the stored Tailscale token from the OS keychain.")
  .action(async () => {
    await runUninstall();
  });

program
  .command("ssh <target>", { isDefault: true })
  .description(
    "Diagnose connectivity to <user@host[:port]> and, if needed, provision a rescue path.",
  )
  .option("--alias <name>", "Custom SSH alias / rescue device hostname")
  .option(
    "--transport <id>",
    `Rescue transport to use (${transportListForHelp})`,
    DEFAULT_TRANSPORT_ID,
  )
  .option("--force", "Provision rescue even if direct SSH works or a device already exists")
  .option("--no-copy", "Do not copy the paste-able command to clipboard")
  .option("-y, --yes", "Skip interactive confirmations")
  .action(async (target: string, opts: Record<string, unknown>) => {
    await runSshRescue(target, {
      alias: typeof opts.alias === "string" ? opts.alias : undefined,
      transport:
        typeof opts.transport === "string" ? opts.transport : undefined,
      force: opts.force === true,
      noCopy: opts.copy === false,
      yes: opts.yes === true,
    });
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  ui.err(`Unhandled error: ${(err as Error).message}`);
  if (process.env.VPS_RESCUE_DEBUG) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  process.exit(1);
});
