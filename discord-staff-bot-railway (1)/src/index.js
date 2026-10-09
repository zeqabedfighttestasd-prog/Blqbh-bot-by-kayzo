import { randomUUID } from "node:crypto";
import {
  ActivityType,
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { config } from "./config.js";
import { StateStore } from "./store.js";
import {
  applicationContinueRow,
  applicationFirstModal,
  applicationPanel,
  applicationReview,
  applicationSecondModal,
  denialModal,
  reviewButtons,
  statusReviewEmbed,
  ticketCloseRow,
  ticketEmbed,
  ticketModal,
  ticketPanel,
} from "./ui.js";

const store = new StateStore(config.stateFile);
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});
const cooldownDuration = 7 * 24 * 60 * 60 * 1000;
const ticketCreationInProgress = new Set();

const commands = [
  new SlashCommandBuilder()
    .setName("toggleapp")
    .setDescription("Open or close Trainee Staff applications.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

client.once(Events.ClientReady, async (readyClient) => {
  readyClient.user.setPresence({
    activities: [
      {
        name: "Made by Kayzo for MCPE Community",
        type: ActivityType.Listening,
      },
    ],
    status: "online",
  });

  try {
    await readyClient.application.commands.set(commands, config.guildId);
    console.info(`Registered /toggleapp in server ${config.guildId}.`);
    await syncPanel("applications", config.applicationChannelId, applicationPanel());
    await syncPanel("tickets", config.ticketPanelChannelId, ticketPanel());
    await syncExistingTicketAccessAndControls();
  } catch (error) {
    console.error("Bot connected, but setup did not finish:", error);
    console.error(
      "Check GUILD_ID, the configured channels, and the bot's channel permissions.",
    );
  }
  console.info(`Logged in as ${readyClient.user.tag}.`);
});

client.on(Events.InteractionCreate, (interaction) => {
  void handleInteraction(interaction).catch(async (error) => {
    console.error("Interaction failed:", error);
    const message =
      "Something went wrong while handling that action. Please try again or contact staff.";
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: message, ephemeral: true });
      } else {
        await interaction.reply({ content: message, ephemeral: true });
      }
    } catch (replyError) {
      console.error("Could not send the interaction error message:", replyError);
    }
  });
});

client.on(Events.Error, (error) => {
  console.error("Discord client error:", error);
});

client.on(Events.Warn, (warning) => {
  console.warn("Discord client warning:", warning);
});

await client.login(config.token);

async function syncPanel(kind, channelId, payload) {
  const channel = await client.channels.fetch(channelId);
  if (
    !channel?.isTextBased() ||
    !("send" in channel) ||
    channel.guildId !== config.guildId
  ) {
    throw new Error(`Configured ${kind} panel channel is not a text channel.`);
  }
  const existingId = store.get().panels[kind];
  if (existingId) {
    try {
      const existingMessage = await channel.messages.fetch(existingId);
      await existingMessage.edit(payload);
      console.info(`Updated the ${kind} panel in channel ${channelId}.`);
      return;
    } catch (error) {
      // Recreate the panel if the saved message was removed.
      if (error?.code !== 10008) throw error;
    }
  }
  const message = await channel.send(payload);
  store.setPanel(kind, message.id);
  console.info(`Posted the ${kind} panel in channel ${channelId}.`);
}

async function syncExistingTicketAccessAndControls() {
  for (const ticket of Object.values(store.get().tickets)) {
    try {
      const channel = await client.channels.fetch(ticket.channelId);
      if (
        !channel?.isTextBased() ||
        !("send" in channel) ||
        channel.guildId !== config.guildId
      ) {
        continue;
      }
      const staffRoleIds = getTicketStaffRoleIds(channel.guild);
      for (const roleId of staffRoleIds) {
        await channel.permissionOverwrites.edit(roleId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true,
          EmbedLinks: true,
        });
      }
      if (ticket.closedAt || ticket.closeMessageId) continue;
      const message = await channel.send({
        content: "Use the button below to close this ticket when it has been resolved.",
        components: [ticketCloseRow(ticket.id)],
        allowedMentions: { parse: [] },
      });
      store.updateTicket(ticket.id, { closeMessageId: message.id });
      console.info(`Added a close button to existing ticket channel ${channel.id}.`);
    } catch (error) {
      console.error(`Could not add a close button to ticket ${ticket.id}:`, error);
    }
  }
}

