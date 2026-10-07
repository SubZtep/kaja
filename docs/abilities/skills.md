---
layout: page
title: Skills
parent: Abilities
nav_order: 3
summary: "Instructions the agent loads when a request matches."
icon: 📜
---

# Skills

A skill is a folder of instructions for one kind of task: filling a PDF form, writing a changelog, checking
disk space. The model sees only each skill's name and description until a request matches one. Then it loads
the full instructions with the `load_skill` tool.

Skills use the Agent Skills folder format (see [anthropics/skills](https://github.com/anthropics/skills) for
examples):

```ini
~/.config/kaja/marketplace/abilities/disk-check/
├─ SKILL.md         # frontmatter + instructions (required for a skill)
├─ reference.md     # any other text file the instructions point to
└─ scripts/df.sh    # scripts the model can run
```

```markdown
---
description: Report free disk space. Use when the user asks about disk usage or a full disk.
---

Run `scripts/df.sh` and summarize which filesystems are above 90%.
For thresholds per filesystem type, read reference.md.
```

| Field | Purpose |
| --- | --- |
| `description` | what the skill does and when to use it, up to 1024 characters. It's all the model sees before loading |
| `sticky` | optional: `true` suggests keeping the instructions in the system prompt while a persona uses the ability |

The folder name is the skill's name (lowercase letters, digits and single hyphens, up to 64 characters), so
there's no `name` key: a SKILL.md with one is refused. Other frontmatter keys (`license`, `metadata` and so
on) are allowed and ignored. The same folder can also hold the ability's `tool.toml`, `mcp.toml` or `tool.ts`;
those aren't the skill's files, and `load_skill` never serves them.

## Writing your own

Create the folder under `~/.config/kaja/marketplace/abilities/` and it loads on the next start; a persona
that lists it in `abilities` gets it. `kaja abilities` tags your own `local`. A skill with missing or broken
frontmatter is listed with the reason, and the others still load.

## How the model uses them

- The system prompt lists every enabled skill's name and description.
- `load_skill(name)` returns the instructions, the skill's folder and its other files.
- `load_skill(name, file)` reads one of those files. Reads stay inside the skill folder, and file names
  match case-insensitively. Binary files, hidden files and backups (`SKILL.bak.md`) are never served.
- Scripts run through [`run_command`](/abilities/tools#shell-commands) with the usual approval, which is why
  skills with a `scripts/` folder are local-only.

A skill reaches the model only while a [persona](/abilities/personas#abilities) that lists its ability is
active, which also decides whether it's loaded on demand, kept in the system prompt (`sticky`) or left out.

---

Next:

[Tools](/abilities/tools){: .btn .btn-green .fs-5 }
