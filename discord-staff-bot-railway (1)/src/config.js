import "dotenv/config";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function csvIds(value) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  token: required("DISCORD_TOKEN"),
  guildId: required("GUILD_ID"),
  applicationChannelId:
    process.env.APPLICATION_CHANNEL_ID?.trim() || "1553444704354574446",
  reviewChannelId:
    process.env.APPLICATION_REVIEW_CHANNEL_ID?.trim() || "1554491171982549032",
  ticketPanelChannelId:
    process.env.TICKET_PANEL_CHANNEL_ID?.trim() || "1550860534042075257",
  traineeRoleId: process.env.TRAINEE_ROLE_ID?.trim() || "1550591722445209670",
  extraAcceptedRoleId:
    process.env.ACCEPTED_EXTRA_ROLE_ID?.trim() || "1550592757767348364",
  ticketStaffRoleIds: [
    ...new Set([
      "1550592757767348364",
      ...csvIds(process.env.TICKET_STAFF_ROLE_IDS),
    ]),
  ],
  stateFile: process.env.STATE_FILE?.trim() || "./data/state.json",
};
