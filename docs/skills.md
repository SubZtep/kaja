---
layout: page
title: Skills
nav_order: 7.5
---

# Skills

A skill is a folder of instructions for one kind of task: how to fill a PDF form, how to write a
changelog, how to check disk space. The model only sees each skill's name and description until a
request matches one; then it loads the full instructions with the `load_skill` tool. Local mode
only for now.

Skills use the Agent Skills folder format (see [anthropics/skills](https://github.com/anthropics/skills) for examples):

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

## The marketplace

Kaja's own skills live in the [`marketplace/`](https://github.com/SubZtep/kaja/tree/main/marketplace)
folder of its repo. `kaja pkg update` fetches that folder (with `git`, so git must be installed) and
syncs it into `~/.config/kaja/marketplace/`, next to your own skills:

- files you never touched follow the marketplace, including removals
- a file you edited is replaced by the new version, and yours is saved next to it as `.bak`
  (`.bak2`, … when one exists)
- a file the marketplace removed but you edited stays, as your own
- files you added yourself are never touched

Only `kaja pkg` and `kaja pkg update` use the network; starting Kaja never does. To fetch from a
fork, a branch, or a local checkout instead, set a source in `packages.toml`:

```toml
[source]
url = "/home/me/src/kaja"   # any git URL or local path
ref = "my-branch"
```

## Turning skills on

`kaja pkg` shows every skill in the folder as a checklist (space toggles, Enter saves). Your own
skills are tagged `local`; skills that can't load are listed underneath with the reason.

It writes `~/.config/kaja/packages.toml`, which you can also edit by hand. Only skills listed there
are loaded, including the ones you wrote yourself:

```toml
skills = ["disk-check"]
```

A listed skill that is missing or has broken frontmatter is skipped with a warning in the log; the
others still load.

## How the model uses them

- The system prompt lists every enabled skill's name and description.
- `load_skill(name)` returns the instructions, the skill's absolute folder, and its other files.
- `load_skill(name, file)` reads one of those files. Reads stay inside the skill folder, and file
  names match case-insensitively. Binary files, hidden files and `.bak` backups are never served.
- Scripts run through [`run_command`](/tools), with the same approval rules as any other command.

## Per persona

A persona can limit which skills it offers with a `skills` list in its
[persona file](/personas). Leave it out to allow every enabled skill; `skills = []` turns skills off
for that persona.
