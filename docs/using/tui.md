---
layout: page
title: Terminal UI
parent: Using Kaja
nav_order: 1
summary: "The terminal chat client and its commands."
---

# Terminal UI

A scrollable chat, a multi-line input, and a bar of hotkeys at the bottom. Both [modes](/getting-started/modes)
use it. Cloud mode has no model switching and no shell approvals, because the cloud agent never needs them.

A local session opens with a summary of what loaded: the persona and model, connected MCP servers with
their tool counts, and how many saved conversations and memory notes you have.

The header shows the persona, the model and, after the first reply, how full the context window is, like
`12,345 / 32,768 tokens (38%)`. Long conversations are summarised before they run out of room (see
`/compact` below).

Replies render as markdown while they arrive: headings, lists, tables that fit, and highlighted code.
Images are drawn inline in coloured blocks, and links are clickable in terminals that support OSC 8.

## Commands

```sh
kaja                      # chat, in the mode your config says
kaja --local              # force the local agent loop for this launch
kaja --cloud              # force cloud login for this launch
kaja --help               # flags and subcommands
kaja --version
kaja logout               # clear the stored cloud token

# Local mode only
kaja -c, --continue       # resume the most recent session
kaja -s, --session <id>   # resume a specific session
kaja sessions             # list saved sessions with their ids
kaja doctor               # test keys, models and tools; asks for missing keys
kaja telegram             # run as a Telegram bot (add --headless for no terminal UI)
kaja telegram --pair      # print a one-time code to pair one more Telegram user

# Config files and abilities
kaja config paths | fetch | diff | wizard   # see Configuration
kaja abilities            # list the abilities, their keys, and the personas that use them
kaja abilities update     # fetch the marketplace
```

`config`, `abilities` and `sessions` only touch local files, so they never trigger a cloud login. See
[Configuration](/configuration/commands) for `config` and [Abilities](/abilities) for `abilities`.

In the chat, `/compact` summarises the conversation so far to free up space, and you can add what to keep:
`/compact keep the SQL decisions`. It also happens on its own ([details](/configuration/config#context)).

## Keyboard shortcuts

### Sending and editing

| Key | Action |
|---|---|
| `Enter` | Send the prompt |
| `Shift+Enter` / `Ctrl+Enter` / `Meta+Enter` / `Ctrl+J` | New line |
| `←` / `→` | Move one character |
| `Ctrl+←` / `Ctrl+→` (or `Meta+←`/`→`) | Move one word |
| `Home` / `End` | Start/end of the line |
| `Backspace` / `Delete` | Delete before/after the cursor |
| `↑` / `↓` | Previous/next prompt from history (on the first/last line), otherwise move between lines |
| `Ctrl+T` | Toggle mic [dictation](/using/voice) |
| `Esc` | Quit (while a turn or command is running, press it twice), or close the persona picker / decline the approval prompt when one is open |
| `Ctrl+C` | Interrupt / exit |

Prompt history spans all past sessions, newest first.

### Scrolling

| Key | Action |
|---|---|
| `PageUp` / `PageDown` | One page |
| `Ctrl+↑` / `Ctrl+↓`, mouse wheel | 3 lines |
| `Ctrl+Home` | Top |
| `Ctrl+End` | Bottom, and follow new output again |

### Key bar

Every entry but Cancel and Decline is also a button: it dims under the mouse and a click runs it, for a terminal or system that takes the hotkey (hover needs a terminal that reports mouse movement). Quit is clickable too, with the same double press while something is running. Expand shows only while some code on screen is longer than `codePreviewLines`, and its hotkey works only then.

| Key | Action |
|---|---|
| `<modifier>+L` | Open these docs in your browser |
| `<modifier>+P` | Open the persona picker (hidden while a turn runs) |
| `<modifier>+R` | Copy the latest message (`C` is taken by `Ctrl+C`) |
| `<modifier>+D` | Switch between dark and light, and save it |
| `<modifier>+E` | Show every line of long code blocks and of the command awaiting approval (they show `codePreviewLines`, 5 by default, otherwise) |

`<modifier>` is `Alt` by default, or `Ctrl` with `preferences.hotkeyModifier = "ctrl"` in
[`settings.toml`](/configuration/config). Use `Ctrl` if Alt types special characters (macOS Terminal.app
and iTerm2 without "Option as Meta"), and keep `Alt` if your host app claims `Ctrl+<letter>` (VS Code's
terminal does).

In the persona picker, `↑`/`↓` move, `Enter` picks, and `Esc`, `Backspace` or `Delete` close it. Picking a
[persona](/abilities/personas) starts a fresh conversation and lasts until you quit.

## Tool calls

When the agent uses a tool, `preferences.toolDisplay` decides how it shows. `minimal` (default) keeps one live
row above the input and leaves a one-line summary of the turn's tools; `verbose` lists every call in the chat;
`corner` shows the current call in the header's top-right corner and nothing in the chat.

In cloud mode, an approval for an HTTP tool or MCP call also offers to approve that tool for the rest of the chat, or always (saved to your list, see [HTTP tools](/abilities/tools)).

Thinking, tool display, code preview length, sounds and voice have no in-app toggle. Set them in
[`settings.toml`](/configuration/config#preferences) and restart.

## Colours

There's a dark and a light theme. With `theme = "auto"` (the default), Kaja asks your terminal which one
fits when it starts. In terminals that announce changes (kitty, Ghostty, Contour and others), it follows
when you switch your system between dark and light.

`<modifier>+D` switches it yourself, saves the pick in
[`settings.toml`](/configuration/config#preferences), and stops following the terminal. Set
`theme = "auto"` to go back.

---

Next:

[Web app](/using/web-app){: .btn .btn-green .fs-5 }
