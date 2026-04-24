import { describe, it, expect } from "vitest";
import {
  extractAreaCode,
  inferTimezone,
  inferState,
  resolveContactTimezone,
} from "./timezone";

describe("extractAreaCode", () => {
  it("extracts from E.164", () => {
    expect(extractAreaCode("+14255481585")).toBe("425");
  });
  it("extracts from (###) ###-#### format", () => {
    expect(extractAreaCode("(425) 548-1585")).toBe("425");
  });
  it("extracts from 10-digit plain", () => {
    expect(extractAreaCode("4255481585")).toBe("425");
  });
  it("extracts from 11-digit leading 1", () => {
    expect(extractAreaCode("14255481585")).toBe("425");
  });
  it("returns null for short strings", () => {
    expect(extractAreaCode("5481585")).toBeNull();
  });
  it("returns null for empty/null/undefined", () => {
    expect(extractAreaCode(null)).toBeNull();
    expect(extractAreaCode(undefined)).toBeNull();
    expect(extractAreaCode("")).toBeNull();
  });
});

describe("inferTimezone", () => {
  it("Seattle (425) -> Pacific", () => {
    const t = inferTimezone("+14255481585");
    expect(t?.state).toBe("WA");
    expect(t?.tz).toBe("America/Los_Angeles");
  });
  it("NYC (212) -> Eastern", () => {
    expect(inferTimezone("2125551212")?.tz).toBe("America/New_York");
  });
  it("Panhandle FL (850) -> Central (override)", () => {
    expect(inferTimezone("8501234567")?.tz).toBe("America/Chicago");
  });
  it("El Paso TX (915) -> Mountain (override)", () => {
    expect(inferTimezone("9155551234")?.tz).toBe("America/Denver");
  });
  it("East Tennessee (423) -> Eastern (override)", () => {
    expect(inferTimezone("4235551234")?.tz).toBe("America/New_York");
  });
  it("Arizona (602) -> Phoenix (no DST)", () => {
    expect(inferTimezone("6025551234")?.tz).toBe("America/Phoenix");
  });
  it("Hawaii (808) -> Pacific/Honolulu", () => {
    expect(inferTimezone("8085551234")?.tz).toBe("Pacific/Honolulu");
  });
  it("toll-free (800) returns null", () => {
    expect(inferTimezone("8005551212")).toBeNull();
  });
  it("toll-free (844) returns null", () => {
    expect(inferTimezone("8445551212")).toBeNull();
  });
  it("premium (900) returns null", () => {
    expect(inferTimezone("9005551234")).toBeNull();
  });
  it("malformed returns null", () => {
    expect(inferTimezone("not a phone")).toBeNull();
    expect(inferTimezone("")).toBeNull();
    expect(inferTimezone(null)).toBeNull();
  });
  it("unassigned area code returns null", () => {
    expect(inferTimezone("2215551234")).toBeNull();
  });
});

describe("inferState", () => {
  it("returns state code", () => {
    expect(inferState("+14255481585")).toBe("WA");
    expect(inferState("2125551212")).toBe("NY");
  });
  it("returns null for toll-free", () => {
    expect(inferState("8005551212")).toBeNull();
  });
});

describe("resolveContactTimezone", () => {
  it("uses explicit contact tz first", () => {
    expect(
      resolveContactTimezone("America/Chicago", "+14255481585", "America/New_York"),
    ).toBe("America/Chicago");
  });
  it("falls back to NANPA inference if contact tz is null", () => {
    expect(
      resolveContactTimezone(null, "+14255481585", "America/New_York"),
    ).toBe("America/Los_Angeles");
  });
  it("falls back to NANPA inference if contact tz is empty string", () => {
    expect(
      resolveContactTimezone("", "+14255481585", "America/New_York"),
    ).toBe("America/Los_Angeles");
  });
  it("falls back to NANPA inference if contact tz is whitespace", () => {
    expect(
      resolveContactTimezone("   ", "+14255481585", "America/New_York"),
    ).toBe("America/Los_Angeles");
  });
  it("falls back to org default for toll-free numbers", () => {
    expect(
      resolveContactTimezone(null, "8005551212", "America/New_York"),
    ).toBe("America/New_York");
  });
  it("falls back to org default when phone missing", () => {
    expect(
      resolveContactTimezone(null, null, "America/Chicago"),
    ).toBe("America/Chicago");
  });
});
