import { spawn } from "node:child_process";
import { lookup } from "node:dns/promises";
import { createConnection } from "node:net";

import type { DiagnosisResult, DiagnosisVerdict, SshTarget } from "../types.js";

export interface DiagnoseOptions {
  connectTimeoutMs?: number;
  outsideCheckUrl?: string;
}

/**
 * Try to determine why an SSH target is unreachable from this machine.
 *
 * Order of checks:
 *  1. Resolve hostname → IP. If fails: dns_failure.
 *  2. Open a TCP socket to the SSH port with a short timeout.
 *     - If it succeeds, the target is reachable; user should re-try `ssh`.
 *  3. Run traceroute to identify where packets die.
 *     - Last responding hop near the user's ISP → likely upstream block.
 *  4. Optional outside-vantage check (skipped by default to keep zero-network-trust).
 */
export async function diagnose(
  target: SshTarget,
  opts: DiagnoseOptions = {},
): Promise<DiagnosisResult> {
  const { connectTimeoutMs = 6_000 } = opts;
  const details: string[] = [];

  let resolvedIp: string | undefined;
  try {
    const result = await lookup(target.host);
    resolvedIp = result.address;
    details.push(`Resolved ${target.host} → ${resolvedIp}`);
  } catch (err) {
    details.push(`DNS lookup failed: ${(err as Error).message}`);
    return { verdict: "dns_failure", details };
  }

  const reachable = await probeTcp(target.host, target.port, connectTimeoutMs);
  if (reachable.ok) {
    details.push(`TCP connect to ${target.host}:${target.port} succeeded.`);
    return { verdict: "reachable", details, resolvedIp };
  }
  details.push(
    `TCP connect to ${target.host}:${target.port} failed: ${reachable.reason}`,
  );

  const tracerouteResult = await runTraceroute(target.host, resolvedIp);
  if (tracerouteResult.lastHop) {
    details.push(`Last responding traceroute hop: ${tracerouteResult.lastHop}`);
  } else {
    details.push("traceroute produced no hops.");
  }
  details.push(...tracerouteResult.summary);

  return {
    verdict: pickVerdict(tracerouteResult),
    details,
    resolvedIp,
    lastReachableHop: tracerouteResult.lastHop,
  };
}

function pickVerdict(tr: TracerouteResult): DiagnosisVerdict {
  if (tr.reachedDestination) return "host_offline";
  if (tr.likelyIspBlock) return "isp_blocked";
  if (tr.respondingHops > 0) return "path_blocked";
  return "unknown";
}

interface ProbeResult {
  ok: boolean;
  reason?: string;
}

function probeTcp(host: string, port: number, timeoutMs: number): Promise<ProbeResult> {
  return new Promise<ProbeResult>((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const finish = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish({ ok: true }));
    socket.once("timeout", () => finish({ ok: false, reason: "timeout" }));
    socket.once("error", (err) => finish({ ok: false, reason: err.message }));
  });
}

interface TracerouteResult {
  lastHop?: string;
  summary: string[];
  likelyIspBlock: boolean;
  reachedDestination: boolean;
  respondingHops: number;
}

const TRACEROUTE_MAX_HOPS = 15;

/**
 * Run `traceroute -n -w 2 -q 1 -m 15 <host>` (or the OS equivalent) and
 * classify the result. Three possible patterns of interest:
 *
 *   1. Traceroute reaches the destination IP → host is alive but the port
 *      is filtered or sshd is down. Verdict: host_offline.
 *   2. Traceroute dies near the user (private/CGNAT last hop, or very few
 *      hops responded) → most likely the user's ISP is null-routing. Verdict: isp_blocked.
 *   3. Traceroute crosses the user's ISP, climbs into transit, then silence
 *      → upstream filtering (transit, peering, or destination ingress). Verdict: path_blocked.
 *      Remediation is the same as an ISP block (use a tunnel), but we report it honestly.
 */
function runTraceroute(host: string, destinationIp?: string): Promise<TracerouteResult> {
  return new Promise<TracerouteResult>((resolve) => {
    const isWin = process.platform === "win32";
    const cmd = isWin ? "tracert" : "traceroute";
    const args = isWin
      ? ["-d", "-h", String(TRACEROUTE_MAX_HOPS), "-w", "2000", host]
      : ["-n", "-w", "2", "-q", "1", "-m", String(TRACEROUTE_MAX_HOPS), host];
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    const hops: Array<{ index: number; ip: string | null }> = [];

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.once("error", () => {
      resolve({
        summary: [`${cmd} command unavailable on this system.`],
        likelyIspBlock: false,
        reachedDestination: false,
        respondingHops: 0,
      });
    });

    child.once("close", () => {
      const lines = stdout.split("\n");
      for (const line of lines) {
        const match = line.match(/^\s*(\d+)\s+(.*)$/);
        if (!match) continue;
        const index = Number(match[1]);
        const rest = match[2] ?? "";
        const ipMatch = rest.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
        hops.push({ index, ip: ipMatch ? (ipMatch[1] ?? null) : null });
      }
      const responding = hops.filter(
        (h): h is { index: number; ip: string } => h.ip !== null,
      );
      const lastResponding = responding.at(-1);
      const reachedDestination =
        !!destinationIp && responding.some((h) => h.ip === destinationIp);

      const summary: string[] = [];
      if (responding.length === 0) {
        summary.push("No hops responded — local network path is broken.");
      } else if (reachedDestination) {
        summary.push(
          `Destination ${destinationIp} answers ICMP but the TCP port is closed → host is up; the SSH port is filtered or sshd is down.`,
        );
      } else if (lastResponding && isPrivateIp(lastResponding.ip)) {
        summary.push(
          `Last responsive hop ${lastResponding.ip} is inside private/CGNAT space → packets dropped at your ISP edge.`,
        );
      } else if (lastResponding) {
        summary.push(
          `Reached ${responding.length} hop${responding.length === 1 ? "" : "s"} (last public hop ${lastResponding.ip}), then silence → packets dropped somewhere upstream (transit / peering / destination ingress).`,
        );
      }

      const lastIsPrivate =
        lastResponding !== undefined && isPrivateIp(lastResponding.ip);
      const likelyIspBlock =
        !reachedDestination &&
        (responding.length <= 5 || lastIsPrivate);

      resolve({
        lastHop: lastResponding?.ip,
        summary,
        likelyIspBlock,
        reachedDestination,
        respondingHops: responding.length,
      });
    });

    setTimeout(() => {
      child.kill("SIGTERM");
    }, 25_000);
  });
}

function isPrivateIp(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const [a = 0, b = 0] = parts;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}
