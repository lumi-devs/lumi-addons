# Economy Games

Casino games, crime, cooldown grinds, and a role-granting shop. Every coin movement goes through the economy ledger, so balances are shared with the rest of the economy module.

All responses are ephemeral, so bets, payouts, inventories, and jail sentences stay private.

## Commands

### Games

- `/blackjack <bet>` — deal a hand and use **Hit** or **Stand**. Natural blackjack returns the configured `blackjackPayout` multiplier including the stake; a normal win returns `2x`; a push refunds the stake. The dealer stands on 17. Tables expire after 5 minutes and expired bets are refunded by a sweep task.
- `/roulette <bet> [choice]` — single-zero wheel. `choice` accepts `red`, `black`, `odd`, `even`, `low` (1-18), `high` (19-36), `green`, or an exact number `0`-`36`. Even-money bets return `2x` the stake. Green and exact numbers pay `35:1` (`36x` including the stake). Without a choice the command shows the bet options.

### Crime

- `/crime [tier]` — choose `low`, `medium`, or `high`. Success pays the tier band; failure jails you for `crimeCooldownMinutes`. Jail blocks further crimes until release, and a successful crime starts the same cooldown.

| Tier | Success | Payout |
|---|---|---|
| Low | 70% | 40-120 |
| Medium | 55% | 120-300 |
| High | 40% | 300-750 |

### Grinds

Each grind has a cooldown, a base payout band, and a bonus roll:

| Command | Cooldown | Base payout | Bonus chance | Bonus |
|---|---|---|---|---|
| `/work` | 30 min | 80-200 | 12% | 100-250 |
| `/beg` | 2 min | 5-60 | 8% | 50-150 |
| `/fish` | 10 min | 30-130 | 10% | 80-200 |
| `/mine` | 10 min | 40-150 | 10% | 90-220 |

### Shop

- `/gameshop view [page]` — browse configured items, prices, stock, and tags.
- `/gameshop buy <item>` — debit the price, reserve stock, add the item to your inventory, and grant its role if configured.
- `/gameshop inventory [page]` — list owned items.
- `/gameshop use <item>` — consume an item. Consumables pay a random reward between `consumableMin` and `consumableMax`; role items apply their role. Non-consumable collectibles cannot be used.
- `/gameshop equip <item>` — toggle a role item: grant its role if you do not have it, remove it if you do.

Shop items are configured one per line:

```
name | price | description | roleId | consumable | stock
```

- `price` is a positive whole number.
- `description` is optional.
- `roleId` is optional and must be a Discord role ID.
- `consumable` accepts `yes`, `true`, `1`, or `y`.
- `stock` is optional; empty means unlimited. A stock of `0` means sold out.

Buying a role item still adds it to your inventory. If the bot lacks Manage Roles or the role is above the bot, the purchase succeeds but the role note explains why it was not granted. Using the item from the inventory consumes it and retries the role grant.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `blackjackMin` / `blackjackMax` | 5 / 500 | Blackjack bet range. |
| `blackjackPayout` | 2.5 | Total natural blackjack return, including stake. |
| `rouletteMin` / `rouletteMax` | 5 / 500 | Roulette bet range. |
| `crimeCooldownMinutes` | 10 | Crime cooldown and jail length. |
| `workCooldownMinutes` | 30 | Work cooldown. |
| `begCooldownMinutes` | 2 | Beg cooldown. |
| `fishCooldownMinutes` | 10 | Fish cooldown. |
| `mineCooldownMinutes` | 10 | Mine cooldown. |
| `consumableMin` / `consumableMax` | 20 / 120 | Reward band for `/gameshop use`. |
| `shopItems` | empty | Shop item lines. |

## Privacy and data

- Active blackjack games (`blackjack`), jail records (`jail`), and inventories are stored in module data keyed by user ID. Per-item stock counters are stored guild-wide.
- Cooldowns are stored in the ephemeral cache with a TTL.
- Coin balances and transaction history are stored by the economy ledger.
- GDPR export returns this module's records plus the economy export. GDPR deletion removes all of this module's records for the user and calls the economy ledger's delete user data routine.

## Requirements

No privileged intents are required. The bot needs **Manage Roles** only if the shop grants role items.