async function handleInteraction(interaction) {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "toggleapp") {
      await toggleApplications(interaction);
    }
    return;
  }

  if (interaction.isButton()) {
    await handleButton(interaction);
    return;
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "ticket:select") {
      const type = interaction.values[0];
      if (!inConfiguredGuild(interaction) || !["support", "report"].includes(type)) {
        await ephemeral(interaction, "Choose a valid ticket category in this server.");
        return;
      }
      await interaction.showModal(ticketModal(type));
    }
    return;
  }

  if (interaction.isModalSubmit()) {
    await handleModal(interaction);
  }
}

async function toggleApplications(interaction) {
  if (
    interaction.guildId !== config.guildId ||
    !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  ) {
    await interaction.reply({
      content: "Only server administrators can change the application status.",
      ephemeral: true,
    });
    return;
  }
  const isOpen = !store.get().applicationsOpen;
  store.setApplicationsOpen(isOpen);
  await interaction.reply({
    content: `Trainee Staff applications are now **${isOpen ? "OPEN" : "CLOSED"}**.`,
    ephemeral: true,
  });
}

async function handleButton(interaction) {
  const [kind, action, id] = interaction.customId.split(":");
  if (kind === "application" && action === "begin") {
    await beginApplication(interaction);
  } else if (kind === "application" && action === "continue") {
    await continueApplication(interaction, id);
  } else if (kind === "application" && action === "accept") {
    await acceptApplication(interaction, id);
  } else if (kind === "application" && action === "deny") {
    await openDenialModal(interaction, id);
  } else if (kind === "ticket" && action === "close") {
    await closeTicket(interaction, id);
  } else if (kind === "ticket" && action === "begin") {
    await interaction.showModal(ticketModal(id));
  }
}

