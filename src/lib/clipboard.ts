import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

import clipboard from "clipboardy";

const LINUX_CLIPBOARD_HELPERS = ["xclip", "xsel"] as const;

export type ClipboardCopyResult =
  | { ok: true }
  | {
      ok: false;
      reason: "linux-missing-helper";
      message: string;
    }
  | {
      ok: false;
      reason: "copy-failed";
    };

interface ClipboardOptions {
  envPath?: string;
  platform?: NodeJS.Platform;
}

export const LINUX_CLIPBOARD_HELPER_TIP =
  "Install xclip (`sudo apt install xclip`) for auto-copy.";

async function commandExists(command: string, envPath: string): Promise<boolean> {
  for (const dir of envPath.split(path.delimiter).filter(Boolean)) {
    try {
      await access(path.join(dir, command), constants.X_OK);
      return true;
    } catch {
      // Keep scanning PATH entries.
    }
  }
  return false;
}

async function hasLinuxClipboardHelper(envPath: string): Promise<boolean> {
  for (const helper of LINUX_CLIPBOARD_HELPERS) {
    if (await commandExists(helper, envPath)) {
      return true;
    }
  }
  return false;
}

export async function copyToClipboard(
  text: string,
  options: ClipboardOptions = {},
): Promise<ClipboardCopyResult> {
  const platform = options.platform ?? process.platform;
  const envPath = options.envPath ?? process.env.PATH ?? "";

  if (platform === "linux" && !(await hasLinuxClipboardHelper(envPath))) {
    return {
      ok: false,
      reason: "linux-missing-helper",
      message: LINUX_CLIPBOARD_HELPER_TIP,
    };
  }

  try {
    await clipboard.write(text);
    return { ok: true };
  } catch {
    return { ok: false, reason: "copy-failed" };
  }
}
