# Economy Games

Blackjack, roulette, crime with jail, work/beg/fish/mine grinds, and a shop. All balances, bets, cooldowns, and active games are managed in the addon's own KV namespace.

## Commands

- `/blackjack <bet>` — deal a hand with Hit/Stand buttons.
- `/roulette <bet> [number]` — bet on red/black/odd/even/low/high/green or an exact number.
- `/crime` — choose crime tier; win payout or serve jail time.
- `/work`, `/beg`, `/fish`, `/mine` — grinds with cooldowns and bonus events.
- `/shop view` — browse shop stock.
- `/shop buy <name>` — purchase item.
- `/shop inventory` — view owned items.
- `/shop use <name>` — consume item for reward.

## Setup

Configure via `/lumi` → **Modules** → **Economy Games**:

| Field | Default | Meaning |
|---|---|---|
| Blackjack Minimum/Maximum Bet | 5 / 500 | Bet range for blackjack. |
| Blackjack Payout | 1.5 | Multiplier on natural blackjack. |
| Roulette Minimum/Maximum Bet | 5 / 500 | Bet range for roulette. |
| Crime Cooldown | 10m | Cooldown between crimes. |
| Work/Beg/Fish/Mine Cooldown | 30m / 2m / 10m / 10m | Cooldowns between grinds. |
| Consumable Min/Max Reward | 20 / 120 | Reward band for `/shop use`. |
| Shop Items | — | Item lines: `name \| price \| description \| roleId \| consumable \| stock`. |

## Privacy & data

- Stores wallet balances, cooldowns, inventories, jail records, and pending tables per server keyed by user ID in KV.
- Fully erased on GDPR erasure requests.
