import { describe, it, expect } from "vitest";
import { parseGtxResponse, resolveLanguage } from "./languages.js";

describe("resolveLanguage", () => {
  it("resolves codes and names case-insensitively", () => {
    expect(resolveLanguage("es")).toBe("es");
    expect(resolveLanguage("ES")).toBe("es");
    expect(resolveLanguage("  French ")).toBe("fr");
    expect(resolveLanguage("Japanese")).toBe("ja");
  });

  it("passes through any other 2-letter code", () => {
    expect(resolveLanguage("xx")).toBe("xx");
  });

  it("rejects unknown or empty input", () => {
    expect(resolveLanguage("klingon")).toBeNull();
    expect(resolveLanguage("")).toBeNull();
    expect(resolveLanguage(null)).toBeNull();
  });
});

describe("parseGtxResponse", () => {
  it("joins segments and reads the detected source", () => {
    expect(
      parseGtxResponse([[["Hello", "Hola"], [" world", " mundo"]], null, "es"]),
    ).toEqual({ text: "Hello world", source: "es" });
  });

  it("leaves source null when absent", () => {
    expect(parseGtxResponse([[["Hello", "Bonjour"]]])).toEqual({
      text: "Hello",
      source: null,
    });
  });

  it("rejects malformed or empty responses", () => {
    expect(parseGtxResponse(null)).toBeNull();
    expect(parseGtxResponse({})).toBeNull();
    expect(parseGtxResponse([null])).toBeNull();
    expect(parseGtxResponse([[["", "  "]]])).toBeNull();
  });
});
