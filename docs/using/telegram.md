---
layout: page
title: Telegram
parent: Using Kaja
nav_order: 3
summary: Chat with Kaja from Telegram.
icon: 💬
---

# Telegram

There are two ways to chat with Kaja on Telegram:

- **Cloud bot**: kaja.io hosts it. Link your account and start chatting, nothing to install.
- **Your own bot**: you create the bot and run it on your machine with `kaja telegram`, using your own models and tools.

## Cloud bot

1. Install [Telegram](https://telegram.org/apps) and log in, on the phone or computer where you'll open the link.
2. Register or log in on [kaja.io](https://kaja.io).
3. Go to the **Dashboard**.
4. In the **Connect Telegram** card, click **Get Telegram link**.
5. Open the link within 10 minutes. The bot recognises you and starts a chat.

## Your own bot

1. Create a bot with [@BotFather](https://t.me/BotFather): send `/newbot` and follow the steps.

2. Save its token in [`secrets.toml`](/configuration/secrets), or enter it in the
   [setup wizard](/getting-started/wizard):

   ```toml
   [telegram]
   bot_token = "123456789:AAH..."
   ```

3. Start the bot. If the token is wrong, Kaja shows an error.

   ```bash
   kaja telegram              # with the terminal UI around it
   kaja --headless telegram   # no terminal UI, for services and containers
   ```

4. Pair your Telegram account. Kaja prints a one-time code and link. Open the link, or send the code to your bot:

   ```text
   /start K7Q2-M9XD
   ```

   Kaja saves your Telegram ID in `owner_ids`, so you only need to pair once.

### Who can use the bot

Only the Telegram IDs in `owner_ids` can talk to your bot, and they can use your tools and approve shell commands.
Keep it to your own ID unless you trust the others:

```toml
[telegram]
owner_ids = [123456789]
```

- **Add someone:** run `kaja telegram --pair` and share the one-time code with them. Kaja adds their ID
  automatically and prints it in the terminal.
- **Remove someone:** delete their ID from `owner_ids` and restart the bot.
- After five wrong codes, the bot ignores that person until it restarts.

## Abilities

Both bots use [abilities](/abilities) the same way: the chat's [persona](/abilities/personas#abilities) lists
which ones the model gets. Where they run, and where their keys come from, differs:

| | Cloud bot | Your own bot |
| --- | --- | --- |
| Runs on | a [sandbox](/abilities/mcp#in-the-cloud), never your computer | your machine |
| Available | the cloud [marketplace](/abilities/marketplace#in-the-cloud) subset: no skills with scripts, and no local-only personas or computer tools | everything, including your own abilities |
| API keys | kaja.io provides them, nothing to set up | [`secrets.toml`](/configuration/secrets) `[abilities.<name>] api_key`, or `kaja doctor` |
| After a change | the next message, within the hour for marketplace updates | restart the bot |

Calls that could change something wait for your Approve or Decline button.

{: .note }
Never send an API key to your bot: Telegram keeps the message history. Put it in `secrets.toml` instead.

## Commands

- `/new` starts a new conversation.
- `/compact` shortens the conversation. Add what to keep, for example `/compact keep the dates`. This also happens automatically.
- `/abilities` (your own bot only) shows the abilities each persona uses.

---

Next:

[Website widget](/using/widget){: .btn .btn-green .fs-5 }
