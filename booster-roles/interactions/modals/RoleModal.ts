import type { ModalSubmitInteraction } from "discord.js";
import { defineInteraction } from "@lumi-devs/lumi/lib/interactions/InteractionDef.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
} from "@lumi-devs/lumi/lib/ui/Cards.js";
import type { Container } from "@lumi-devs/lumi/lib/Services.js";
import { getBoosterConfig } from "../../utilities/Config.js";
import {
  addShare,
  deleteRole,
  getRole,
  removeShare,
  setRole,
  type BoosterRole,
} from "../../utilities/Data.js";
import { accessDenial } from "../../utilities/Access.js";
import { colorToHex, parseHexColor, validateRoleName } from "../../utilities/Engine.js";
import { buildPanel } from "../../utilities/Ui.js";
import { InteractionIds, InteractionPrefixes, MODULE_NAME } from "../../utilities/Keys.js";

function parseUserId(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^<@!?(\d{17,20})>$|^(\d{17,20})$/);
  return m?.[1] ?? m?.[2] ?? null;
}

async function createRole(
  services: Container,
  interaction: ModalSubmitInteraction,
  guildId: string,
): Promise<void> {
  const config = await getBoosterConfig(services, guildId);
  const denial = await accessDenial(services, guildId, interaction.user.id, config);
  if (denial) {
    await interaction.reply(ephemeralCard(makeErrorCard("Error", denial)));
    return;
  }

  const nameVal = interaction.fields.getTextInputValue("name");
  const check = validateRoleName(nameVal, config.nameMaxLength);
  if (!check.ok) {
    await interaction.reply(ephemeralCard(makeErrorCard("Error", check.reason!)));
    return;
  }

  if (await getRole(services, guildId, interaction.user.id)) {
    await interaction.reply(
      ephemeralCard(makeErrorCard("Error", "You already have a custom role.")),
    );
    return;
  }

  const guild =
    services.client.guilds.cache.get(guildId) ??
    (await services.client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    await interaction.reply(ephemeralCard(makeErrorCard("Error", "Server not found.")));
    return;
  }

  const created = await guild.roles
    .create({
      name: check.value!,
      reason: `Booster custom role for ${interaction.user.id}`,
    })
    .catch(() => null);

  if (!created) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Error",
          "Couldn't create the role. The bot may lack role permissions.",
        ),
      ),
    );
    return;
  }

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const assigned = member
    ? await member.roles
        .add(created.id, "Assigning created booster role")
        .then(() => true)
        .catch(() => false)
    : false;

  if (!assigned) {
    await created.delete("Owner role assignment failed").catch(() => {});
    await interaction.reply(
      ephemeralCard(makeErrorCard("Error", "Role created but could not be assigned to you.")),
    );
    return;
  }

  const boosterRole: BoosterRole = {
    ownerId: interaction.user.id,
    roleId: created.id,
    name: check.value!,
    color: null,
    icon: null,
    sharedWith: [],
  };
  await setRole(services, guildId, boosterRole);

  if (config.showcaseChannelId) {
    const showcaseChannel =
      services.client.channels.cache.get(config.showcaseChannelId) ??
      (await services.client.channels.fetch(config.showcaseChannelId).catch(() => null));
    if (showcaseChannel && showcaseChannel.isSendable()) {
      await showcaseChannel
        .send(
          makeInfoCard(
            "✨ New Booster Role",
            `<@${interaction.user.id}> just created <@&${boosterRole.roleId}>. Boost the server to make your own!`,
          ),
        )
        .catch(() => {});
    }
  }

  await interaction.reply(ephemeralCard(buildPanel(boosterRole)));
}

async function renameRole(
  services: Container,
  interaction: ModalSubmitInteraction,
  guildId: string,
): Promise<void> {
  const role = await getRole(services, guildId, interaction.user.id);
  if (!role) {
    await interaction.reply(
      ephemeralCard(makeErrorCard("Error", "You don't have a custom role.")),
    );
    return;
  }

  const config = await getBoosterConfig(services, guildId);
  const nameVal = interaction.fields.getTextInputValue("name");
  const check = validateRoleName(nameVal, config.nameMaxLength);
  if (!check.ok) {
    await interaction.reply(ephemeralCard(makeErrorCard("Error", check.reason!)));
    return;
  }

  const guild =
    services.client.guilds.cache.get(guildId) ??
    (await services.client.guilds.fetch(guildId).catch(() => null));
  const discordRole = guild
    ? guild.roles.cache.get(role.roleId) ??
      (await guild.roles.fetch(role.roleId).catch(() => null))
    : null;

  if (!discordRole) {
    await deleteRole(services, guildId, interaction.user.id);
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Gone",
          "That role no longer exists on the server. Create a new one from the panel.",
        ),
      ),
    );
    return;
  }

  const edited = await discordRole
    .edit({ name: check.value!, reason: "Booster role rename" })
    .then(() => true)
    .catch(() => false);

  if (!edited) {
    await interaction.reply(
      ephemeralCard(makeErrorCard("Error", "Could not rename the role.")),
    );
    return;
  }

  role.name = check.value!;
  await setRole(services, guildId, role);
  await interaction.reply(ephemeralCard(buildPanel(role)));
}

