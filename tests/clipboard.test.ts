import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  write: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  access: mocks.access,
}));

vi.mock("clipboardy", () => ({
  default: {
    write: mocks.write,
  },
}));

import {
  copyToClipboard,
  LINUX_CLIPBOARD_HELPER_TIP,
} from "../src/lib/clipboard.js";

describe("copyToClipboard", () => {
  beforeEach(() => {
    mocks.access.mockReset();
    mocks.write.mockReset();
  });

  it("returns a Linux helper tip without calling clipboardy when xclip and xsel are missing", async () => {
    mocks.access.mockRejectedValue(new Error("missing"));

    const result = await copyToClipboard("cmd", {
      platform: "linux",
      envPath: "/usr/bin:/bin",
    });

    expect(result).toEqual({
      ok: false,
      reason: "linux-missing-helper",
      message: LINUX_CLIPBOARD_HELPER_TIP,
    });
    expect(mocks.access).toHaveBeenCalledTimes(4);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("uses clipboardy when a Linux clipboard helper is available", async () => {
    mocks.access.mockResolvedValue(undefined);
    mocks.write.mockResolvedValue(undefined);

    const result = await copyToClipboard("cmd", {
      platform: "linux",
      envPath: "/usr/bin",
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.write).toHaveBeenCalledWith("cmd");
  });

  it("reports generic copy failures on non-Linux platforms", async () => {
    mocks.write.mockRejectedValue(new Error("copy failed"));

    const result = await copyToClipboard("cmd", {
      platform: "darwin",
    });

    expect(result).toEqual({ ok: false, reason: "copy-failed" });
  });
});
