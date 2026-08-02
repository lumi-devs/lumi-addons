import { DefineModule, Module } from "lumi";

@DefineModule({
  name: "utility",
  displayName: "Utility Addons",
  emoji: "⚙️",
  version: "1.0.0",
  description: "General utility addons including translations and emoji stealing.",
})
export class UtilityAddonModule extends Module {
  public override async deleteUserData(
    _userId: string,
    _requester?: string,
  ): Promise<void> {
    // No-op: utility addons like translate and emoji-stealer do not store user data
  }
}
