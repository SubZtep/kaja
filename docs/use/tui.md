---
layout: page
title: Terminal UI
parent: Using Kaja
nav_order: 1
summary: The terminal chat client and its commands.
icon: 🖵
---

# Terminal UI

A scrollable chat, a multi-line input, and a line of hotkeys at the bottom. Both [modes](/start/modes)
use it.

A local session opens with a summary of what loaded: the persona and model, connected MCP servers with
their tool counts, and how many saved conversations and memory notes you have.

The header shows the persona, the model and its provider and, after the first reply, how full the context
window is: just the percent, like `1%`, and the full count (`18,000 / 33K (55%)`) once it's past half. At the
right edge, where Kaja runs (`local` or `cloud`, plus `KAJA_PROFILE`), and `YOLO` while approvals are off. On a
narrow terminal the provider goes first, then the model. Long conversations are summarised before they run out of room (see
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
kaja login                # sign in to the cloud account without starting a chat
kaja logout               # clear the stored cloud token

# Local mode only
kaja -c, --continue       # resume the most recent session
kaja -s, --session <id>   # resume a specific session
kaja sessions             # list saved sessions with their ids
kaja images               # count stored images; `describe` fills in descriptions, `clean` removes leftovers
kaja doctor               # test keys, models and tools; asks for missing keys
kaja telegram             # run as a Telegram bot (add --headless for no terminal UI)
kaja telegram --pair      # print a one-time code to pair one more Telegram user

# Config files and abilities
kaja config paths | fetch | diff | wizard   # see Configuration
kaja config hooks        # set up sounds, notifications and speech for chat events
kaja abilities            # list the abilities, their keys, and the personas that use them
kaja abilities update     # fetch the marketplace
```

`config`, `abilities` and `sessions` only touch local files, so they never trigger a cloud login. See
[Configuration](/config/commands) for `config` and [Abilities](/abilities) for `abilities`.

In the chat, `/compact` summarises the conversation so far to free up space, and you can add what to keep:
`/compact keep the SQL decisions`. It also happens on its own ([details](/config/settings#context)).

## Keyboard shortcuts

### Sending and editing

| Key                                   | Action                                                                                                                                                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Enter`                               | Send the prompt                                                                                                                                                                     |
| `Shift+Enter`                         | New line                                                                                                                                                                            |
| `←` / `→`                             | Move one character                                                                                                                                                                  |
| `Ctrl+←` / `Ctrl+→` (or `Meta+←`/`→`) | Move one word                                                                                                                                                                       |
| `Home` / `End`                        | Start/end of the line                                                                                                                                                               |
| `Backspace` / `Delete`                | Delete before/after the cursor                                                                                                                                                      |
| `↑` / `↓`                             | Previous/next prompt from history (on the first/last line), otherwise move between lines                                                                                            |
| `Ctrl+T`                              | Toggle mic [dictation](/use/voice)                                                                                                                                                  |
| `Esc`                                 | Quit (while a turn or command is running, press it twice), or close the persona picker / decline the approval prompt when one is open; first empties any text you typed in a prompt |
| `Ctrl+C`                              | Interrupt / exit                                                                                                                                                                    |

`Shift+Enter` needs a terminal with the kitty keyboard protocol (kitty, Ghostty, WezTerm, foot and others); in any other terminal it sends the prompt, like `Enter`.

Prompt history spans all past sessions, newest first.

### Scrolling

| Key                              | Action   |
| -------------------------------- | -------- |
| `PageUp` / `PageDown`            | One page |
| `Ctrl+↑` / `Ctrl+↓`, mouse wheel | 3 lines  |
| `Ctrl+Home`                      | Top      |

While you're scrolled back, the top of the chat shows how far down the history you are. Scroll to the bottom or start typing to follow new output again.

### Key line

The hotkeys and Quit are also buttons you can click, handy when your terminal or system takes the hotkey.
Each hotkey shows only while it does something. Copy works but isn't on the line, to keep it short: the
help screen lists it.

| Key            | Action                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `<modifier>+L` | Help: every shortcut, and a link to these docs                                                 |
| `<modifier>+P` | Open the persona picker (hidden while a turn runs)                                             |
| `<modifier>+R` | Copy the latest message (`C` is taken by `Ctrl+C`); clicking a reply copies it too             |
| `<modifier>+E` | Show every line of long code blocks (they show `codePreviewLines`, 5 by default, otherwise)    |
| `<modifier>+O` | Read the command or request waiting for your approval in a window (shown only while one waits) |

`<modifier>` is `Alt` by default. Set `preferences.hotkeyModifier` in [`settings.toml`](/config/settings) to
`"ctrl"`, `"meta"` (the Super key; needs a terminal with the kitty keyboard protocol) or two at once:
`"ctrl+alt"`, `"ctrl+meta"`, `"alt+meta"`. Use `Ctrl` if Alt types special characters (macOS Terminal.app
and iTerm2 without "Option as Meta"), keep `Alt` if your host app claims `Ctrl+<letter>` (VS Code's
terminal does), and pick a pair if your window manager grabs a combo (many bind `Ctrl+Alt+<letter>`).
In a terminal with the kitty keyboard protocol, holding the modifier lights up the key line's shortcuts.

In the persona picker, `↑`/`↓` move, `Enter` picks, and `Esc`, `Backspace` or `Delete` close it. Picking a
[persona](/abilities/personas) starts a fresh conversation and lasts until you quit.

## Tool calls

When the agent uses a tool, `preferences.toolDisplay` decides how it shows. `minimal` (default) keeps one live
row above the input and leaves a one-line summary of the turn's tools; `verbose` lists every call in the chat;
`corner` shows the current call in the header's top-right corner and nothing in the chat.

## Approvals and questions

A shell command, or a tool call that changes something, waits for you before it runs. The prompt describes it,
lists **Yes** and **No**, and keeps the input field under them. Move with `↑`/`↓`, answer with `Enter`, or press
`Esc` to decline. The command itself stays out of the chat, since it can be long: press `<modifier>+O` to read it
first.

You can also just type. Writing something instead of answering declines the call and tells the agent why ("use
`trash` instead"), so it can try again. Typed text takes the keys from the list until you delete it or press `Esc`.

When the agent asks you something that has a few likely answers, they are listed the same way: pick one, or type
your own. The mic ([dictation](/use/voice)) stays on across all of this.

Thinking, tool display, code preview length and voice have no in-app toggle. Set them in
[`settings.toml`](/config/settings#preferences) and restart.

## Colours

There's a dark and a light theme. With `theme = "auto"` (the default), Kaja asks your terminal which one
fits when it starts. In terminals that announce changes (kitty, Ghostty, Contour and others), it follows
when you switch your system between dark and light.

`theme = "terminal"` paints Kaja in your terminal's own colour scheme instead: text uses its ANSI
colours, and the tinted backgrounds (the input row, your messages) are mixed from them. Load
any scheme into your terminal, from [terminal.sexy](https://terminal.sexy/) for example, and Kaja wears it
too. A terminal that doesn't report its colours gets the tints of the dark or light theme. After you
change the terminal's scheme, restart Kaja so the tints follow.

Set [`NO_COLOR`](https://no-color.org/) (to anything but an empty string) and Kaja uses no colour at all, whatever
the theme: bold, dim and underline stay, and the highlighted row and your messages turn to inverse text.

To pick one, set `theme` in [`settings.toml`](/config/settings#preferences) (`dark`, `light` or
`terminal`) and restart; `theme = "auto"` goes back to following the terminal.

---

Next:

[Web app](/use/web){: .btn .btn-green .fs-5 }
