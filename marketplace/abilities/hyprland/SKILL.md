---
name: hyprland
description: Change the user's Hyprland desktop (0.56+, Lua config) from a plain request, such as rounder corners, more blur, other border colours, faster animations or bigger gaps. Previews the change live first, then saves it into the right config file. Use when the user wants Hyprland to look or behave differently, or wants a change undone.
sticky: true
---

# Hyprland

The config is Lua, in `~/.config/hypr/`: `hyprland.lua` loads modules with `require("config.x")`, which is the file
`config/x.lua`. Options are set with `hl.config({ section = { option = value } })`. `lua-config.md` (beside this
skill) lists the common options and how values are written.

## Changing something

1. **Find where it lives.** Read `hyprland.lua` (with `read_text_file`), follow its `require`s, and read the module
   that sets the option. Looks are usually in `decorations.lua`, animations in `animations.lua`, and colour names
   such as `CACHYLGREEN` are defined in `colors.lua`. Only `hyprland.conf` and no `hyprland.lua`: say the old
   hyprlang format isn't supported, and stop.
2. **Pick the option.** Use `lua-config.md` first. If an option isn't there or you're unsure of its name, query the
   Hyprland wiki through context7 (`query-docs` with library `/hyprwm/hyprland-wiki`). Never guess an option name.
3. **Read the current value** with `hypr_check` (dotted names, e.g. `decoration.rounding`).
4. **Preview it** with `hypr_preview`. The user sees it straight away and no file changes. For a vague request
   ("more modern", "calmer"), preview one concrete take and say in a line what you changed.
5. **Ask** with `ask_user` whether to keep it, try something else, or undo. Undo: a config reload puts the saved
   values back, so on "no" either preview the old values again or say they come back on the next reload.
6. **Save it** when the user says yes. `edit_file` the module, changing the existing value in place: never add a
   second `hl.config` for an option the file already sets, and keep the file's layout and comments. An option the
   file doesn't set yet goes into the matching section of the `hl.config` table that sets that section. Kaja backs
   the file up before it's changed. Saving a file makes Hyprland reload by itself.
7. **Check** with `hypr_check` right after saving. If it lists config errors, `restore_backup` the file you
   changed, `hypr_check` again, and tell the user what went wrong.

Several changes at once: preview them together, ask once, and save them in one `edit_file` per file.

## Undo

"Undo", "go back", "put it back like yesterday": `list_backups` for the file (times are UTC), pick the version the
user means, `restore_backup` it, then `hypr_check`. The restore is backed up too, so it can itself be undone.

## Limits

- Only edit files inside `~/.config/hypr/`.
- Don't touch keybinds (`binds.lua`), autostart (`autostart.lua`), environment variables or monitors unless the user
  asks for exactly that, and say what will happen first (a monitor change can blank a screen).
- `hypr_preview` handles options and animations. Curves, binds, window rules and the like can't be previewed: say
  so, and save them only after the user has seen the exact lines you'll write.
