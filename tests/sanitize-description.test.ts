import { describe, expect, it } from "vitest";

import { sanitizeDescription } from "../src/lib/tailscale.js";

/**
 * Tailscale auth-key descriptions allow only alphanumeric characters,
 * hyphens, and spaces, with a 50-character cap.
 *
 * Regression coverage for the colon-in-description bug that caused
 * HTTP 400 on every createAuthKey call during early v0.1.0 development.
 */
describe("sanitizeDescription", () => {
  it("preserves clean alphanumeric input untouched", () => {
    expect(sanitizeDescription("vps-rescue 187-77-99-235")).toBe(
      "vps-rescue 187-77-99-235",
    );
  });

  it("strips colons (the actual production bug)", () => {
    expect(sanitizeDescription("vps-rescue: provisioning host")).toBe(
      "vps-rescue provisioning host",
    );
  });

  it("strips a wide range of disallowed characters", () => {
    expect(
      sanitizeDescription("vps/rescue:test@host.com (production!)"),
    ).toBe("vps rescue test host com production");
  });

  it("collapses repeated whitespace", () => {
    expect(sanitizeDescription("vps   rescue  \t test")).toBe(
      "vps rescue test",
    );
  });

  it("caps output at 50 characters", () => {
    const longInput = "vps-rescue " + "a".repeat(100);
    const out = sanitizeDescription(longInput);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.startsWith("vps-rescue ")).toBe(true);
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitizeDescription("   hello world   ")).toBe("hello world");
  });

  it("returns empty string when input has nothing valid", () => {
    expect(sanitizeDescription(":::!!!@@@")).toBe("");
  });

  it("handles empty string", () => {
    expect(sanitizeDescription("")).toBe("");
  });

  it("preserves hyphens which are explicitly allowed", () => {
    expect(sanitizeDescription("a-b-c-d")).toBe("a-b-c-d");
  });
});
