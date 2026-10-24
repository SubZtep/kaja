---
layout: page
title: Setup wizard
parent: Get started
nav_order: 3
summary: The questions the first-run setup asks, and what they write.
icon: 🧙
---

# Setup wizard

The first time you run `kaja`, a short wizard sets things up. It takes about a minute, and you can run it
again any time with `kaja config wizard`.

Every question starts with an answer already picked, so <kbd>Enter</kbd> is always a safe choice. On a
second run, the wizard starts from your previous answers.

## Before you start

- **Kaja Cloud** needs nothing. You sign in with your browser after the wizard.
- **Your own provider** needs its API key at hand (a cloud provider such as Fireworks or OpenRouter), or a
  running local server (Ollama, llama.cpp, Speaches). You can skip a key and add it later.

## Moving around

| Key                          | What it does                                                |
| ---------------------------- | ----------------------------------------------------------- |
| <kbd>↑</kbd> <kbd>↓</kbd>    | Move through a list                                         |
| <kbd>Space</kbd>             | Tick or untick an item, in lists where you can pick several |
| <kbd>Enter</kbd>             | Confirm and go on                                           |
| <kbd>Esc</kbd>               | Go back to the previous question, your answer kept          |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> | Quit the wizard. Nothing is saved                           |

In a field you type into, <kbd>Enter</kbd> on an empty value skips it. An address keeps its usual default.
<kbd>Esc</kbd> on the very first question cancels the wizard.

Answers are checked as you type. A key is tried against its provider a moment after you stop typing, and an
address is asked whether a server answers there (✓ fine, ! worth knowing, ✗ refused). A refused key takes a
second <kbd>Enter</kbd> to keep anyway.

The questions come in blocks: **Basics**, **Providers**, **Models**, **Extras** and **Sounds** (Kaja Cloud
asks only Basics and Sounds). The top line shows
which block you're in and how many questions it has. A finished block folds into one ✓ line with your
answers.

## The questions

