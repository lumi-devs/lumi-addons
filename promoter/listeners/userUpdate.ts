import { ApplyOptions } from "@sapphire/decorators";
import { Listener, Events } from "@sapphire/framework";
import type { User } from "discord.js";
import { isModuleEnabled } from "#utilities/listeners.js";
import { evaluateMember } from "../lib/evaluate.js";
import { MODULE_NAME } from "../keys.js";

@ApplyOptions<Listener.Options>({
  name: "promoter-user-update",
  event: Events.UserUpdate,
})
export class PromoterUserUpdateListener extends Listener<"userUpdate"> {
  public async run(oldUser: User, newUser: User): Promise<void> {
    const oldPrimary = (oldUser as any).primaryGuild;
    const newPrimary = (newUser as any).primaryGuild;
    if (JSON.stringify(oldPrimary) === JSON.stringify(newPrimary)) {
      return;
    }

    for (const guild of this.container.client.guilds.cache.values()) {
      if (await isModuleEnabled(guild.id, MODULE_NAME)) {
        const member = await guild.members.fetch(newUser.id).catch(() => null);
        if (member) {
          await evaluateMember(member).catch((err) => {
            this.container.logger.warn(
              `[Promoter] evaluate failed on user update for ${newUser.id} in ${guild.id}:`,
              err,
            );
          });
        }
      }
    }
  }
}
