import { DEFAULT_TRANSPORT_ID, getTransport } from "../transports/index.js";
import { ui } from "../lib/ui.js";

export interface InitOptions {
  token?: string;
  transport?: string;
}

/**
 * `vps-rescue init [--transport <id>] [--token <…>]`
 *
 * Delegates configuration to the chosen transport's `setup()` method.
 * Anything the user passes on the command line is forwarded to the
 * transport as an `unattended` payload so non-interactive runs keep working.
 */
export async function runInit(opts: InitOptions): Promise<void> {
  const id = opts.transport ?? DEFAULT_TRANSPORT_ID;
  try {
    const transport = getTransport(id);
    const unattended: Record<string, string> = {};
    if (opts.token) unattended.token = opts.token;
    await transport.setup(unattended);
  } catch (err) {
    ui.err((err as Error).message);
    process.exit(1);
  }
}
