import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { escapeForBashC } from "../src/lib/bash-escape.js";

/**
 * These tests validate two things:
 *  1. The escape function produces the right escape sequences in isolation.
 *  2. The escape function actually round-trips through a real bash shell —
 *     because regex-based shell escaping has burned every project that has
 *     ever attempted it. We invoke `bash -c $'...'` and assert that what
 *     comes back is exactly the original input.
 */
describe("escapeForBashC — unit", () => {
  it("escapes backslash first to avoid double-escaping", () => {
    expect(escapeForBashC("\\")).toBe("\\\\");
  });

  it("escapes single quotes", () => {
    expect(escapeForBashC("it's")).toBe("it\\'s");
  });

  it("escapes newlines into \\n", () => {
    expect(escapeForBashC("line1\nline2")).toBe("line1\\nline2");
  });

  it("escapes carriage returns into \\r", () => {
    expect(escapeForBashC("a\rb")).toBe("a\\rb");
  });

  it("escapes tabs into \\t", () => {
    expect(escapeForBashC("a\tb")).toBe("a\\tb");
  });

  it("leaves benign characters untouched", () => {
    const input = "abc 123 #!?=&|<>(){}[];:,.";
    expect(escapeForBashC(input)).toBe(input);
  });
});

describe("escapeForBashC — round-trip through real bash", () => {
  /**
   * Build `printf %s $'<escaped>'` and pass it to bash as a single argv
   * element via execFileSync (no intermediate /bin/sh parsing). What bash
   * prints to stdout must equal the original input.
   */
  const roundTrip = (input: string): string => {
    const escaped = escapeForBashC(input);
    const script = `printf %s $'${escaped}'`;
    return execFileSync("bash", ["-c", script], { encoding: "utf8" });
  };

  it("round-trips ASCII text", () => {
    expect(roundTrip("hello world")).toBe("hello world");
  });

  it("round-trips embedded single quotes", () => {
    expect(roundTrip("it's a test")).toBe("it's a test");
  });

  it("round-trips multi-line shell scripts", () => {
    const script = [
      "set -euo pipefail",
      "echo 'first'",
      "echo \"second\"",
      "if [ -d /tmp ]; then echo ok; fi",
    ].join("\n");
    expect(roundTrip(script)).toBe(script);
  });

  it("round-trips a realistic rescue-script fragment", () => {
    const script = [
      "tailscale up --auth-key='tskey-auth-XYZ' --hostname='my-host' --ssh",
      "grep -qxF 'ssh-ed25519 AAAA' /root/.ssh/authorized_keys",
      'echo "------"',
    ].join("\n");
    expect(roundTrip(script)).toBe(script);
  });

  it("round-trips literal backslashes", () => {
    expect(roundTrip("a\\b\\c")).toBe("a\\b\\c");
  });
});
