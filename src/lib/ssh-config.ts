import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { ui } from "./ui.js";

export interface SshHostEntry {
  alias: string;
  hostname: string;
  user: string;
  port?: number;
  identityFile?: string;
}

const MARKER_BEGIN = "# >>> vps-rescue managed";
const MARKER_END = "# <<< vps-rescue managed";

/**
 * Append (or replace) a managed Host block in ~/.ssh/config.
 *
 * Existing user-authored entries are never touched. Each alias gets its own
 * pair of markers so re-running upserts in place rather than duplicating.
 */
export async function upsertSshHost(entry: SshHostEntry): Promise<string> {
  const path = join(homedir(), ".ssh", "config");
  await ensureDir(dirname(path));

  const existing = await safeRead(path);
  const block = renderBlock(entry);
  const updated = replaceBlock(existing, entry.alias, block);

  await writeFile(path, updated, { mode: 0o600 });
  return path;
}

function renderBlock(entry: SshHostEntry): string {
  const lines = [
    `${MARKER_BEGIN}: ${entry.alias}`,
    `Host ${entry.alias}`,
    `  HostName ${entry.hostname}`,
    `  User ${entry.user}`,
  ];
  if (entry.port && entry.port !== 22) lines.push(`  Port ${entry.port}`);
  if (entry.identityFile) lines.push(`  IdentityFile ${entry.identityFile}`);
  lines.push(`  ServerAliveInterval 60`);
  lines.push(`  ServerAliveCountMax 3`);
  lines.push(`${MARKER_END}: ${entry.alias}`);
  return lines.join("\n");
}

function replaceBlock(source: string, alias: string, block: string): string {
  const beginPattern = new RegExp(
    `${escapeRegex(MARKER_BEGIN)}: ${escapeRegex(alias)}[\\s\\S]*?${escapeRegex(MARKER_END)}: ${escapeRegex(alias)}`,
    "m",
  );
  if (beginPattern.test(source)) {
    return source.replace(beginPattern, block);
  }
  const sep = source.length === 0 || source.endsWith("\n") ? "" : "\n";
  const leading = source.length === 0 ? "" : "\n";
  return `${source}${sep}${leading}${block}\n`;
}

async function safeRead(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  }
}

async function ensureDir(path: string): Promise<void> {
  try {
    await mkdir(path, { recursive: true, mode: 0o700 });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      ui.warn(`Could not create ${path}: ${(err as Error).message}`);
    }
  }
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
