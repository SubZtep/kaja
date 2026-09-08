---
layout: page
title: Terminal UI
nav_order: 5
---

# Terminal UI

The chat client: a scrollable transcript, a multi-line input, and a `/` menu. Built with
[Ink](https://github.com/vadimdemedes/ink), so it's all keyboard-driven.

Both [modes](/modes) share the same UI shell, but hosted mode runs a lighter version of it — no
persona/model switching and no shell-command confirmation, because the hosted agent never emits
those.

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
| `Esc` | Quit the app (closes the `/` menu first if one is open) |
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
| `Alt+C` (`Meta+C`) | Copy the most recent message to the clipboard |

### The `/` menu

Typing `/` as the first character of an empty input opens the menu. The same picker is reused for
shell-command approve/decline prompts.

| Item | Effect |
|---|---|
| Toggle thinking | show or hide the model's reasoning |
| Toggle sounds | UI sound effects |
| Toggle voice | spoken replies (needs a TTS model) |
| Change persona | opens a submenu of every loaded [persona](/personas) |

Toggles are written back to `settings.toml`, so they persist. Picking a persona here starts a
**fresh conversation**; an automatic `switch_persona` mid-chat keeps the current one going.

| Key | Action |
|---|---|
| `↑` / `↓` | Move selection |
| `Enter` | Activate selected item |
| `Esc` / `Backspace` / `Delete` | Close the menu |

The menu is empty in hosted mode.

## Rendering

Assistant replies are rendered as markdown in the terminal — headings, lists, tables, and
syntax-highlighted code blocks. Images the agent produces or views are drawn inline as terminal
graphics where the terminal supports it, and links are clickable in terminals that support OSC 8
hyperlinks.

---

Next:

[Flow](/flow){: .btn .btn-green .fs-5 }
