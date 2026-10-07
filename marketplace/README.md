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
├─ abilities/<name>/  # one folder per ability, named after it; any mix of these parts:
│  ├─ SKILL.md        # a skill: frontmatter (description, optional sticky) + instructions
│  ├─ *.md            # optional extra files the instructions point to
│  ├─ scripts/        # optional scripts, run through run_command with the usual approval
│  ├─ tool.toml       # an HTTP API: base URL, auth, and the tools the model can call
│  ├─ mcp.toml        # an MCP server: url (http/sse) or package/command (stdio), auth, approval, tool allowlist
│  └─ tool.ts         # code tools: exports with a `definition` and an `execute` function (local only)
├─ personas/<id>.toml # a persona: label, when to switch to it, instructions, optional sampling
└─ datasets/<id>.json # a questionnaire a persona fills in (`profile: true`: every persona sees the answers)
```

## Writing one

- Names are lowercase letters, digits and single hyphens, up to 64 characters. An ability's name is its folder's and a persona's or dataset's its file's, so no file has a `name` of its own (one that does is refused), except SKILL.md: the Agent Skills format wants `name` in its frontmatter, so it may repeat the folder's (and must match it).
- Each part keeps its own `description`. One key per ability (`secrets.toml`'s `[abilities.<name>]`) serves all its parts.
- A skill's `description` (up to 1024 characters) is all the model sees before loading it, so make the "when" part concrete.
- Keep files as text. Binary files, hidden files and backups (`*.bak.*`, such as `care.bak.toml`) are never shown to the model.
- `default.toml` is the persona every user always has. The CLI ships a copy for installs that haven't synced yet.
- Scripts should work with plain POSIX `sh`, or say what they need in `SKILL.md`.
- `tool.ts` runs on the user's machine, so the cloud skips it; it skips a skill with `scripts/` too, and keeps the ability's other parts.
- Tool names are what the model calls, so keep them specific (`weather_forecast`, not `get`). A name Kaja already uses is skipped.
- Never put a key in a file. `auth` only says where it goes, and the user's key stays in their `secrets.toml`.
- Anything but GET asks the user first, so make read-only endpoints GET tools.
- For an MCP ability, list only useful tools in the `tools` allowlist. Pick `approval = "writes"` when a server can change things, and add `readOnly` entries for tools that only read but aren't marked so (with `unless` for arguments that write, like a `filePath`). For a stdio server, prefer `package` (`npm`, `pypi` and/or `docker`, each pinned to an exact version or digest) over a `command`, so it runs with whatever the user has, and say in the comments what that is. Keep a version the sandbox's Dockerfile preinstalls in step with it.

What the cloud leaves out, and how the two copies are kept in step, is in the docs: [Abilities in the cloud](https://docs.kaja.io/abilities/marketplace#in-the-cloud) and [Marketplace internals](https://docs.kaja.io/development/marketplace). The format of each kind: [skills](https://docs.kaja.io/abilities/skills), [personas](https://docs.kaja.io/abilities/personas), [HTTP tools](https://docs.kaja.io/abilities/tools#http-tools), [MCP servers](https://docs.kaja.io/abilities/mcp) and [datasets](https://docs.kaja.io/abilities/memory#datasets).
