export interface ShopItem {
  name: string;
  price: number;
  description: string;
  roleId: string | null;
  consumable: boolean;
  stock: number | null;
}

const ROLE_RE = /^\d{17,20}$/;

function parsePrice(raw: string): number | null {
  const price = Number(raw);
  if (!Number.isInteger(price) || price <= 0) return null;
  return price;
}

function parseEntry(entry: string): ShopItem | null {
  const parts = entry.split("|").map((part) => part.trim());
  const name = parts[0] ?? "";
  if (name.length === 0 || name.length > 32 || name.includes("\n"))
    return null;
  const price = parsePrice(parts[1] ?? "");
  if (price === null) return null;
  const description = (parts[2] ?? "").slice(0, 200);
  const roleRaw = parts[3] ?? "";
  const roleId = ROLE_RE.test(roleRaw) ? roleRaw : null;
  const consumableRaw = (parts[4] ?? "").toLowerCase();
  const consumable =
    consumableRaw === "yes" ||
    consumableRaw === "true" ||
    consumableRaw === "1";
  const stockRaw = parts[5] ?? "";
  const stockNum = stockRaw === "" ? null : Number(stockRaw);
  const stock =
    stockNum !== null &&
    Number.isInteger(stockNum) &&
    (stockNum as number) > 0
      ? (stockNum as number)
      : null;
  return { name, price, description, roleId, consumable, stock };
}

export function parseShopItems(entries: unknown): ShopItem[] {
  if (!Array.isArray(entries)) return [];
  const items: ShopItem[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (typeof entry !== "string") continue;
    const item = parseEntry(entry);
    if (!item) continue;
    const key = item.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return items;
}

export function findShopItem(
  items: ShopItem[],
  name: string,
): ShopItem | undefined {
  const key = name.trim().toLowerCase();
  return items.find((item) => item.name.toLowerCase() === key);
}

export function shopItemLine(
  item: ShopItem,
  sold: number,
): string {
  const bits: string[] = [`**${item.price.toLocaleString("en-US")}**`];
  if (item.roleId) bits.push("🎭 role");
  if (item.consumable) bits.push("🧪 usable");
  bits.push(
    item.stock === null
      ? "∞ stock"
      : `${Math.max(0, item.stock - sold)}/${item.stock} left`,
  );
  const detail = item.description ? ` — ${item.description}` : "";
  return `**${item.name}** · ${bits.join(" · ")}${detail}`;
}
