import { describe, expect, test } from "bun:test";
import { parseGtxResponse, resolveLanguage } from "../commands/translate.js";

describe("resolveLanguage", () => {
  test("resolves codes and names", () => {
    expect(resolveLanguage("Spanish")).toBe("es");
    expect(resolveLanguage("ja")).toBe("ja");
    expect(resolveLanguage("pt-BR")).toBe("pt-br");
    expect(resolveLanguage("Brazilian Portuguese")).toBe("pt-BR");
  });

  test("rejects unknown values", () => {
    expect(resolveLanguage("klingon")).toBeNull();
    expect(resolveLanguage("")).toBeNull();
    expect(resolveLanguage(null)).toBeNull();
  });
});

describe("parseGtxResponse", () => {
  test("joins translated segments and reads the source", () => {
    expect(
      parseGtxResponse([
        [
          ["Hello ", "Hola "],
          ["world", "mundo"],
        ],
        null,
        "en",
      ]),
    ).toEqual({ text: "Hello world", source: "en" });
  });

  test("handles malformed responses", () => {
    expect(parseGtxResponse(null)).toBeNull();
    expect(parseGtxResponse([])).toBeNull();
    expect(parseGtxResponse([[["   "]], null, "en"])).toBeNull();
  });
});
