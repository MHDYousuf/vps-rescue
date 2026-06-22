import { spawn } from "node:child_process";

import ora from "ora";
import prompts from "prompts";

import { diagnose } from "../lib/diagnose.js";
import { findLocalPubkey } from "../lib/pubkey.js";
import { upsertSshHost } from "../lib/ssh-config.js";
import { deriveTailnetHostname, parseSshTarget } from "../lib/ssh-target.js";
import { colors, ui } from "../lib/ui.js";
import {
  DEFAULT_TRANSPORT_ID,
  getTransport,
  listTransports,
} from "../transports/index.js";
import type {
  ProvisionResult,
  Transport,
  TransportContext,
} from "../transports/index.js";
import type { DiagnosisVerdict, SshTarget } from "../types.js";

export interface SshCommandOptions {
  alias?: string;
  force?: boolean;
  noCopy?: boolean;
  yes?: boolean;
  transport?: string;
}

/**
 * Orchestrates a rescue:
 *   1. Diagnose the SSH path (transport-agnostic).
 *   2. Decide whether to short-circuit (reachable / host_offline / dns_failure).
 *   3. Pick a Transport (default: tailscale).
 *   4. Reuse-existing or full-provision via the transport.
 *   5. Write SSH config + optionally run a verify test.
 */
export async function runSshRescue(
  rawTarget: string,
  opts: SshCommandOptions,
): Promise<void> {
  const target = parseSshTarget(rawTarget);
  const alias = (opts.alias ?? deriveTailnetHostname(target)).trim();
  ui.heading(`vps-rescue → ${target.user}@${target.host}:${target.port}`);

  const verdict = await runDiagnose(target);

  if (verdict === "reachable" && !opts.force) {
    ui.ok("Direct SSH already works from this machine. No rescue needed.");
    ui.dim("Re-run with --force to provision a rescue transport anyway.");
    return;
  }
  if (verdict === "dns_failure") {
    ui.err("DNS lookup failed. Fix DNS first, then re-run.");
    process.exit(1);
  }
  if (verdict === "host_offline" && !opts.force) {
    ui.warn(
      "The VPS responds to ICMP but the SSH port is closed. A tunnel will not help — fix sshd or the VPS firewall instead.",
    );
    ui.dim("Re-run with --force to provision a rescue transport anyway.");
    return;
  }

  const transport = pickTransport(opts.transport);
  if (!(await transport.isConfigured())) {
    ui.err(
      `Transport "${transport.label}" is not configured. Run: vps-rescue init --transport ${transport.id}`,
    );
    process.exit(1);
  }

  if (!opts.yes) {
    const proceed = await prompts({
      type: "confirm",
      name: "go",
      message: `${confirmMessageFor(verdict)} (transport: ${transport.label})`,
      initial: true,
    });
    if (!proceed.go) {
      ui.warn("Cancelled.");
      return;
    }
  }

  const pubkey = await findLocalPubkey();
  const ctx: TransportContext = {
    alias,
    target,
    pubkey,
    yes: opts.yes === true,
    force: opts.force === true,
    noCopy: opts.noCopy === true,
  };

  ui.blank();
  ui.info(`Using transport: ${colors.bold(transport.label)} (${transport.id})`);

  let result: ProvisionResult;
  if (!opts.force) {
    const existing = await transport.findExisting(ctx);
    if (existing) {
      ui.ok(
        `Device "${alias}" already exists on ${transport.label} (${existing.sshHostname}). Reusing.`,
      );
      if (existing.displayName) ui.dim(`  Name: ${existing.displayName}`);
      result = existing;
    } else {
      result = await runProvision(transport, ctx);
    }
  } else {
    result = await runProvision(transport, ctx);
  }

  await writeSshAlias({ alias, target, result });
  ui.blank();
  ui.heading("Done");
  ui.raw(
    `  ${colors.bold("ssh " + alias)}              # standard SSH (uses your local key)`,
  );
  for (const line of result.postInstructions ?? []) {
    ui.raw(`  ${colors.bold(line)}`);
  }
  ui.blank();

  if (!opts.yes) {
    await maybeRunVerifyTest(alias);
  }
}

