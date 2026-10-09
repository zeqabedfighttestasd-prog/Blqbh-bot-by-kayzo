import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

export const COLORS = {
  blue: 0x3498db,
  green: 0x2ecc71,
  red: 0xe74c3c,
  dark: 0x2b2d31,
};

export function applicationPanel() {
  const embed = new EmbedBuilder()
    .setColor(COLORS.blue)
    .setTitle("📋 Trainee Staff Application")
    .setDescription(
      "Want to join our staff team? Apply for the Trainee position and show us what you can do!\n\n" +
        "⭐ Work hard, stay active, and help the community. 📈 Do good work, and you may be promoted to a higher staff rank!\n\n" +
        "Good luck with your application! 🍀",
    );
  const button = new ButtonBuilder()
    .setCustomId("application:begin")
    .setLabel("Apply")
    .setEmoji("🔨")
    .setStyle(ButtonStyle.Primary);
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] };
}

export function ticketPanel() {
  const embed = new EmbedBuilder()
    .setColor(COLORS.blue)
    .setTitle("🎫 TICKET CENTER")
    .setDescription(
      "Need help? Select a category from the dropdown menu below to create a ticket.\n\n" +
        "🔴 **Report**\n" +
        "Report a user, staff member, or rule violation.\n\n" +
        "🔵 **Support**\n" +
        "Get help with questions, issues, or other inquiries.\n\n" +
        "Please provide clear information when opening a ticket. Our staff team will assist you as soon as possible.\n\n" +
        "*Please avoid creating duplicate tickets.*",
    );
  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticket:select")
    .setPlaceholder("Select a ticket category")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      {
        label: "Report",
        value: "report",
        description: "Report a user, staff member, or rule violation.",
        emoji: "🔴",
      },
      {
        label: "Support",
        value: "support",
        description: "Get help with questions, issues, or other inquiries.",
        emoji: "🔵",
      },
    );
  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)],
  };
}

function textInput({ id, label, placeholder, style = TextInputStyle.Short, required = true }) {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setRequired(required)
    .setStyle(style);
  if (placeholder) input.setPlaceholder(placeholder);
  return input;
}

export function applicationFirstModal(applicationId) {
  return new ModalBuilder()
    .setCustomId(`application:first:${applicationId}`)
    .setTitle("Trainee Staff Application · 1 of 2")
    .addComponents(
      new ActionRowBuilder().addComponents(
        textInput({ id: "ign", label: "What is your IGN" }),
      ),
      new ActionRowBuilder().addComponents(
        textInput({ id: "age", label: "What is your age" }),
      ),
      new ActionRowBuilder().addComponents(
        textInput({
          id: "why",
          label: "Why do you want to apply for staff position",
          style: TextInputStyle.Paragraph,
          placeholder: "Tell us why you want to apply for staff position.",
        }),
      ),
    );
}

export function applicationSecondModal(applicationId) {
  return new ModalBuilder()
    .setCustomId(`application:second:${applicationId}`)
    .setTitle("Trainee Staff Application · 2 of 2")
    .addComponents(
      new ActionRowBuilder().addComponents(
        textInput({
          id: "timezone",
          label: "Timezone and location",
          placeholder: "What timezones are you in, and where are you from?",
        }),
      ),
      new ActionRowBuilder().addComponents(
        textInput({
          id: "partnerships",
          label: "How many partnerships can you do?",
        }),
      ),
    );
}

export function applicationContinueRow(applicationId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`application:continue:${applicationId}`)
      .setLabel("Complete other two")
      .setStyle(ButtonStyle.Primary),
  );
}

