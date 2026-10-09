# MCPE Community Discord Bot

Discord bot for Trainee Staff applications and private Support/Report tickets. It registers `/toggleapp` and posts both panels automatically when it starts.

## Included features

- A blue **Apply 🔨** button and a two-part application form (three questions, then two).
- Application review buttons in the configured review channel.
- Administrator-only `/toggleapp` command.
- Applicant role assignment on acceptance and a congratulations DM.
- Denial reason DM and a persistent seven-day cooldown.
- A Support/Report dropdown panel that creates private channels after the questions are answered. The requester can have only one open ticket at a time.
- A Close Ticket button in each ticket. The requester, configured ticket roles (including `1550592757767348364`), or an administrator can close it; the bot preserves the channel and transcript while locking the requester out of sending messages.
- Listening status: **Made by Kayzo for MCPE Community**.
- JSON state saved locally; use a Railway Volume for state that must survive redeployments.

## 1. Create and invite the Discord bot

1. In the Discord Developer Portal, create an application and add a bot.
2. Copy the bot token into `DISCORD_TOKEN` in the deployment's environment variables. Do not put the token in source code or share it.
3. Enable **Server Members Intent** under the bot's privileged gateway intents.
4. Invite the bot to your server using the OAuth2 URL Generator with the `bot` and `applications.commands` scopes. Grant these bot permissions:
   - View Channels
   - Send Messages
   - Embed Links
   - Read Message History
   - Manage Channels
   - Manage Roles
5. Move the bot's highest role above the Trainee role and the additional accepted role.

The bot registers `/toggleapp` in the configured server when it starts. Only server administrators can use it. The Accept/Deny review buttons are available to members with Manage Roles or Administrator permission.

## 2. Configure environment variables

Copy `.env.example` to `.env` for local use. In Railway, add the same values under the service's Variables tab:

| Variable | Required | Description |
| --- | --- | --- |
| `DISCORD_TOKEN` | Yes | Secret token for your Discord bot. |
| `GUILD_ID` | Yes | ID of the Discord server where the bot operates. |
| `APPLICATION_CHANNEL_ID` | No | Application panel channel. Defaults to `1553444704354574446`. |
| `APPLICATION_REVIEW_CHANNEL_ID` | No | Staff application review channel. Defaults to `1554491171982549032`. |
| `TICKET_PANEL_CHANNEL_ID` | No | Ticket panel channel. Defaults to `1550860534042075257`. |
| `TRAINEE_ROLE_ID` | No | Role assigned on acceptance and checked to prevent repeat applications. |
| `ACCEPTED_EXTRA_ROLE_ID` | No | Second role assigned on acceptance. |
| `TICKET_STAFF_ROLE_IDS` | No | Additional comma-separated staff role IDs with access to private tickets. Role `1550592757767348364` is always included. |
| `STATE_FILE` | No | JSON state path. Defaults to `./data/state.json`. |

The supplied channel and role IDs are already filled into `.env.example` and used as defaults. You only need to replace them if those IDs change. The Discord server ID and bot token are not included because they are unique to your server and bot.

## 3. Deploy on Railway

1. Download and unzip the package. Push the extracted files to a GitHub repository connected to Railway, or deploy the extracted folder with the Railway CLI.
2. If using the full project repository, set the Railway service's root directory to `bots/discord-bot`. For the ZIP contents, use the extracted folder as the service root.
3. Add the variables above in Railway. Never commit `.env`. Add a Railway Volume mounted at `/app/data` and set `STATE_FILE=/app/data/state.json` before the first deploy.
4. Deploy. Railway uses the included Dockerfile; the bot runs as a worker and does not need a public web port.

On first successful start, the bot posts the application and ticket panels. It remembers those message IDs to avoid reposting them on normal restarts. If a panel is deleted, it posts a replacement the next time it starts. Use one Railway replica with the JSON state file; it is not a shared database for multiple bot instances.

## Run locally

Requires Node.js 20 or later.

```sh
cp .env.example .env
# Set DISCORD_TOKEN and GUILD_ID in .env
npm install
npm start
```

Run the built-in checks with:

```sh
npm test
npm run check
```

## State and privacy

The bot stores pending application answers, application outcomes, the application open/closed setting, panel message IDs, and ticket channel IDs in `STATE_FILE`. Completed application answers remain in the review channel in Discord; the bot removes them from its local state after a decision. Ticket answers are posted in the private ticket channel and are not retained in the JSON state file. Keep the Railway Volume restricted to trusted project members and use the Discord channel permissions to control access to reviews and tickets.