async function runDiagnose(target: SshTarget): Promise<DiagnosisVerdict> {
  ui.step(1, 3, "Diagnosing connectivity...");
  const diagSpinner = ora("Running TCP probe + traceroute").start();
  let verdict: DiagnosisVerdict = "unknown";
  let details: string[] = [];
  try {
    const result = await diagnose(target);
    verdict = result.verdict;
    details = result.details;
    applyVerdictToSpinner(diagSpinner, verdict);
  } catch (err) {
    diagSpinner.fail(`Diagnosis failed: ${(err as Error).message}`);
  }
  details.forEach((d) => ui.dim(`  ${d}`));
  ui.blank();
  return verdict;
}

async function runProvision(
  transport: Transport,
  ctx: TransportContext,
): Promise<ProvisionResult> {
  ui.step(2, 3, `Provisioning via ${transport.label}...`);
  try {
    return await transport.provision(ctx);
  } catch (err) {
    ui.err((err as Error).message);
    process.exit(1);
  }
}

interface WriteSshAliasInput {
  alias: string;
  target: SshTarget;
  result: ProvisionResult;
}

async function writeSshAlias(input: WriteSshAliasInput): Promise<void> {
  ui.step(3, 3, "Writing ~/.ssh/config alias...");
  const configPath = await upsertSshHost({
    alias: input.alias,
    hostname: input.result.sshHostname,
    user: input.target.user,
    port: input.target.port === 22 ? undefined : input.target.port,
  });
  ui.ok(`Wrote alias to ${configPath}: ${colors.bold(input.alias)}`);
}

async function maybeRunVerifyTest(alias: string): Promise<void> {
  const test = await prompts({
    type: "confirm",
    name: "test",
    message: `Run "ssh ${alias} hostname" now to verify?`,
    initial: true,
  });
  if (!test.test) return;
  const ok = await runShellTest(alias);
  if (ok) {
    ui.ok("Connection verified.");
  } else {
    ui.warn(
      "Test SSH failed. If you do not have Tailscale installed locally, install it from https://tailscale.com/download and sign in with the same account.",
    );
  }
}

function pickTransport(id: string | undefined): Transport {
  const chosen = id ?? DEFAULT_TRANSPORT_ID;
  try {
    return getTransport(chosen);
  } catch (err) {
    ui.err((err as Error).message);
    ui.dim(
      `  Available transports: ${listTransports()
        .map((t) => t.id)
        .join(", ")}`,
    );
    process.exit(1);
  }
}

function verdictHeadline(verdict: DiagnosisVerdict): string {
  switch (verdict) {
    case "reachable":
      return "Direct connection works.";
    case "isp_blocked":
      return "Your ISP appears to be null-routing this VPS.";
    case "path_blocked":
      return "Path to VPS is blocked upstream (transit, peering, or destination ingress).";
    case "dns_failure":
      return "DNS lookup failed.";
    case "host_offline":
      return "VPS is reachable but the SSH port is closed.";
    case "unknown":
      return "Could not reach VPS — cause inconclusive.";
    default: {
      const exhaustive: never = verdict;
      return exhaustive;
    }
  }
}

function confirmMessageFor(verdict: DiagnosisVerdict): string {
  switch (verdict) {
    case "isp_blocked":
      return "Your ISP appears to be blocking this VPS. Provision a rescue transport?";
    case "path_blocked":
      return "Packets are being dropped upstream. A tunnel routes around it. Provision now?";
    case "host_offline":
      return "Host responds but SSH port is closed. Provision a rescue transport anyway?";
    case "reachable":
    case "dns_failure":
    case "unknown":
      return "Could not reach the VPS. Try a rescue transport anyway?";
    default: {
      const exhaustive: never = verdict;
      return exhaustive;
    }
  }
}

type DiagSpinner = ReturnType<typeof ora>;

function applyVerdictToSpinner(
  spinner: DiagSpinner,
  verdict: DiagnosisVerdict,
): void {
  const text = verdictHeadline(verdict);
  switch (verdict) {
    case "reachable":
      spinner.succeed(text);
      return;
    case "isp_blocked":
    case "path_blocked":
    case "host_offline":
    case "unknown":
      spinner.warn(text);
      return;
    case "dns_failure":
      spinner.fail(text);
      return;
    default: {
      const exhaustive: never = verdict;
      spinner.fail(exhaustive);
    }
  }
}

function runShellTest(alias: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const child = spawn("ssh", [
      "-o",
      "ConnectTimeout=10",
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      alias,
      "hostname",
    ]);
    child.stdout.on("data", (d) => process.stdout.write(d));
    child.stderr.on("data", (d) => process.stderr.write(d));
    child.once("error", () => resolve(false));
    child.once("close", (code) => resolve(code === 0));
  });
}
