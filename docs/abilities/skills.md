---
layout: page
title: Skills
parent: Abilities
nav_order: 3
summary: "Instructions the agent loads when a request matches."
---

# Skills

A skill is a folder of instructions for one kind of task: filling a PDF form, writing a changelog, checking
disk space. The model sees only each skill's name and description until a request matches one. Then it loads
the full instructions with the `load_skill` tool.

Skills use the Agent Skills folder format (see [anthropics/skills](https://github.com/anthropics/skills) for
examples):

```ini
~/.config/kaja/marketplace/skills/disk-check/
├─ SKILL.md         # frontmatter + instructions (required)
├─ reference.md     # any other text file the instructions point to
└─ scripts/df.sh    # scripts the model can run
```

```markdown
---
name: disk-check
description: Report free disk space. Use when the user asks about disk usage or a full disk.
---

Run `scripts/df.sh` and summarize which filesystems are above 90%.
For thresholds per filesystem type, read reference.md.
```

| Field | Purpose |
| --- | --- |
| `name` | must match the folder name: lowercase letters, digits and single hyphens, up to 64 characters |
| `description` | what the skill does and when to use it, up to 1024 characters. It's all the model sees before loading |

Other frontmatter keys (`license`, `metadata` and so on) are allowed and ignored.

## Writing your own

Create the folder under `~/.config/kaja/marketplace/skills/` and it loads on the next start, no
`abilities.toml` entry needed (rename or move the folder to switch it off). `kaja abilities` lists your own
skills apart, tagged `local`. A skill with missing or broken frontmatter is listed with the reason,
and the others still load.

## How the model uses them

- The system prompt lists every enabled skill's name and description.
- `load_skill(name)` returns the instructions, the skill's folder and its other files.
- `load_skill(name, file)` reads one of those files. Reads stay inside the skill folder, and file names
  match case-insensitively. Binary files, hidden files and backups (`SKILL.bak.md`) are never served.
- Scripts run through [`run_command`](/abilities/tools#shell-commands) with the usual approval, which is why
  skills with a `scripts/` folder are local-only.

A [persona](/abilities/personas) can limit which skills it offers with its `skills` list.

---

Next:

[Tools](/abilities/tools){: .btn .btn-green .fs-5 }
