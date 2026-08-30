---
title: GDPR & User Privacy in Addons
description: Best practices for handling end-user data, privacy statements, and deletion hooks.
emoji: "🔒"
category: "Guides"
tags: ["privacy", "gdpr", "ccpa", "security"]
---

Lumi is designed with strict privacy principles. All modules and addons must implement end-user data declarations and deletion hooks.

## 1. The `end_user_data_statement`

Every addon's `info.json` must contain a non-empty `end_user_data_statement`.

### Examples:

- **Addon with no user data:**
  ```json
  {
    "end_user_data_statement": "This module does not collect, persist, or store any personal end-user data."
  }
  ```

- **Addon with user data:**
  ```json
  {
    "end_user_data_statement": "Stores custom booster role definitions (role ID, owner user ID, role name, hex color) in guild storage. Data is deleted upon role deletion or GDPR user purge request."
  }
  ```

## 2. Implementing `deleteUserData`

When a user requests account data deletion (via `/mydata delete` or staff GDPR action), Lumi calls `deleteUserData` across all active modules:

```typescript
export class MyModule extends Module {
  public override async deleteUserData(userId: string, requester?: string): Promise<void> {
    for (const guildId of this.container.client.guilds.cache.keys()) {
      await deleteRecordsForUser(guildId, userId);
    }
  }
}
```

## 3. Implementing `exportUserData`

When a user requests an export of their stored information:

```typescript
export class MyModule extends Module {
  public override async exportUserData(userId: string): Promise<Record<string, unknown> | null> {
    const records = await getRecordsForUser(userId);
    return records.length > 0 ? { savedRecords: records } : null;
  }
}
```
