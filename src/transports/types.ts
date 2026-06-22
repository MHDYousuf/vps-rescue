import type { LocalPubkey } from "../lib/pubkey.js";
import type { SshTarget } from "../types.js";

/**
 * Context handed to a Transport for either a lookup or a full provision.
 *
 * Transports are passed a *suggested* alias and target; they may translate
 * them however they need (e.g. Tailscale enforces DNS-label rules).
 */
export interface TransportContext {
  /** Stable identifier for the rescue device (e.g. `srv1517907`). */
  alias: string;
  /** Original SSH target the user typed, for reference. */
  target: SshTarget;
  /** Local SSH public key to install on the VPS, if discoverable. */
  pubkey: LocalPubkey | null;
  /** Skip interactive prompts (`--yes`). */
  yes: boolean;
  /** Override idempotency / reuse checks (`--force`). */
  force: boolean;
  /** Skip clipboard side-effects (`--no-copy`). */
  noCopy: boolean;
}

/**
 * Result of either finding an existing device or running a full provision.
 *
 * `sshHostname` is what gets written into ~/.ssh/config (a tailnet 100.x.x.x
 * for Tailscale, a hostname.cfargotunnel.com for Cloudflare Tunnel, etc.).
 */
export interface ProvisionResult {
  /** Hostname or IP for the resulting SSH config Host block. */
  sshHostname: string;
  /** Optional friendly display name (e.g. tailnet DNS name). */
  displayName?: string;
  /** True when we reused an existing device rather than creating a new one. */
  reused: boolean;
  /** Extra freeform info lines to print after success (e.g. "Tailscale SSH: tailscale ssh <user>@<alias>"). */
  postInstructions?: string[];
}

/**
 * Pluggable rescue transport. Implement this once per technology
 * (Tailscale, Cloudflare Tunnel, Tor hidden service, etc.).
 *
 * Lifecycle from the orchestrator's view:
 *
 *   1. `isConfigured()` — cheap, no I/O if possible.
 *      If false, the orchestrator suggests `vps-rescue init --transport <id>`.
 *
 *   2. `findExisting(ctx)` — best-effort idempotency check.
 *      Returning a result lets the orchestrator skip the paste step entirely.
 *
 *   3. `provision(ctx)` — interactive rescue. May render scripts, mint
 *      auth artifacts, poll, etc. Returns when the device is reachable
 *      via the transport's address space.
 *
 * Transports OWN their user interaction (paste prompts, spinners, etc.).
 * Transport-agnostic concerns (diagnosis, ~/.ssh/config writes, verify
 * `ssh <alias> hostname`) stay in `commands/ssh.ts`.
 */
export interface Transport {
  /** Stable id used in flags + persisted state. lowercase, hyphenated. */
  readonly id: string;
  /** Short human label for prompts and `--help` output. */
  readonly label: string;
  /** One-sentence summary for `vps-rescue transports list`. */
  readonly description: string;

  /**
   * Whether this transport has the credentials / prerequisites it needs to
   * run. Should be fast and non-interactive.
   */
  isConfigured(): Promise<boolean>;

  /**
   * Walk the user through one-time setup (e.g. paste an API token).
   * Invoked by `vps-rescue init [--transport <id>]`.
   *
   * @param unattended Optional pre-supplied values for non-interactive use
   *   (e.g. `{ token: "tskey-api-…" }` from `--token`). Transports decide
   *   which keys they recognize.
   */
  setup(unattended?: Record<string, string>): Promise<void>;

  /**
   * Look up an already-provisioned device for this alias. Returning a
   * result lets the orchestrator short-circuit and just rewrite SSH config.
   *
   * Implementations SHOULD fail open (return null on transient API errors)
   * so a failed lookup doesn't block a real rescue.
   */
  findExisting(ctx: TransportContext): Promise<ProvisionResult | null>;

  /**
   * Run the full interactive rescue flow. Throws on unrecoverable errors;
   * the orchestrator will surface the message.
   */
  provision(ctx: TransportContext): Promise<ProvisionResult>;
}
