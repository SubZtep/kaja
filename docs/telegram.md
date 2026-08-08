---
layout: page
title: Telegram
nav_order: 8
---

# Telegram

`kaja telegram` runs a bot that uses the same personas, tools, and models as the terminal
chat — including the shell-command approve/decline flow, shown as an inline keyboard.

## Setup

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
   kaja telegram
   ```

   The bot preflights with `getMe()` — an invalid token fails immediately with a one-line
   error, no stack trace. On success it logs "ready" and starts long-polling.

Then open a DM with your bot and send anything. Messages from accounts not in `allowedUserIds`
are silently ignored — it must be non-empty, there's no "open to everyone" mode.

---

Next:

[Development](/development){: .btn .btn-green .fs-5 }
