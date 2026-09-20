---
layout: page
title: Terminal UI
nav_order: 5
---

# Terminal UI

The chat client: a scrollable transcript, a multi-line input, and a key bar of hotkeys pinned to
the bottom of the screen. Built with [Ink](https://github.com/vadimdemedes/ink), so it's all
keyboard-driven.

Both [modes](/modes) share the same UI shell, but cloud mode runs a lighter version of it — no
model switching and no shell-command confirmation, because the cloud agent never emits those.
Persona switching works in both modes.

## Startup panel

The first thing a local session prints is a summary of what it loaded: the active persona and
model, connected MCP servers with their tool counts, how many saved conversations exist, and how
many memory notes are stored.

## Keyboard shortcuts

### Sending & editing

| Key | Action |
|---|---|
| `Enter` | Send the prompt |
| `Shift+Enter` / `Ctrl+Enter` / `Meta+Enter` / `Ctrl+J` | Insert a newline instead of sending |
| `←` / `→` | Move cursor one character |
| `Ctrl+←` / `Ctrl+→` (or `Meta+←`/`→`) | Move cursor one word |
| `Home` / `End` | Move cursor to start/end of the current line |
| `Backspace` / `Delete` | Delete character before/after cursor |
| `↑` / `↓` | Recall previous/next prompt from history, when the cursor is on the first/last line; otherwise moves between wrapped lines |
| `Ctrl+T` | Toggle mic dictation |
| `Esc` | Quit the app |
| `Ctrl+C` | Interrupt / exit |

Prompt history spans all past sessions, newest first.

### Chat viewport

| Key | Action |
|---|---|
| `PageUp` / `PageDown` | Scroll chat by one page |
| `Ctrl+↑` / `Ctrl+↓` | Scroll chat by 3 lines |
| `Ctrl+Home` | Scroll to the top |
| `Ctrl+End` | Jump to the bottom and resume auto-follow |
| Mouse wheel | Scroll chat by 3 lines |
| `<modifier>+R` | Copy the most recent message to the clipboard |

`<modifier>+R`, not `<modifier>+C`: plain `Ctrl+C` is reserved globally to quit the app, so `C`
itself can never be bound to anything else here, under either modifier — see below.

### Key bar

A key bar is pinned to the bottom of the screen, showing every available hotkey and the modifier
key it uses:

| Key | Action |
|---|---|
| `Esc` | Quit the app — or, while the persona picker/shell-command confirm prompt is showing over the input, Cancel/Decline it instead (nothing else changes) |
| `<modifier>+L` | Open the [docs](https://docs.kaja.io/tui/) in your browser |
| `<modifier>+P` | Open the persona picker (both modes; a submenu of every loaded/server [persona](/personas)) |
| `<modifier>+R` | Copy the most recent message to the clipboard (see above) |

| Key | Action (persona picker) |
|---|---|
| `↑` / `↓` | Move selection |
| `Enter` | Activate selected item |
| `Esc` / `Backspace` / `Delete` | Close the picker without changing persona |

Picking a persona here starts a **fresh conversation**; an automatic `switch_persona` mid-chat
(model-invoked) keeps the current one going instead. A manually picked persona doesn't persist —
every launch starts from the default persona again.

`<modifier>` is `Alt` by default, configurable to `Ctrl` via `preferences.hotkeyModifier` in
`settings.toml`. Neither is universal in every terminal: Alt can type special characters instead
of acting as a modifier on some macOS terminals (Terminal.app/iTerm2 without "Option as Meta"
enabled), while `Ctrl+<letter>` can collide with a host application's own global shortcuts (e.g.
VS Code's integrated terminal reserves several `Ctrl+<letter>` combos regardless of which panel
has focus). Pick whichever works cleanly for you.

There is no in-app toggle for thinking/sounds/voice — set `preferences.thinking`,
`preferences.sounds`, `preferences.voice` in `settings.toml` directly and restart. The app never
writes to `settings.toml` (or any other config file) at runtime; only the setup wizard and the
explicit `kaja config wizard`/`kaja config fetch` subcommands do.

## Rendering

Assistant replies are rendered as markdown in the terminal — headings, lists, tables, and
syntax-highlighted code blocks. Images the agent produces or views are drawn inline as terminal
graphics where the terminal supports it, and links are clickable in terminals that support OSC 8
hyperlinks.

---

Next:

[Flow](/flow){: .btn .btn-green .fs-5 }
