> 🏔️🎪\
> 🟡🔴🟢🔵🟠🟡🔴🟢🔵🟠🟡🔴🟢🔵🟠🟡🔴🟢🔵🟠🟡🔴🟢🔵🟠\
> 🤡🎯 **Kaja __marketplace__** 🎈🎈🎈:suspect:\
> 🔵🟠🟡🔴🟢🔵🟠🟡🔴🟢🔵🟠🟡🔴🟢🔵🟠🟡🔴🟢🔵🟠🟡🔴🟢\
> ❄️🎡🐧

# Kaja marketplace

The abilities Kaja can load: personas, skills, HTTP tools, MCP servers and datasets. Local users get this folder with `kaja abilities update`, and the Kaja API syncs it every hour for cloud users, who pick theirs on the [Abilities page](https://kaja.io/agent/abilities).

Only the repo owner adds abilities here (a merged pull request counts), so there is no publish flow. To try a new one before it's merged, see [Adding to the marketplace](https://docs.kaja.io/abilities/marketplace#adding-to-the-marketplace).

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

## Writing one

- Names are lowercase letters, digits and single hyphens, up to 64 characters, and match the folder (skills) or file name (everything else).
- A skill's `description` (up to 1024 characters) is all the model sees before loading it, so make the "when" part concrete.
- Keep files as text. Binary files, hidden files and `*.bak` files are never shown to the model.
- `default.toml` is the persona every user always has. The CLI ships a copy for installs that haven't synced yet.
- Scripts should work with plain POSIX `sh`, or say what they need in `SKILL.md`.
- Tool names are what the model calls, so keep them specific (`weather_forecast`, not `get`). A name Kaja already uses is skipped.
- Never put a key in a file. `auth` only says where it goes, and the user's key stays in their `secrets.toml`.
- Anything but GET asks the user first, so make read-only endpoints GET tools.
- For an MCP ability, list only useful tools in the `tools` allowlist. Pick `approval = "writes"` when a server can change things, and add `readOnly` entries for tools that only read but aren't marked so (with `unless` for arguments that write, like a `filePath`). Say in the description what a stdio server needs installed.

What the cloud leaves out, and how the two copies are kept in step, is in the docs: [Abilities in the cloud](https://docs.kaja.io/abilities/marketplace#in-the-cloud) and [Marketplace internals](https://docs.kaja.io/development/marketplace). The format of each kind: [skills](https://docs.kaja.io/abilities/skills), [personas](https://docs.kaja.io/abilities/personas), [HTTP tools](https://docs.kaja.io/abilities/tools#http-tools), [MCP servers](https://docs.kaja.io/abilities/mcp) and [datasets](https://docs.kaja.io/abilities/memory#datasets).
