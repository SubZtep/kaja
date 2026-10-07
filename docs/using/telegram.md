---
layout: page
title: Telegram
parent: Using Kaja
nav_order: 3
summary: "Chat with Kaja from Telegram."
---

# Telegram

There are two separate bots: a **local bot** you run yourself with `kaja telegram`, and the **cloud bot**
that runs inside the Kaja API and links to your account.

| | Local bot | Cloud bot |
| --- | --- | --- |
| Runs | on your machine, while `kaja telegram` runs | always, on the API |
| Agent | [local mode](/getting-started/modes#local-mode): your models, tools and shell | [cloud mode](/getting-started/modes#cloud-mode) |
| Who can use it | people you paired with a one-time code | Kaja users who linked their Telegram account |
| Abilities | what each [persona](/abilities/personas#abilities) lists | the same, with the keys saved in the [web app](/using/web-app) |

On both, each Telegram user gets their own conversations, memory notes and dataset answers, kept apart from
each other and from your terminal. A call that needs approval, like a shell command or an HTTP tool or MCP
call that changes something, comes with Approve and Decline buttons (in the cloud bot also "for this chat"). Replies stay short, like chat
messages, unless you ask for detail. Photos work in both directions.

## Local bot

1. **Create a bot.** Message [@BotFather](https://t.me/BotFather), send `/newbot` and follow the prompts.
   You get a token like `123456789:AAH...`.
2. **Save the token** in [`secrets.toml`](/configuration/secrets), or let the
   [setup wizard](/getting-started/wizard) ask for it:

   ```toml
   [telegram]
   bot_token = "123456789:AAH..."
   ```

3. **Run it:**

   ```sh
   kaja telegram              # with the terminal UI around it
   kaja --headless telegram   # no terminal UI, for services and containers
   ```

   A bad token fails straight away with a one-line error.

4. **Pair.** The first time, it prints a one-time code and a link:

   ```text
   No one is paired with @my_kaja_bot yet, and it answers no one until you are.
   Open https://t.me/my_kaja_bot?start=K7Q2-M9XD
   or send it: /start K7Q2-M9XD
   ```

   Open the link on your phone, or send the bot that `/start` line. It confirms, and your Telegram id is
   saved to `owner_ids` in `secrets.toml`, so later starts skip this.

The bot only answers paired people. Anyone else gets no reply, and after five wrong codes it ignores them
until it restarts. A paired person can use your tools and approve shell commands, so only pair people you
trust.

- **Pair someone else** (a partner, a second account): `kaja telegram --pair` prints a fresh code. Each
  code works once.
- **Remove someone:** delete their id from `owner_ids` in `secrets.toml` and restart the bot.

Commands in the bot's menu:

- `/new` starts a fresh conversation.
- `/compact` summarises the conversation to free up space (add what to keep, like
  `/compact keep the dates`). It also happens on its own.
- `/abilities` shows the skills and tools this bot loaded (an MCP server once a persona has connected it).
  It reads the marketplace folder once at start, so restart `kaja telegram` after changing it.

## Cloud bot

Link your Telegram account once:

1. In the [web app](/using/web-app), open the **Dashboard**.
2. In the **Connect Telegram** card, click **Get Telegram link**. It works once, for 10 minutes.
3. Open it. Telegram starts a chat with the bot, and the bot confirms once you're linked.

After that, message the bot like any chat. An account that isn't linked gets a reply pointing back to the
dashboard.

Commands:

- `/new` and `/compact` work as above.
- Keys are entered under API keys on your [Profile](https://kaja.io/profile), never in Telegram, where they'd
  stay in the chat history.

Running your own Kaja API? Set `TELEGRAM_BOT_TOKEN` in its environment and restart to start the cloud bot.

---

Next:

[Website widget](/using/widget){: .btn .btn-green .fs-5 }
