# Activity Roles

Automatically assigns roles to users based on their Discord presence (e.g., playing a game, streaming, listening to Spotify, or custom statuses).

## Features
- Support for all Discord activity types: `Playing`, `Streaming`, `Listening`, `Watching`, `Custom`, and `Competing`.
- Flexible string matching.
- Automatically removes the role when the activity ends.

## Commands
- `/activityroles add <type> <match_string> <role>`: Add a new activity role mapping.
- `/activityroles remove <role>`: Remove an activity role mapping.
- `/activityroles list`: View all configured activity roles.
