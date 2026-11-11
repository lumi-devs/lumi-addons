# Drag Me

Ask the people in a voice channel to pull you into it. The request is posted as a card with **Accept**, **Decline**, and **Cancel** buttons.

## Commands

- `/dragme <user> <channel>` — request to join a voice channel. The selected user must currently be inside that channel.
- **Accept** moves you into the channel.
- **Decline** closes the request.
- **Cancel** lets the requester withdraw the request.
- Anyone currently inside the destination voice channel may accept or decline. Only the requester can cancel.
- Requests expire automatically after the configured timeout.

## Setup

Configure the module from the server dashboard or module settings:

| Field | Type | Description |
| --- | --- | --- |
| Request Channel | Text channel | Where drag request cards are posted. Required. |
| Request Timeout | Number | Minutes before an unanswered request expires. Default `10`, range `1`–`60`. |
| Blacklisted Roles | Roles | Members with any of these roles cannot send drag requests. Default none. |

## Permissions

The bot needs these permissions in the **request channel**:

- View Channel
- Send Messages

The bot needs these permissions in each **destination voice channel**:

- View Channel
- Connect
- Move Members

Members do not need a special permission to use `/dragme`; role blacklists can restrict access.

## Intents

No privileged intents are required. Voice state data comes from the standard `GuildVoiceStates` gateway intent.

## Privacy

Pending requests are stored in module data and contain the requester ID, target user ID, destination channel ID, request card location, and expiry time. Records expire automatically and are deleted when a request is accepted, declined, cancelled, or swept after expiry. Deleting a user's data removes their pending requests.
