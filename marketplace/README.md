# Kaja marketplace

Packages the Kaja CLI can load in local mode. `kaja pkg update` copies this folder into
`~/.config/kaja/marketplace/`, and `kaja pkg` picks which ones load (written to
`~/.config/kaja/packages.toml`). Only the repo owner adds packages here; there is no publish flow.

## Layout

```
marketplace/
├─ skills/<name>/
│  ├─ SKILL.md      # frontmatter (name, description) + instructions
│  ├─ *.md          # optional extra files the instructions point to
│  └─ scripts/      # optional scripts, run through run_command with the usual approval
└─ tools/<name>.toml  # an HTTP API: base URL, auth, and the tools the model can call
```

- `name` in the frontmatter must match the folder: lowercase letters, digits and single hyphens,
  up to 64 characters.
- `description` (up to 1024 characters) says what the skill does and when to use it. It's all the
  model sees before loading the skill, so make the "when" part concrete.
- Keep files as text. Binary files, hidden files and `*.bak` files are never shown to the model.
- Scripts should work with a plain POSIX `sh` or state what they need in `SKILL.md`.
- A tools file's `name` must match its file name. Tool names are what the model calls, so keep them
  specific (`weather_forecast`, not `get`); a name Kaja already uses is skipped. Never put a key in
  the file: `auth` only says where it goes, and the user's key stays in their `secrets.toml`.
- Anything but GET asks the user first, so read-only endpoints should be GET tools.

## How sync treats local files

- A file you never touched is updated or removed along with this folder.
- A file you edited is replaced by the new version, and yours is saved next to it as `.bak`
  (`.bak2`, … if one already exists).
- A file this folder deleted but you edited stays, as your own.
- Files you added yourself are never touched.

See [docs/skills.md](../docs/skills.md) for skills and [docs/tools.md](../docs/tools.md) for HTTP tools.