async function recolorRole(
  services: Container,
  interaction: ModalSubmitInteraction,
  guildId: string,
): Promise<void> {
  const role = await getRole(services, guildId, interaction.user.id);
  if (!role) {
    await interaction.reply(
      ephemeralCard(makeErrorCard("Error", "You don't have a custom role.")),
    );
    return;
  }

  const colorVal = interaction.fields.getTextInputValue("color");
  const colorInt = parseHexColor(colorVal);
  if (colorInt === null) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Error",
          "That's not a valid hex colour. Try something like `#5865F2`.",
        ),
      ),
    );
    return;
  }

  const hex = colorToHex(colorInt);
  const guild =
    services.client.guilds.cache.get(guildId) ??
    (await services.client.guilds.fetch(guildId).catch(() => null));
  const discordRole = guild
    ? guild.roles.cache.get(role.roleId) ??
      (await guild.roles.fetch(role.roleId).catch(() => null))
    : null;

  if (!discordRole) {
    await deleteRole(services, guildId, interaction.user.id);
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Gone",
          "That role no longer exists on the server. Create a new one from the panel.",
        ),
      ),
    );
    return;
  }

  const edited = await discordRole
    .edit({ color: colorInt, reason: `Booster role recolor to ${hex}` })
    .then(() => true)
    .catch(() => false);

  if (!edited) {
    await interaction.reply(
      ephemeralCard(makeErrorCard("Error", "Could not recolour the role.")),
    );
    return;
  }

  role.color = hex;
  await setRole(services, guildId, role);
  await interaction.reply(ephemeralCard(buildPanel(role)));
}

async function shareRole(
  services: Container,
  interaction: ModalSubmitInteraction,
  guildId: string,
): Promise<void> {
  const config = await getBoosterConfig(services, guildId);
  const role = await getRole(services, guildId, interaction.user.id);
  if (!role) {
    await interaction.reply(
      ephemeralCard(makeErrorCard("Gone", "You no longer have a custom role.")),
    );
    return;
  }

  const userVal = interaction.fields.getTextInputValue("user");
  const target = parseUserId(userVal);
  if (!target || target === interaction.user.id) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Error", "Mention or paste the ID of another member."),
      ),
    );
    return;
  }

  const result = await addShare(
    services,
    guildId,
    interaction.user.id,
    target,
    config.maxShares,
  );
  if (!result.ok) {
    await interaction.reply(ephemeralCard(makeErrorCard("Can't Share", result.reason)));
    return;
  }

  const guild =
    services.client.guilds.cache.get(guildId) ??
    (await services.client.guilds.fetch(guildId).catch(() => null));
  const targetMember = guild
    ? await guild.members.fetch(target).catch(() => null)
    : null;

  const assigned = targetMember
    ? await targetMember.roles
        .add(role.roleId, "Shared booster role")
        .then(() => true)
        .catch(() => false)
    : false;

  if (!assigned) {
    await removeShare(services, guildId, interaction.user.id, target);
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Can't Share",
          `<@${target}> couldn't be given the role (they may have left the server).`,
        ),
      ),
    );
    return;
  }

  await interaction.reply(
    ephemeralCard(
      makeSuccessCard("Shared", `<@${target}> now has your role.`),
    ),
  );
}

export const roleModal = defineInteraction<ModalSubmitInteraction>({
  prefix: InteractionPrefixes.MODAL,
  kinds: ["modal"],
  module: MODULE_NAME,
  async run(services: Container, interaction: ModalSubmitInteraction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guildId) return;
    const guildId = interaction.guildId;

    switch (interaction.customId) {
      case InteractionIds.NAME_MODAL_CREATE:
        return createRole(services, interaction, guildId);
      case InteractionIds.NAME_MODAL_RENAME:
        return renameRole(services, interaction, guildId);
      case InteractionIds.COLOR_MODAL:
        return recolorRole(services, interaction, guildId);
      case InteractionIds.SHARE_MODAL:
        return shareRole(services, interaction, guildId);
      default:
        return;
    }
  },
});