export function applicationReview(application, user) {
  const answers = application.answers;
  const embed = new EmbedBuilder()
    .setColor(COLORS.blue)
    .setTitle("📋 Trainee Staff Application")
    .setDescription(
      `Applicant: <@${application.userId}> (\`${application.userId}\`)\nSubmitted <t:${Math.floor(application.submittedAt / 1000)}:R>`,
    )
    .addFields(
      { name: "What is your IGN", value: safeField(answers.ign) },
      { name: "What is your age", value: safeField(answers.age) },
      {
        name: "Why do you want to apply for staff position",
        value: safeField(answers.why),
      },
      {
        name: "What timezones are you in, and where are you from?",
        value: safeField(answers.timezone),
      },
      {
        name: "How many partnerships can you do?",
        value: safeField(answers.partnerships),
      },
    )
    .setFooter({ text: `Application ID: ${application.id}` });
  if (user?.displayAvatarURL) embed.setThumbnail(user.displayAvatarURL());
  return embed;
}

export function reviewButtons(applicationId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`application:accept:${applicationId}`)
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`application:deny:${applicationId}`)
      .setLabel("Deny")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

export function denialModal(applicationId) {
  return new ModalBuilder()
    .setCustomId(`application:deny-reason:${applicationId}`)
    .setTitle("Deny Trainee Application")
    .addComponents(
      new ActionRowBuilder().addComponents(
        textInput({
          id: "reason",
          label: "Reason for denial",
          placeholder: "This reason will be sent to the applicant.",
          style: TextInputStyle.Paragraph,
        }),
      ),
    );
}

export function ticketModal(type) {
  const report = type === "report";
  const modal = new ModalBuilder()
    .setCustomId(`ticket:submit:${type}`)
    .setTitle(report ? "Create a Report Ticket" : "Create a Support Ticket");
  if (!report) {
    return modal.addComponents(
      new ActionRowBuilder().addComponents(
        textInput({
          id: "question",
          label: "What is your question?",
          style: TextInputStyle.Paragraph,
          placeholder: "Describe what you need help with.",
        }),
      ),
    );
  }
  return modal.addComponents(
    new ActionRowBuilder().addComponents(
      textInput({
        id: "discordUsername",
        label: "Discord username to report",
        placeholder: "Discord username of the person you want to report",
      }),
    ),
    new ActionRowBuilder().addComponents(
      textInput({ id: "inGameName", label: "In-game name" }),
    ),
    new ActionRowBuilder().addComponents(
      textInput({
        id: "whatHappened",
        label: "What did they do?",
        placeholder: "Describe what the person did.",
        style: TextInputStyle.Paragraph,
      }),
    ),
  );
}

export function ticketCloseRow(ticketId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:close:${ticketId}`)
      .setLabel("Close Ticket")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

export function ticketEmbed(ticket, user) {
  const embed = new EmbedBuilder()
    .setColor(ticket.type === "report" ? COLORS.red : COLORS.blue)
    .setTitle(ticket.type === "report" ? "🚨 Report Ticket" : "🛠️ Support Ticket")
    .setDescription(
      `Opened by <@${ticket.userId}>\nTicket type: **${ticket.type === "report" ? "Report" : "Support"}**`,
    )
    .addFields(
      ...Object.entries(ticket.answers).map(([name, value]) => ({
        name,
        value: safeField(value),
      })),
    )
    .setTimestamp();
  if (user?.displayAvatarURL) embed.setThumbnail(user.displayAvatarURL());
  return embed;
}

export function statusReviewEmbed(application, reviewerId, status, sourceEmbed) {
  const accepted = status === "accepted";
  const embed = sourceEmbed
    ? new EmbedBuilder(sourceEmbed.toJSON())
    : new EmbedBuilder().setTitle("📋 Trainee Staff Application");
  embed
    .setColor(accepted ? COLORS.green : COLORS.red)
    .addFields({
      name: accepted ? "Decision" : "Denial reason",
      value: accepted
        ? `Accepted by <@${reviewerId}>`
        : `${safeField(application.denialReason)}\n\nReviewed by <@${reviewerId}>`,
    })
    .setFooter({ text: `Application ID: ${application.id}` });
  return embed;
}

export function safeField(value, limit = 1024) {
  const text = String(value ?? "").trim();
  if (!text) return "Not provided";
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
