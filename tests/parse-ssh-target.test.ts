import { describe, expect, it } from "vitest";

import {
  deriveTailnetHostname,
  parseSshTarget,
} from "../src/lib/ssh-target.js";

describe("parseSshTarget", () => {
  it("parses user@host with defaults", () => {
    expect(parseSshTarget("root@72.61.248.136")).toEqual({
      user: "root",
      host: "72.61.248.136",
      port: 22,
    });
  });

  it("parses user@host:port", () => {
    expect(parseSshTarget("admin@vps.example.com:2222")).toEqual({
      user: "admin",
      host: "vps.example.com",
      port: 2222,
    });
  });

  it("defaults user to root when omitted", () => {
    expect(parseSshTarget("72.61.248.136")).toEqual({
      user: "root",
      host: "72.61.248.136",
      port: 22,
    });
  });

  it("defaults user to root when host:port given without user", () => {
    expect(parseSshTarget("vps.example.com:65002")).toEqual({
      user: "root",
      host: "vps.example.com",
      port: 65002,
    });
  });

  it("accepts users with dots, hyphens, underscores", () => {
    expect(parseSshTarget("deploy_user@host")).toMatchObject({
      user: "deploy_user",
      host: "host",
    });
    expect(parseSshTarget("first.last@host")).toMatchObject({
      user: "first.last",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(parseSshTarget("  root@host  ")).toEqual({
      user: "root",
      host: "host",
      port: 22,
    });
  });

  it("treats trailing colon-with-non-numeric as part of the host", () => {
    // Belt-and-braces: we only consume :NNN as a port. Anything else is host.
    const parsed = parseSshTarget("root@host:notaport");
    expect(parsed.host).toContain("host");
    expect(parsed.port).toBe(22);
  });

  it("throws on empty input", () => {
    expect(() => parseSshTarget("")).toThrow();
    expect(() => parseSshTarget("   ")).toThrow();
  });

  it("throws on missing user before @", () => {
    expect(() => parseSshTarget("@host")).toThrow(/Invalid SSH user/);
  });

  it("throws on port out of range", () => {
    expect(() => parseSshTarget("root@host:0")).toThrow(/Invalid SSH port/);
    expect(() => parseSshTarget("root@host:99999")).toThrow(/Invalid SSH port/);
  });
});

describe("deriveTailnetHostname", () => {
  it("turns an IPv4 address into a hyphenated hostname", () => {
    expect(
      deriveTailnetHostname({
        user: "root",
        host: "72.61.248.136",
        port: 22,
      }),
    ).toBe("72-61-248-136");
  });

  it("lowercases mixed-case hostnames", () => {
    expect(
      deriveTailnetHostname({
        user: "root",
        host: "MyHost.Example.COM",
        port: 22,
      }),
    ).toBe("myhost-example-com");
  });

  it("falls back to a default when nothing alphanumeric remains", () => {
    expect(
      deriveTailnetHostname({ user: "root", host: "...", port: 22 }),
    ).toBe("vps-rescue-host");
  });

  it("caps length at 63 characters (DNS label limit)", () => {
    const longHost = "a".repeat(100);
    const out = deriveTailnetHostname({ user: "root", host: longHost, port: 22 });
    expect(out.length).toBeLessThanOrEqual(63);
  });
});
