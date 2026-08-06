---
layout: page
title: CLI
nav_order: 4
---

# CLI

Terminal chat with personas, tools, optional mic dictation, and optional TTS.

## Terminal commands

### Run

```bash
kaja
```

### Help

```bash
kaja --help
```

### Uninstall

```bash
rm ~/.local/bin/kaja
```

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
| `↑` / `↓` | Recall previous/next prompt from history, when the cursor is on the first/last line; otherwise moves the cursor between wrapped lines |
| `Ctrl+T` | Toggle mic dictation |
| `Esc` | Quit the app (closes the `/` menu first if one is open) |
| `Ctrl+C` | Interrupt / exit |

### Chat viewport

| Key | Action |
|---|---|
| `PageUp` / `PageDown` | Scroll chat by one page |
| `Ctrl+↑` / `Ctrl+↓` | Scroll chat by 3 lines |
| `Ctrl+Home` | Scroll to the top |
| `Ctrl+End` | Jump to the bottom and resume auto-follow |
| Mouse wheel | Scroll chat by 3 lines |
| `Alt+C` (`Meta+C`) | Copy the most recent message to the clipboard |

### `/` menu

Typing `/` as the first character opens a menu to toggle thinking/sounds/voice or switch model/persona (and reuses the same picker for shell-command confirmations).

| Key | Action |
|---|---|
| `↑` / `↓` | Move selection |
| `Enter` | Activate selected item |
| `Esc` / `Backspace` / `Delete` | Close the menu |
