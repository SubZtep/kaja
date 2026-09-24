# Kaja marketplace

Abilities the Kaja CLI can load in local mode. `kaja abilities update` copies this folder into
`~/.config/kaja/marketplace/`, and `kaja abilities` picks which ones load (written to
`~/.config/kaja/abilities.toml`). Only the repo owner adds abilities here; there is no publish flow.

## Layout

```
marketplace/
├─ skills/<name>/
│  ├─ SKILL.md      # frontmatter (name, description) + instructions
│  ├─ *.md          # optional extra files the instructions point to
│  └─ scripts/      # optional scripts, run through run_command with the usual approval
├─ personas/<id>.toml # a persona: label, when to switch to it, instructions, optional sampling
├─ datasets/<id>.json # a questionnaire a persona fills in (`profile: true`: every persona sees the answers)
├─ tools/<name>.toml  # an HTTP API: base URL, auth, and the tools the model can call
└─ mcp/<name>.toml    # an MCP server: url (http/sse) or command (stdio), auth, approval, tool allowlist
```

- `name` in the frontmatter must match the folder: lowercase letters, digits and single hyphens,
  up to 64 characters.
- `description` (up to 1024 characters) says what the skill does and when to use it. It's all the
  model sees before loading the skill, so make the "when" part concrete.
- Keep files as text. Binary files, hidden files and `*.bak` files are never shown to the model.
- A persona's id is its file name, with the same naming rule. `default.toml` is the persona every
  user always has; the CLI also ships a copy of it, for installs that haven't synced yet.
- Scripts should work with a plain POSIX `sh` or state what they need in `SKILL.md`. A skill with a
  `scripts/` folder is local-only: the cloud catalog leaves it out, since there's no shell there.
- A tools file's `name` must match its file name. Tool names are what the model calls, so keep them
  specific (`weather_forecast`, not `get`); a name Kaja already uses is skipped. Never put a key in
  the file: `auth` only says where it goes, and the user's key stays in their `secrets.toml`.
- Anything but GET asks the user first, so read-only endpoints should be GET tools.
- An MCP ability's `tools` allowlist keeps the model's tool list short; list only what's useful.
  Pick `approval = "writes"` when a server can change things, and add `readOnly` entries for tools
  the server doesn't mark read-only but that only read (with `unless` for arguments that write, like
  a `filePath`). Say in the description what a stdio server needs installed (it runs on the user's
  machine).

## How sync treats local files

- A file you never touched is updated or removed along with this folder.
- A file you edited is replaced by the new version, and yours is saved next to it as `.bak`
  (`.bak2`, … if one already exists).
- A file this folder deleted but you edited stays, as your own.
- Files you added yourself are never touched.

See [docs/skills.md](../docs/skills.md) for skills, [docs/personas.md](../docs/personas.md) for personas and
[docs/http-tools.md](../docs/http-tools.md) for HTTP tools.
