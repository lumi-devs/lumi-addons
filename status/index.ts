import { Module, DefineModule } from "#core/module-system/Module.js";
import { registerTaskFireHandler } from "#core/lib/task-fire-registry.js";
import { handleStatusRotateFire } from "./lib/rotate-handler.js";
import { getEntries, saveEntries } from "./lib/data.js";

@DefineModule({
  name: "status",
  displayName: "Status Rotator",
  emoji: "🔁",
  version: "1.0.0",
  description:
    "Rotating bot presence managed by the bot owner via /status. Global — not per-guild.",
})
export class StatusModule extends Module {
  public override onLoad() {
    // "broadcast": each WS-owning process applies presence to its own shards.
    registerTaskFireHandler(
      "status-rotate",
      "broadcast",
      handleStatusRotateFire,
    );
    return super.onLoad();
  }

  public override async deleteUserData(userId: string): Promise<void> {
    // Only per-user data is the `addedBy` audit field on entries.
    const entries = await getEntries();
    if (!entries.some((e) => e.addedBy === userId)) return;
    await saveEntries(
      entries.map((e) =>
        e.addedBy === userId ? { ...e, addedBy: "deleted" } : e,
      ),
    );
  }
}
