import { Module, DefineModule } from "lumi";

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
    _requester?: string,
  ): Promise<void> {
    // This module does not store any user-specific data that falls under GDPR.
    // It only stores guild configuration.
  }

  public override async exportUserData(
    _userId: string,
  ): Promise<Record<string, unknown> | null> {
    // Same as deleteUserData: no per-user data stored.
    return null;
  }
}
