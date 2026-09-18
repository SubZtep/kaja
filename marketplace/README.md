# Kaja marketplace

Packages the Kaja CLI can load in local mode. `kaja pkg update` copies this folder into
`~/.config/kaja/marketplace/`, and `kaja pkg` picks which ones load (written to
`~/.config/kaja/packages.toml`). Only the repo owner adds packages here; there is no publish flow.

## Layout

```
marketplace/
└─ skills/<name>/
   ├─ SKILL.md      # frontmatter (name, description) + instructions
   ├─ *.md          # optional extra files the instructions point to
   └─ scripts/      # optional scripts, run through run_command with the usual approval
```

- `name` in the frontmatter must match the folder: lowercase letters, digits and single hyphens,
  up to 64 characters.
- `description` (up to 1024 characters) says what the skill does and when to use it. It's all the
  model sees before loading the skill, so make the "when" part concrete.
- Keep files as text. Binary files, hidden files and `*.bak` files are never shown to the model.
- Scripts should work with a plain POSIX `sh` or state what they need in `SKILL.md`.

## How sync treats local files

- A file you never touched is updated or removed along with this folder.
- A file you edited is replaced by the new version, and yours is saved next to it as `.bak`
  (`.bak2`, … if one already exists).
- A file this folder deleted but you edited stays, as your own.
- Files you added yourself are never touched.

See [docs/skills.md](../docs/skills.md) for how the agent uses skills.
