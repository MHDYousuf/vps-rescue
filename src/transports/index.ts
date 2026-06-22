import { TailscaleTransport } from "./tailscale.js";
import type { Transport } from "./types.js";

/**
 * The Transport registry.
 *
 * Adding a new transport (Cloudflare Tunnel, Tor hidden service, etc.)?
 * See CONTRIBUTING.md for the full how-to. The short version:
 *   1. Implement the `Transport` interface in `src/transports/<id>.ts`.
 *   2. Register an instance below.
 *   3. Add a unit test covering at least `isConfigured()` + `findExisting()`.
 *   4. Mention the new transport in README.md.
 *
 * Insertion order = default order shown in `--help` / picker UI.
 */
const REGISTRY: Transport[] = [new TailscaleTransport()];

export const DEFAULT_TRANSPORT_ID = "tailscale";

export function listTransports(): readonly Transport[] {
  return REGISTRY;
}

export function getTransport(id: string): Transport {
  const found = REGISTRY.find((t) => t.id === id);
  if (!found) {
    const known = REGISTRY.map((t) => t.id).join(", ");
    throw new Error(
      `Unknown transport "${id}". Available: ${known}.`,
    );
  }
  return found;
}

export type { ProvisionResult, Transport, TransportContext } from "./types.js";
