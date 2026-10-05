# Economy Games

Blackjack, roulette, crime with jail, work/beg/fish/mine grinds, and a
role-granting shop for your server. The basics (balances, payday, transfers,
slots) stay in the core **Economy** module — this addon is only the fun. Every
payout, bet, fine, and purchase is settled through the core Economy ledger, and
amounts render in the guild's configured currency.

Requires the core Economy module's ledger (always available) and reads its
currency name, emoji, starting balances, and maximum balance for display.

## Commands

- `/blackjack <bet>` — deal a hand; Hit/Stand buttons on a card table. Dealer
  stands on 17. A natural pays the configured blackjack multiplier.
- `/roulette <bet> [number]` — place a bet, then pick a bet type from the
  select menu: red/black/odd/even/low/high (1:1), green zero or an exact number
  (35:1). Pass `number` (0-36) to enable the exact-number bet.
- `/crime` — pick from pickpocket to cybercrime. Win the payout or pay a fine
  and serve jail time (crime is blocked until release).
- `/work`, `/beg`, `/fish`, `/mine` — grinds with distinct flavors, cooldowns,
  and occasional lucky bonus events.
- `/shop view` — browse the stock.
- `/shop buy <name>` — buy an item; role items grant their role on purchase.
- `/shop inventory` — show what you own.
- `/shop use <name>` — consume a consumable item for a random reward.
- `/shop equip <name>` — equip/unequip a role item's role.

## Setup

Configure via `/lumi` → **Modules** → **Economy Games**:

| Field | Default | Meaning |
|---|---|---|
| Blackjack Minimum/Maximum Bet | 5 / 500 | Bet band for blackjack. |
| Blackjack Payout | 1.5 | Profit multiplier on a natural blackjack. |
| Roulette Minimum/Maximum Bet | 5 / 500 | Bet band for roulette. |
| Crime Cooldown | 10m | Gap between crimes. |
| Work/Beg/Fish/Mine Cooldown | 30m / 2m / 10m / 10m | Gap between grind claims. |
| Consumable Min/Max Reward | 20 / 120 | Payout band for `/shop use`. |
| Shop Items | — | One item per line (see below). |

Shop item lines use `|` separators:

```text
name | price | description | roleId | consumable | stock
```

Only `name` and `price` are required. `roleId` grants a role on purchase (and
toggles with `/shop equip`), `consumable` (`yes`) makes the item usable for a
random reward, and `stock` caps total sales (empty means unlimited). Example:

```text
VIP | 500 | Fancy color role | 123456789012345678 | no | 10
Lucky Box | 100 | Might contain treasure | | yes |
```

## Privacy & data

- Stores per server, keyed by user ID: jail sentences and shop inventories
  (Postgres), plus short-lived cooldowns and active game tables (Redis).
- Currency balances and the transaction ledger belong to the core Economy
  module and are deleted with its own erasure flow.
- Implements GDPR erasure: deleting a user drops their jail record, inventory,
  cooldowns, and pending game tables in every guild.