1. **Language.** What Kaja speaks to you in. The rest of the wizard switches right away.
2. **Colours.** Dark or light. Moving the highlight previews it, and the one matching your terminal is
   preselected. You can switch later with <kbd>Alt</kbd>+<kbd>D</kbd> ([Colours](/use/tui#colours)).
3. **How to run Kaja.**
   - **Kaja Cloud** (default): after the wizard, Kaja shows a code, you approve it in your browser, and
     you're chatting. The server picks the models, every persona is yours, and Kaja provides the API
     keys abilities need.
   - **Your own provider**: Kaja runs on your machine with the models you choose. The next questions
     set them up.

   Starting with `kaja --cloud` or `kaja --local` answers this for you.

4. **Providers.** Tick every provider you can use (at least one). The list comes from
   [models.dev](https://models.dev); type to narrow it. Model servers already running on your machine
   (Ollama, LM Studio, llama.cpp, vLLM, Jan, KoboldCpp, text-generation-webui, Speaches, or wherever
   `OLLAMA_HOST` points) come first, ticked, with their models. Next come providers whose API key is
   already in your environment (`OPENAI_API_KEY` and the like), also ticked, then the best-known providers
   and the rest by name. <kbd>Enter</kbd> with nothing ticked takes the highlighted one.
   - **Cloud** providers run online, so you give an API key. If it's already in your environment, you
     choose between reading it from there each time (nothing is saved) and copying it into secrets.toml.
   - **Self-hosted** ones run on your machine or server, so you confirm where they listen.
   - **Custom** is any other OpenAI-compatible server (one on another machine, a proxy). You give a name,
     an address and a key, then pick each model from the list the server reports (or type its id), and say
     what it's for. Without internet, this and the servers found running are the choices.
5. **Tasks.** Tick what Kaja should be able to do: chat (always), memory search (embedding), summaries and
   pictures (vision) are ticked to start with; speech, reranking and image generation are yours to add.
6. **Which model.** For each ticked task with more than one model to choose from, pick one. The newest
   model that can use tools is highlighted, and typing filters the list.
7. **Extras.** Tick **Telegram bot** to chat from [Telegram](/use/telegram) and paste the bot token.
   Press <kbd>Enter</kbd> with nothing ticked to skip. Then, when `git` is installed: whether to use the
   online [marketplace](/abilities) of skills, personas and tools, and whether to keep it up to date on its own
   ([`[marketplace]`](/config/settings#marketplace)). Without `git` it stays off.
8. **Sounds.** Sound effects, desktop notifications and reading replies aloud
   ([`hooks.toml`](/config/settings#hookstoml-commands-that-run-on-chat-events)), each asked only when Kaja
   found a program for it on your computer. A later run opens on what `hooks.toml` has. `kaja config hooks`
   asks just these again.

After the last answer the header says **Finishing up** and the wizard carries on by itself: fetching the
marketplace, any model downloads and a check of your keys, then **Setup complete**. A key is hidden while you type it and never shown again. It's tested
before it's saved.

## After the last question

Either way, Kaja writes `hooks.toml` from your **Sounds** answers (left as it is when nothing changed) and
tells you how to install a sound player, notification tool or speech tool it couldn't find.

With **Kaja Cloud** that's it. The first time, Kaja goes straight on to sign you in. After a later
`kaja config wizard`, run `kaja` to sign in.

With **your own provider**, Kaja fetches the marketplace (if you said yes) and may ask a few more things:

1. **Abilities that can't run here.** An [MCP ability](/abilities/mcp) a persona uses that's missing what it
   needs on this machine (`uv` for a Python package, Chrome for `chrome-devtools`) is offered three ways out:
   install it (uv's official installer runs; for Chrome, its download page opens), run it on a
   [Kaja sandbox](/abilities/mcp#on-a-sandbox-from-local-mode) instead (signing you in to Kaja cloud if you
   aren't yet), or skip it and see how to install it yourself.
2. **Model downloads.** If your Ollama server lacks the models, one question covers all of them.
3. **Key tests.** A key is saved once the service accepts it. If it's rejected, Kaja asks whether to keep
   it anyway. Keys the finished setup turns out to need, such as an ability's, are asked for here.
4. **Model tests.** Every model gets one try, the same check [`kaja doctor`](/config/commands#checking-keys-and-models)
   runs. If one fails and another can do its job, you're offered the switch.

The first time, the chat starts right after. After `kaja config wizard`, you're back at your prompt.

## Where your answers go

Everything is plain text in `~/.config/kaja/`, and yours to edit afterwards:

| You answer                 | It becomes                                                                                          | In                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Language                   | `[preferences] locale`                                                                              | [`settings.toml`](/config/settings) |
| Colours                    | `[preferences] theme`                                                                               | `settings.toml`                     |
| How to run Kaja            | `[preferences] mode`                                                                                | `settings.toml`                     |
| Providers, custom provider | `[providers.<name>]` tables and their models                                                        | [`models.toml`](/config/models)     |
| Which model, per task      | the picked model comes first among the `[models.<id>]` listing that task; every model offered stays | `models.toml`                       |
| A server address           | `[providers.<name>] base_url`                                                                       | `models.toml`                       |
| Speaches address           | `[stt] speachesUrl`, `[tts] speachesUrl`                                                            | `settings.toml`                     |
| A provider's API key       | `[providers.<name>] api_key`                                                                        | [`secrets.toml`](/config/secrets)   |
| Telegram bot token         | `[telegram] bot_token`                                                                              | `secrets.toml`                      |

## Running it again

`kaja config wizard` starts from your current setup, so holding <kbd>Enter</kbd> changes nothing. It does
rewrite `models.toml` from your answers, so keep a copy of hand edits. It never touches the
`marketplace/` folder.

Offline, with no provider list to show, the wizard goes straight to the custom provider questions, so you
can still set up a local server such as Ollama. Without a terminal (piped input, or `--headless`) it asks
nothing and writes the default config files if you have none.

---

Next:

[Terminal UI](/use/tui){: .btn .btn-green .fs-5 }
