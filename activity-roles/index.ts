import { Module, DefineModule } from "#core/module-system/Module.js";

@DefineModule({
  name: "activity-roles",
  displayName: "Activity Roles",
  emoji: "🎮",
  version: "1.0.0",
  description: "Auto-assign roles based on users' Discord presence.",
})
export class ActivityRolesModule extends Module {
  // No onLoad registerPath: the ModuleStore registers this addon's directory
  // as a Sapphire base path, so commands/ and listeners/ are scanned already.

  public override async deleteUserData(
    _userId: string,
    _requester: import("#core/lib/gdpr.js").RequesterType,
  ): Promise<void> {
    // This module does not store any user-specific data that falls under GDPR.
    // It only stores guild configuration.
  }
}