async function beginApplication(interaction) {
  if (!inConfiguredGuild(interaction)) {
    await ephemeral(interaction, "Applications are not available in this server.");
    return;
  }
  const state = store.get();
  const remaining = store.getCooldownRemaining(interaction.user.id);
  if (remaining > 0) {
    await ephemeral(
      interaction,
      `You can apply again <t:${Math.ceil((Date.now() + remaining) / 1000)}:R>.`,
    );
    return;
  }
  const activeApplication = store.findActiveApplication(interaction.user.id);
  if (activeApplication?.status === "pending") {
    await ephemeral(interaction, "Your application is already awaiting a staff decision.");
    return;
  }
  if (activeApplication?.status === "firstStage") {
    await interaction.showModal(applicationFirstModal(activeApplication.id));
    return;
  }
  if (activeApplication?.status === "secondStage") {
    await interaction.showModal(applicationSecondModal(activeApplication.id));
    return;
  }
  if (!state.applicationsOpen) {
    await ephemeral(interaction, "Trainee Staff applications are currently closed.");
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (member.roles.cache.has(config.traineeRoleId)) {
    await ephemeral(interaction, "You already have the Trainee role and cannot apply.");
    return;
  }

  const applicationId = randomUUID();
  store.createApplication({
    id: applicationId,
    userId: interaction.user.id,
    status: "firstStage",
    answers: {},
    createdAt: Date.now(),
    reviewChannelId: null,
    reviewMessageId: null,
  });
  try {
    await interaction.showModal(applicationFirstModal(applicationId));
  } catch (error) {
    store.deleteApplication(applicationId);
    throw error;
  }
}

async function continueApplication(interaction, applicationId) {
  const application = store.get().applications[applicationId];
  if (
    !application ||
    application.userId !== interaction.user.id ||
    application.status !== "secondStage"
  ) {
    await ephemeral(interaction, "This application form has expired or is no longer available.");
    return;
  }
  await interaction.showModal(applicationSecondModal(applicationId));
}

async function openDenialModal(interaction, applicationId) {
  if (!isApplicationReviewer(interaction)) {
    await ephemeral(interaction, "You need Manage Roles or Administrator permission to review applications.");
    return;
  }
  const application = store.get().applications[applicationId];
  if (!application || application.status !== "pending") {
    await ephemeral(interaction, "This application has already been reviewed or is unavailable.");
    return;
  }
  await interaction.showModal(denialModal(applicationId));
}

async function acceptApplication(interaction, applicationId) {
  if (!isApplicationReviewer(interaction)) {
    await ephemeral(interaction, "You need Manage Roles or Administrator permission to review applications.");
    return;
  }
  const application = store.get().applications[applicationId];
  if (!application || application.status !== "pending") {
    await ephemeral(interaction, "This application has already been reviewed or is unavailable.");
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;
  const roleIds = [config.traineeRoleId, config.extraAcceptedRoleId];
  const roles = await Promise.all(roleIds.map((roleId) => guild.roles.fetch(roleId)));
  if (roles.some((role) => !role)) {
    await interaction.editReply("A configured acceptance role was not found. Check the role IDs in the bot settings.");
    return;
  }
  const botMember = await guild.members.fetchMe();
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.editReply("The bot needs the Manage Roles permission to accept applications.");
    return;
  }
  if (roles.some((role) => role.managed || role.position >= botMember.roles.highest.position)) {
    await interaction.editReply("Move the bot's highest role above both roles it needs to assign.");
    return;
  }

  const member = await guild.members.fetch(application.userId).catch(() => null);
  if (!member) {
    await interaction.editReply("The applicant is no longer in this server, so the roles could not be assigned.");
    return;
  }
  await member.roles.add(roleIds, `Trainee Staff application accepted by ${interaction.user.tag}`);

  const decidedAt = Date.now();
  const accepted = store.acceptApplication(applicationId, decidedAt);
  await updateReviewMessage(interaction, accepted, "accepted");
  let dmSent = true;
  try {
    await member.send(
      "Congratulations! Your Trainee Staff application has been accepted. You have been given the Trainee Staff roles. Welcome to the team!",
    );
  } catch {
    dmSent = false;
  }
  await interaction.editReply(
    dmSent
      ? "Application accepted, both roles were added, and the applicant was congratulated by DM."
      : "Application accepted and both roles were added, but the applicant's DMs are closed.",
  );
}

async function handleModal(interaction) {
  const [kind, stage, id] = interaction.customId.split(":");
  if (kind === "application" && stage === "first") {
    await submitFirstApplicationStage(interaction, id);
  } else if (kind === "application" && stage === "second") {
    await submitSecondApplicationStage(interaction, id);
  } else if (kind === "application" && stage === "deny-reason") {
    await denyApplication(interaction, id);
  } else if (kind === "ticket" && stage === "submit") {
    await submitTicket(interaction, id);
  }
}

async function submitFirstApplicationStage(interaction, applicationId) {
  const application = store.get().applications[applicationId];
  if (
    !application ||
    application.userId !== interaction.user.id ||
    application.status !== "firstStage"
  ) {
    await ephemeral(interaction, "This application form has expired or is no longer available.");
    return;
  }
  store.updateApplication(applicationId, {
    status: "secondStage",
    answers: {
      ign: interaction.fields.getTextInputValue("ign").trim(),
      age: interaction.fields.getTextInputValue("age").trim(),
      why: interaction.fields.getTextInputValue("why").trim(),
    },
  });
  await interaction.reply({
    content: "First part saved. Click below to complete the other two questions.",
    components: [applicationContinueRow(applicationId)],
    ephemeral: true,
  });
}

async function submitSecondApplicationStage(interaction, applicationId) {
  const application = store.get().applications[applicationId];
  if (
    !application ||
    application.userId !== interaction.user.id ||
    application.status !== "secondStage"
  ) {
    await ephemeral(interaction, "This application form has expired or is no longer available.");
    return;
  }
  const answers = {
    ...application.answers,
    timezone: interaction.fields.getTextInputValue("timezone").trim(),
    partnerships: interaction.fields.getTextInputValue("partnerships").trim(),
  };
  store.updateApplication(applicationId, {
    status: "sending",
    answers,
    submittedAt: Date.now(),
  });
  await interaction.deferReply({ ephemeral: true });

  try {
    const reviewChannel = await client.channels.fetch(config.reviewChannelId);
    if (!reviewChannel?.isTextBased() || !("send" in reviewChannel)) {
      throw new Error("The application review channel is not a text channel.");
    }
    const message = await reviewChannel.send({
      embeds: [
        applicationReview(
          { ...application, answers, submittedAt: Date.now() },
          interaction.user,
        ),
      ],
      components: [reviewButtons(applicationId)],
      allowedMentions: { parse: [] },
    });
    store.updateApplication(applicationId, {
      status: "pending",
      reviewChannelId: config.reviewChannelId,
      reviewMessageId: message.id,
    });
    await interaction.editReply(
      "Your application is complete and has been sent to the staff team for review.",
    );
  } catch (error) {
    store.updateApplication(applicationId, { status: "secondStage" });
    throw error;
  }
}

async function denyApplication(interaction, applicationId) {
  if (!isApplicationReviewer(interaction)) {
    await ephemeral(interaction, "You need Manage Roles or Administrator permission to review applications.");
    return;
  }
  const application = store.get().applications[applicationId];
  if (!application || application.status !== "pending") {
    await ephemeral(interaction, "This application has already been reviewed or is unavailable.");
    return;
  }
  const reason = interaction.fields.getTextInputValue("reason").trim();
  if (!reason) {
    await ephemeral(interaction, "Please enter a reason for denying the application.");
    return;
  }
  const denied = store.denyApplication(applicationId, reason, Date.now());
  await interaction.deferReply({ ephemeral: true });
  await updateReviewMessage(interaction, denied, "denied");
  let dmSent = true;
  try {
    const applicant = await client.users.fetch(denied.userId);
    await applicant.send(
      `Your Trainee Staff application was denied.\n\nReason: ${reason}\n\nYou can apply again after the 7-day waiting period.`,
    );
  } catch {
    dmSent = false;
  }
  await interaction.editReply(
    dmSent
      ? "Application denied. The reason was sent to the applicant by DM."
      : "Application denied, but the applicant's DMs are closed. The seven-day cooldown is active.",
  );
}

async function closeTicket(interaction, ticketId) {
  const ticket = store.get().tickets[ticketId];
  if (
    !inConfiguredGuild(interaction) ||
    !ticket ||
    ticket.channelId !== interaction.channelId ||
    !interaction.channel?.isTextBased()
  ) {
    await ephemeral(interaction, "This ticket is unavailable or this button is not in its ticket channel.");
    return;
  }
  if (ticket.closedAt) {
    await ephemeral(interaction, "This ticket is already closed.");
    return;
  }

  const isRequester = interaction.user.id === ticket.userId;
  const hasPermission = (permission) =>
    interaction.memberPermissions?.has(permission) ?? false;
  let isConfiguredStaff = false;
  if (!isRequester && !hasPermission(PermissionFlagsBits.Administrator)) {
    if (config.ticketStaffRoleIds.length) {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      isConfiguredStaff = config.ticketStaffRoleIds.some((roleId) =>
        member.roles.cache.has(roleId),
      );
    }
  }
  const isStaff =
    hasPermission(PermissionFlagsBits.Administrator) ||
    isConfiguredStaff;
  if (!isRequester && !isStaff) {
    await ephemeral(
      interaction,
      "Only the ticket requester, ticket staff, or a server administrator can close this ticket.",
    );
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const channel = interaction.channel;
  await channel.permissionOverwrites.edit(ticket.userId, {
    SendMessages: false,
    SendMessagesInThreads: false,
    CreatePublicThreads: false,
    CreatePrivateThreads: false,
    AddReactions: false,
  });

  const closedAt = Date.now();
  store.updateTicket(ticketId, {
    closedAt,
    closedBy: interaction.user.id,
  });

  if (!channel.name.startsWith("closed-")) {
    try {
      await channel.setName(`closed-${channel.name}`.slice(0, 100));
    } catch (error) {
      console.error(`Ticket ${ticketId} was locked but its channel could not be renamed:`, error);
    }
  }
  try {
    await interaction.message.edit({
      components: [ticketCloseRow(ticketId, true)],
    });
  } catch (error) {
    console.error(`Ticket ${ticketId} was locked but its close button could not be disabled:`, error);
  }
  try {
    await channel.send({
      content: `🔒 Ticket closed by <@${interaction.user.id}>. The channel and transcript have been preserved.`,
      allowedMentions: { users: [interaction.user.id] },
    });
  } catch (error) {
    console.error(`Ticket ${ticketId} was locked but the close notice could not be sent:`, error);
  }
  await interaction.editReply(
    "Ticket closed and archived. The channel and transcript are preserved, and the requester can no longer send messages.",
  );
}

async function updateReviewMessage(interaction, application, status) {
  try {
    const channel = await client.channels.fetch(application.reviewChannelId);
    if (!channel?.isTextBased() || !("messages" in channel)) {
      throw new Error("The saved application review channel is unavailable.");
    }
    const message = await channel.messages.fetch(application.reviewMessageId);
    await message.edit({
      embeds: [
        statusReviewEmbed(
          application,
          interaction.user.id,
          status,
          message.embeds[0],
        ),
      ],
      components: [reviewButtons(application.id, true)],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error("Could not update the reviewed application message:", error);
  }
}

async function findActiveTicketForUser(userId) {
  let ticket = store.findOpenTicketForUser(userId);
  while (ticket) {
    let channel = null;
    try {
      channel = await client.channels.fetch(ticket.channelId);
    } catch (error) {
      if (error?.code !== 10003) throw error;
    }
    if (
      channel?.guildId === config.guildId &&
      channel.isTextBased()
    ) {
      return ticket;
    }
    store.updateTicket(ticket.id, {
      closedAt: Date.now(),
      closedBy: null,
      channelMissing: true,
    });
    ticket = store.findOpenTicketForUser(userId);
  }
  return null;
}

async function submitTicket(interaction, type) {
  if (!inConfiguredGuild(interaction) || !["support", "report"].includes(type)) {
    await ephemeral(interaction, "Tickets are not available in this server.");
    return;
  }

  const userId = interaction.user.id;
  if (ticketCreationInProgress.has(userId)) {
    await ephemeral(interaction, "Your ticket is already being created. Please wait a moment.");
    return;
  }
  ticketCreationInProgress.add(userId);
  try {
    const existingTicket = await findActiveTicketForUser(userId);
    if (existingTicket) {
      await ephemeral(
        interaction,
        `You already have an open ticket: <#${existingTicket.channelId}>. Continue there or close it before creating another.`,
      );
      return;
    }

    const answers =
      type === "support"
        ? {
            "What is your question?": interaction.fields
              .getTextInputValue("question")
              .trim(),
          }
        : {
            "Discord username of the person you want to report": interaction.fields
              .getTextInputValue("discordUsername")
              .trim(),
            "In-game name": interaction.fields.getTextInputValue("inGameName").trim(),
            "What did they do?": interaction.fields
              .getTextInputValue("whatHappened")
              .trim(),
          };

    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild;
    const staffRoleIds = getTicketStaffRoleIds(guild);
    const everyoneRoleId = guild.roles.everyone.id;
    const botMember = await guild.members.fetchMe();
    const safeName = interaction.user.username
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "member";
    const ticketId = randomUUID();
    const typeName = type === "report" ? "report" : "support";
    const ticketName = `${typeName}-${safeName}-${userId.slice(-4)}`;
    const channel = await guild.channels.create({
      name: ticketName,
      type: ChannelType.GuildText,
      topic: `${typeName === "report" ? "Report" : "Support"} ticket for user ${userId}`,
      permissionOverwrites: [
        {
          id: everyoneRoleId,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: userId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
          ],
        },
        {
          id: botMember.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
          ],
        },
        ...staffRoleIds.map((roleId) => ({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
          ],
        })),
      ],
      reason: `${typeName} ticket opened by ${interaction.user.tag}`,
    });

    const ticket = {
      id: ticketId,
      userId,
      channelId: channel.id,
      type,
      openedAt: Date.now(),
      answers,
    };
    try {
      const rolePings = config.ticketStaffRoleIds
        .filter((roleId) => staffRoleIds.includes(roleId))
        .map((roleId) => `<@&${roleId}>`)
        .join(" ");
      const ticketMessage = await channel.send({
        content: `${rolePings} <@${userId}> opened a ${typeName} ticket.`.trim(),
        embeds: [ticketEmbed(ticket, interaction.user)],
        components: [ticketCloseRow(ticketId)],
        allowedMentions: {
          users: [userId],
          roles: config.ticketStaffRoleIds.filter((roleId) =>
            staffRoleIds.includes(roleId),
          ),
        },
      });
      store.addTicket({
        ...ticket,
        closeMessageId: ticketMessage.id,
        answers: undefined,
      });
    } catch (error) {
      await channel.delete("Ticket setup failed; no ticket message could be posted.").catch(() => {});
      throw error;
    }
    await interaction.editReply(`Your ${typeName} ticket is open: <#${channel.id}>`);
  } finally {
    ticketCreationInProgress.delete(userId);
  }
}

function getTicketStaffRoleIds(guild) {
  const configured = config.ticketStaffRoleIds.length
    ? config.ticketStaffRoleIds
    : guild.roles.cache
        .filter(
          (role) =>
            role.id !== guild.id &&
            !role.managed &&
            (role.permissions.has(PermissionFlagsBits.ManageChannels) ||
              role.permissions.has(PermissionFlagsBits.Administrator)),
        )
        .map((role) => role.id);
  const roleIds = [...new Set(configured)].filter(
    (roleId) => roleId !== guild.id && guild.roles.cache.has(roleId),
  );
  if (roleIds.length === 0) {
    throw new Error(
      "No ticket staff roles found. Set TICKET_STAFF_ROLE_IDS, or give staff roles Manage Channels permission.",
    );
  }
  return roleIds;
}

function inConfiguredGuild(interaction) {
  return interaction.inGuild() && interaction.guildId === config.guildId;
}

function isApplicationReviewer(interaction) {
  return (
    inConfiguredGuild(interaction) &&
    (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles))
  );
}

async function ephemeral(interaction, content) {
  await interaction.reply({ content, ephemeral: true });
}
