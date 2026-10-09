export const MODULE_NAME = "promoter";

export const PromoterData = {
  META: "meta",
  GRANTED: "stats-granted",
  REVOKED: "stats-revoked",
  STATE: "state",
} as const;

export interface PromoterStats {
  granted: number;
  revoked: number;
}
