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
| Who can use it | anyone who finds its username | Kaja users who linked their Telegram account |
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
   botToken = "123456789:AAH..."
   ```

3. **Run it:**

   ```sh
   kaja telegram              # with the terminal UI around it
   kaja --headless telegram   # no terminal UI — for services and containers
   ```

   An invalid token fails straight away with a one-line error. Then open a DM with your bot.

> The local bot has **no allowlist**: it answers whoever messages it, with your tools, and they can
> approve their own shell commands. Keep its username to yourself.
{: .warning }

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
