---
layout: page
title: Telegram
parent: Using Kaja
nav_order: 3
---

# Telegram

There are two independent bots: a **local bot** you run yourself with `kaja telegram`, and the
**cloud bot** that runs inside the Kaja API and links to your account.

| | Local bot | Cloud bot |
| --- | --- | --- |
| Runs | on your machine, while `kaja telegram` runs | always, on the API |
| Agent | [local mode](/modes#local-mode): your models, tools and shell | [cloud mode](/modes#cloud-mode) |
| Who can use it | people you paired with a one-time code | Kaja users who linked their Telegram account |
| Abilities | what `abilities.toml` loads | what you turned on in the [web app](/web-app) |

On both, each Telegram user gets their own conversations, memory notes and dataset answers, kept apart
from each other and from your terminal. A call that needs approval — a shell command, or an HTTP tool
or MCP call that changes something — comes with Approve/Decline buttons.

## Local bot

1. **Create a bot.** In Telegram, message [@BotFather](https://t.me/BotFather), send `/newbot`, and
   follow the prompts. It replies with a token like `123456789:AAH...`.
2. **Save the token** in [`secrets.toml`](/configuration/secrets) (or let the [setup wizard](/wizard)
   ask for it):

   ```toml
   [telegram]
   bot_token = "123456789:AAH..."
   ```

3. **Run it:**

   ```sh
   kaja telegram              # with the terminal UI around it
   kaja --headless telegram   # no terminal UI — for services and containers
   ```

   An invalid token fails straight away with a one-line error.

4. **Pair with it.** The first time, it prints a one-time code and a link:

   ```text
   No one is paired with @my_kaja_bot yet, and it answers no one until you are.
   Open https://t.me/my_kaja_bot?start=K7Q2-M9XD
   or send it: /start K7Q2-M9XD
   ```

   Open the link on your phone, or send the bot that `/start` line. It replies that you're paired, and
   your Telegram id is saved to `owner_ids` in `secrets.toml`, so later starts skip this step.

The bot only answers paired people. Anyone else gets no reply at all, and after five wrong codes it
ignores them until it restarts. A paired person can use your tools and approve shell commands, so only
pair people you trust.

- **Pair one more person** (a partner, a second account): `kaja telegram --pair` prints a fresh code.
  Each code works once.
- **Remove someone:** delete their id from `owner_ids` in `secrets.toml` and restart the bot.

Commands in the bot's menu:

- `/new` — start a fresh conversation.
- `/abilities` — the skills and tools this bot loaded. It loads them once at start, so after
  `kaja abilities` restart `kaja telegram`.

## Cloud bot

Link your Telegram account once:

1. In the [web app](/web-app), open the **Dashboard**.
2. In the **Connect Telegram** card, click **Get Telegram link**. The link works once, for 10 minutes.
3. Open it. Telegram opens a chat with the bot and sends `/start` with the token, and the bot replies
   once you're linked.

From then on, message the bot like any chat. An account that isn't linked gets a reply pointing back to
the dashboard.

Commands:

- `/new` — start a fresh conversation.
- `/abilities` — every skill, tool and MCP server as a button: ✅ on, ▫️ off, 🔑 needs your API key
  first, ⚠️ no longer in the marketplace. A tap applies from your next message. Keys are entered on the
  [Abilities page](https://kaja.io/abilities), never in Telegram, where they'd stay in the chat history.

Running your own Kaja API? Set `TELEGRAM_BOT_TOKEN` in its environment and restart to start the cloud
bot.

---

Next:

[Website widget](/widget){: .btn .btn-green .fs-5 }
