import { describe, it, expect } from "vitest";
import { findShopItem, parseShopItems, shopItemLine } from "./shop.js";

describe("shop", () => {
  it("parses a full entry", () => {
    const [item] = parseShopItems([
      "VIP | 500 | Fancy color role | 123456789012345678 | no | 10",
    ]);
    expect(item).toMatchObject({
      name: "VIP",
      price: 500,
      description: "Fancy color role",
      roleId: "123456789012345678",
      consumable: false,
      stock: 10,
    });
  });

  it("parses a minimal entry with unlimited stock", () => {
    const [item] = parseShopItems(["Lucky Box | 100 | Might contain treasure"]);
    expect(item).toMatchObject({
      name: "Lucky Box",
      price: 100,
      roleId: null,
      consumable: false,
      stock: null,
    });
  });

  it("recognizes consumable flags and zero stock as unlimited", () => {
    const items = parseShopItems([
      "A | 10 | d | | yes | ",
      "B | 10 | d | | no | 0",
      "C | 10 | d | | TRUE | ",
    ]);
    expect(items.map((item) => [item.consumable, item.stock])).toEqual([
      [true, null],
      [false, null],
      [true, null],
    ]);
  });

  it("drops invalid and duplicate entries", () => {
    const items = parseShopItems([
      "No Price | here | desc",
      "Zero | 0 | desc",
      " | 10 | desc",
      "Good | 10 | desc",
      "good | 20 | duplicate name",
      42,
      "Bad Role | 10 | desc | not-a-snowflake | no | ",
    ]);
    expect(items.map((item) => item.name)).toEqual(["Good", "Bad Role"]);
    expect(items[1]).toMatchObject({ roleId: null });
  });

  it("finds items case-insensitively with trimming", () => {
    const items = parseShopItems(["VIP Pass | 250 | Shiny"]);
    expect(findShopItem(items, "vip pass")?.price).toBe(250);
    expect(findShopItem(items, "  VIP PASS  ")?.price).toBe(250);
    expect(findShopItem(items, "other")).toBeUndefined();
  });

  it("renders stock lines for limited and unlimited items", () => {
    const [limited, unlimited] = parseShopItems([
      "Sword | 300 | Sharp | | no | 5",
      "Bread | 5 | Tasty",
    ]);
    expect(shopItemLine(limited!, 2)).toContain("3/5 left");
    expect(shopItemLine(limited!, 9)).toContain("0/5 left");
    expect(shopItemLine(unlimited!, 100)).toContain("∞ stock");
  });
});
