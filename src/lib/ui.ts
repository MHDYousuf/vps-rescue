import pc from "picocolors";

export const ui = {
  info: (msg: string) => process.stdout.write(`${pc.cyan("→")} ${msg}\n`),
  ok: (msg: string) => process.stdout.write(`${pc.green("✓")} ${msg}\n`),
  warn: (msg: string) => process.stderr.write(`${pc.yellow("!")} ${msg}\n`),
  err: (msg: string) => process.stderr.write(`${pc.red("✗")} ${msg}\n`),
  dim: (msg: string) => process.stdout.write(`${pc.dim(msg)}\n`),
  step: (n: number, total: number, msg: string) =>
    process.stdout.write(`${pc.bold(pc.cyan(`[${n}/${total}]`))} ${msg}\n`),
  heading: (msg: string) =>
    process.stdout.write(`\n${pc.bold(pc.underline(msg))}\n\n`),
  raw: (msg: string) => process.stdout.write(`${msg}\n`),
  blank: () => process.stdout.write("\n"),
};

/**
 * Mask secrets in logs. Keeps first 4 + last 4 chars.
 * Example: tskey-api-abcd…wxyz
 */
export function maskSecret(value: string): string {
  if (value.length <= 12) return "********";
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export const colors = pc;
