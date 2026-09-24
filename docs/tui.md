---
layout: page
title: Terminal UI
parent: Using Kaja
nav_order: 1
permalink: /tui/
---

# Terminal UI

The chat client: a scrollable transcript, a multi-line input, and a key bar of hotkeys pinned to the
bottom of the screen. Both [modes](/modes) share it; cloud mode has no model switching and no shell
approvals, because the cloud agent never needs them.

A local session starts with a summary of what it loaded: the active persona and model, connected MCP
servers with their tool counts, and how many saved conversations and memory notes exist.

The header shows the persona, the model, and after the first reply how full its context window is, e.g.
`12,345 / 32,768 tokens (38%)`. Long conversations are summarised before they run out of room; see
`/compact` below.

Replies are rendered as markdown while they arrive: headings, lists, tables that fit the window,
and syntax-highlighted code. Images are drawn inline in coloured blocks, and links are clickable
where the terminal supports OSC 8 hyperlinks.

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

# Config files and abilities
kaja config paths | fetch | diff | wizard   # see Configuration
kaja abilities            # pick which skills, tools, MCP servers and personas load
kaja abilities update     # fetch the marketplace
```

`config`, `abilities` and `sessions` only touch local files: they never trigger a cloud login. The `config`
subcommands are explained under [Configuration](/configuration#commands), `abilities` under
[Abilities](/abilities).

In the chat, type `/compact` to summarise the conversation so far and keep only your latest turn word
for word; add what matters to steer it, e.g. `/compact keep the SQL decisions`. It also happens on its
own when the context gets full (the header shows how full it is); see
[`[context]`](/configuration/config#context).

## Keyboard shortcuts

### Sending and editing

| Key | Action |
|---|---|
| `Enter` | Send the prompt |
| `Shift+Enter` / `Ctrl+Enter` / `Meta+Enter` / `Ctrl+J` | Insert a newline |
| `←` / `→` | Move one character |
| `Ctrl+←` / `Ctrl+→` (or `Meta+←`/`→`) | Move one word |
| `Home` / `End` | Start/end of the current line |
| `Backspace` / `Delete` | Delete before/after the cursor |
| `↑` / `↓` | Previous/next prompt from history (on the first/last line); otherwise move between lines |
| `Ctrl+T` | Toggle mic [dictation](/voice) |
| `Esc` | Quit — or cancel the persona picker / decline the approval prompt when one is open |
| `Ctrl+C` | Interrupt / exit |

Prompt history spans all past sessions, newest first.

### Chat viewport

| Key | Action |
|---|---|
| `PageUp` / `PageDown` | Scroll one page |
| `Ctrl+↑` / `Ctrl+↓`, mouse wheel | Scroll 3 lines |
| `Ctrl+Home` | Scroll to the top |
| `Ctrl+End` | Jump to the bottom and resume auto-follow |

### Key bar

| Key | Action |
|---|---|
| `<modifier>+L` | Open these docs in your browser |
| `<modifier>+P` | Open the persona picker |
| `<modifier>+R` | Copy the most recent message (`C` is taken by `Ctrl+C`) |
| `<modifier>+D` | Switch between the dark and light theme, and save it |

`<modifier>` is `Alt` by default, or `Ctrl` with `preferences.hotkeyModifier = "ctrl"` in
[`settings.toml`](/configuration/config). Use `Ctrl` if Alt types special characters (macOS
Terminal.app/iTerm2 without "Option as Meta"); keep `Alt` if your host app reserves `Ctrl+<letter>`
(VS Code's integrated terminal does).

In the persona picker, `↑`/`↓` move, `Enter` picks, and `Esc`/`Backspace`/`Delete` close it. Picking a
[persona](/personas) here starts a fresh conversation, and lasts until you quit.

There is no in-app toggle for thinking, sounds or voice: set them in
[`settings.toml`](/configuration/config#preferences) and restart.

## Colours

Kaja has a dark and a light theme. By default (`theme = "auto"`) it asks your terminal which one
fits when it starts. In terminals that announce it (kitty, Ghostty, Contour, …), it also follows
along when you switch your system between dark and light mode.

Press `<modifier>+D` to switch it yourself. Your pick is saved in
[`settings.toml`](/configuration/config#preferences), and Kaja stops following the terminal. To go
back to automatic, set `theme = "auto"` there.

---

Next:

[Web app](/web-app){: .btn .btn-green .fs-5 }
