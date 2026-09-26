---
layout: page
title: Skills
parent: Abilities
nav_order: 3
---

# Skills

A skill is a folder of instructions for one kind of task: how to fill a PDF form, how to write a
changelog, how to check disk space. The model only sees each skill's name and description until a
request matches one; then it loads the full instructions with the `load_skill` tool.

Skills use the Agent Skills folder format (see [anthropics/skills](https://github.com/anthropics/skills)
for examples):

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
| `description` | what the skill does and when to use it, up to 1024 characters; this is all the model sees before loading it |

Other frontmatter keys (`license`, `metadata`, …) are allowed and ignored.

## Writing your own

Create the folder under `~/.config/kaja/marketplace/skills/`, then turn it on with `kaja abilities`,
where your own skills are tagged `local`. A skill that is missing or has broken frontmatter is listed
with the reason, and the others still load.

## How the model uses them

- The system prompt lists every enabled skill's name and description.
- `load_skill(name)` returns the instructions, the skill's folder, and its other files.
- `load_skill(name, file)` reads one of those files. Reads stay inside the skill folder, and file
  names match case-insensitively. Binary files, hidden files and `.bak` backups are never served.
- Scripts run through [`run_command`](/tools#shell-commands), with the same approval as any other
  command — so skills with a `scripts/` folder are local-only.

A [persona](/personas) can limit which skills it offers with its `skills` list.

---

Next:

[Built-in tools](/tools){: .btn .btn-green .fs-5 }
