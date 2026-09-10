---
layout: page
title: Telegram
nav_order: 10
---

# Telegram

There are two independent Telegram bots: a **local-mode** bot you run yourself (`kaja telegram`),
and an **always-on cloud bot** that runs as part of the API server.

## Local mode: `kaja telegram`

`kaja telegram` runs a bot that uses the same personas, tools, and models as the terminal
chat — including the shell-command approve/decline flow, shown as an inline keyboard.

> The bot is **[local mode](/modes) only** — it runs the agent loop on your machine and needs a
> configured `models.toml`.
{: .note }

Each allowed user gets their own conversation and their own agent state, kept apart by an `owner`
id in the [store](/tui/sqlite) — they can't see or resume each other's sessions.

### Setup

1. **Create a bot and get a token.** In Telegram, message [@BotFather](https://t.me/BotFather),
   send `/newbot`, and follow the prompts (name + a unique username ending in `bot`).
   BotFather replies with an API token like `123456789:AAH...`.

2. **Get your numeric Telegram user id.** Message [@userinfobot](https://t.me/userinfobot) (or
   [@RawDataBot](https://t.me/RawDataBot)) — it replies with your numeric id. That's what goes
   in `allowedUserIds`, not your `@username`.

3. **Add a `[telegram]` section to `~/.config/kaja/services.toml`** (who's allowed in):

   ```toml
   [telegram]
   allowedUserIds = [YOUR_NUMERIC_ID]
   ```

   **...and one to `~/.config/kaja/secrets.toml`** (the token itself):

   ```toml
   [telegram]
   botToken = "123456789:AAH..."
   ```

4. **Run it:**

   ```sh
   kaja telegram              # with the terminal UI shell around it
   kaja --headless telegram   # no Ink render — for services and containers
   ```

   The bot preflights with `getMe()` — an invalid token fails immediately with a one-line
   error, no stack trace. On success it logs "ready" and starts long-polling.

Then open a DM with your bot and send anything. Messages from accounts not in `allowedUserIds`
are silently ignored — it must be non-empty, there's no "open to everyone" mode.

## Cloud mode: the always-on API bot

Setting `TELEGRAM_BOT_TOKEN` on the API server starts a second, independent Telegram bot inside
the API process itself — no `kaja telegram` invocation, no local machine, no local
`models.toml`. It uses cloud Nasi (the same agent the web/lite clients use), so there's no
persona catalog, no model switching, and no shell-command approve/decline flow — same
constraints as the [cloud/lite CLI](/modes).

There's **no `allowedUserIds`** — instead, each Kaja user links their own Telegram account
themselves, self-service, with no server restart needed per new user:

1. Log into the Kaja web app and open your **Profile** page.
2. Click **Connect Telegram** — this generates a one-time link
   (`https://t.me/<bot>?start=<token>`) that's valid for 10 minutes and works once.
3. Open the link (tap it on your phone, or click it with Telegram Desktop installed). Telegram
   opens a chat with the bot and automatically sends `/start <token>` — the bot resolves the
   token to your account and replies once linked.
4. Message the bot normally from then on — it uses your account's models, persona, and
   conversation history, kept apart from your web/lite sessions by an `owner` id, the same
   mechanism that keeps different [widget](/widget) visitors apart.

A Telegram account that hasn't completed this flow gets a reply pointing back to the profile
page instead of a real conversation. **Setup**: set `TELEGRAM_BOT_TOKEN` (from BotFather, as
above) in the API's environment and restart — an invalid token fails fast at startup. Send `/new`
to a linked conversation to start a fresh session.

---

Next:

[Widget](/widget){: .btn .btn-green .fs-5 }
