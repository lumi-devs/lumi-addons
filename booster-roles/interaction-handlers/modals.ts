import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import type { ModalSubmitInteraction } from "discord.js";
import { roleMention, userMention } from "@discordjs/formatters";
import {
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
} from "#utilities/cards.js";
import { getBoosterConfig } from "../lib/config.js";
import { getRole, setRole } from "../lib/data.js";
import { accessDenial } from "../lib/access.js";
import { createBoosterRole, postToChannel } from "../lib/roles.js";
import { validateRoleName, parseHexColor, colorToHex } from "../lib/engine.js";
import { buildPanel } from "../lib/ui.js";
import type { RoleRecord } from "../keys.js";

type Parsed = { kind: "name"; mode: "create" | "rename" } | { kind: "color" };

@ApplyOptions<InteractionHandler.Options>({
  name: "booster-roles-modals",
  interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
})
export class BoosterModalHandler extends InteractionHandler {
  public override parse(interaction: ModalSubmitInteraction) {
    if (interaction.customId === "br:namemodal:create")
      return this.some({ kind: "name", mode: "create" } as Parsed);
    if (interaction.customId === "br:namemodal:rename")
      return this.some({ kind: "name", mode: "rename" } as Parsed);
    if (interaction.customId === "br:colormodal")
      return this.some({ kind: "color" } as Parsed);
    return this.none();
  }

  public async run(interaction: ModalSubmitInteraction, data: Parsed) {
    if (!interaction.inCachedGuild()) return;
    if (data.kind === "color") return this.#recolor(interaction);
    return data.mode === "create"
      ? this.#create(interaction)
      : this.#rename(interaction);
  }

  async #create(interaction: ModalSubmitInteraction<"cached">) {
    const { member } = interaction;
    const config = await getBoosterConfig(member.guild.id);

    const denial = await accessDenial(member, config);
    if (denial) return this.#err(interaction, denial);
    if (await getRole(member.guild.id, member.id))
      return this.#err(interaction, "You already have a custom role.");

    const check = validateRoleName(
      interaction.fields.getTextInputValue("name"),
      config.nameMaxLength,
    );
    if (!check.ok) return this.#err(interaction, check.reason!);

    const role = await createBoosterRole(member, check.value!, 0, config);
    const record: RoleRecord = {
      roleId: role.id,
      ownerId: member.id,
      name: check.value!,
      color: role.color,
      createdAt: Date.now(),
      sharedWith: [],
    };
    await setRole(member.guild.id, record);

    await postToChannel(
      member.guild,
      config.showcaseChannelId,
      makeInfoCard(
        "✨ New Booster Role",
        `${userMention(member.id)} just created ${roleMention(role.id)}. Boost the server to make your own!`,
      ),
    );

    return interaction.reply(ephemeralCard(buildPanel(record)));
  }

  async #rename(interaction: ModalSubmitInteraction<"cached">) {
    const { member } = interaction;
    const record = await getRole(member.guild.id, member.id);
    if (!record) return this.#err(interaction, "You don't have a custom role.");

    const config = await getBoosterConfig(member.guild.id);
    const check = validateRoleName(
      interaction.fields.getTextInputValue("name"),
      config.nameMaxLength,
    );
    if (!check.ok) return this.#err(interaction, check.reason!);

    const role = member.guild.roles.cache.get(record.roleId);
    if (role)
      await role.setName(check.value!, "Booster role rename").catch(() => null);
    record.name = check.value!;
    await setRole(member.guild.id, record);

    return interaction.reply(ephemeralCard(buildPanel(record)));
  }

  async #recolor(interaction: ModalSubmitInteraction<"cached">) {
    const { member } = interaction;
    const record = await getRole(member.guild.id, member.id);
    if (!record) return this.#err(interaction, "You don't have a custom role.");

    const color = parseHexColor(interaction.fields.getTextInputValue("color"));
    if (color === null)
      return this.#err(
        interaction,
        "That's not a valid hex colour. Try something like `#5865F2`.",
      );

    const role = member.guild.roles.cache.get(record.roleId);
    if (role)
      await role
        .setColor(color, `Booster role recolour to ${colorToHex(color)}`)
        .catch(() => null);
    record.color = color;
    await setRole(member.guild.id, record);

    return interaction.reply(ephemeralCard(buildPanel(record)));
  }

  #err(interaction: ModalSubmitInteraction, message: string) {
    return interaction.reply(ephemeralCard(makeErrorCard("Error", message)));
  }
}
