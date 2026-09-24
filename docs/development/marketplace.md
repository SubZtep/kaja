---
layout: page
title: Marketplace internals
parent: Development
nav_order: 6
---

# Marketplace internals

The user-facing side is on [Abilities](/abilities). This page is how the two copies of the
`marketplace/` folder are kept.

There is no publishing flow and no registry service: the repo owner adds a file, and two consumers copy
the folder on their own schedule. The copies are separate and can be at different commits — the
terminal never talks to the API's copy, and the API never reads anyone's disk.

```mermaid
---
config:
  look: handDrawn
  theme: neo-dark
---
flowchart LR
    REPO[["<b>GitHub repo</b><br><small>marketplace/ folder</small>"]]

    subgraph LOCAL["your machine"]
        CACHE["git cache<br><small>sparse checkout</small>"]
        FOLDER["~/.config/kaja/marketplace/<br><small>+ abilities.toml picks</small>"]
    end

    subgraph CLOUD["the Kaja API"]
        SYNC["MarketplaceService<br><small>hourly, at start, on demand</small>"]
        PG[("Postgres<br><small>ability table</small>")]
    end

    REPO -->|"kaja abilities update"| CACHE --> FOLDER
    REPO -->|"GitHub API + tarball"| SYNC --> PG
```

Each kind has one manifest format, checked by the schemas in
[`@kaja/schema/abilities`](/development/schema). Names are lowercase letters, digits and single
hyphens, up to 64 characters, and must match the folder (skills) or file name (everything else). A file
that fails validation is skipped with a warning by whoever reads it. Binary files, hidden files and
`.bak` backups are never served to the model.

## The terminal's copy

```mermaid
---
config:
  look: handDrawn
  theme: neo-dark
---
sequenceDiagram
    participant K as kaja abilities update
    participant C as git cache
    participant F as marketplace folder

    K->>C: first time: clone --depth 1 --sparse
    K->>C: fetch --depth 1 origin, reset to FETCH_HEAD
    C-->>K: the marketplace folder and its commit
    K->>F: sync against .sync-lock.json
    F-->>K: added, updated, backed up, removed, kept
```

- Needs `git` 2.25+ (`clone --sparse`); the version is checked first, and `kaja doctor` shows it.
  Prompts are off, so a private or mistyped URL fails instead of waiting for a password, and every git
  call has a two-minute timeout. Changing `[source] url` re-clones.
- Each sync compares, per file, the upstream copy, the user's copy, and the hash the previous sync
  recorded in `.sync-lock.json`:

```mermaid
---
config:
  look: handDrawn
  theme: neo-dark
---
flowchart TD
    A(["a file upstream"]) --> B{"user has it?"}
    B -->|no| ADD["copy it: added"]
    B -->|yes| C{"same as upstream?"}
    C -->|yes| SAME["nothing to do"]
    C -->|no| D{"same as what the last<br>sync wrote?"}
    D -->|"yes: untouched"| UPD["replace it: updated"]
    D -->|"no: edited"| BAK["save theirs as .bak,<br>then replace: backed up"]

    G(["a file the last sync wrote,<br>now gone upstream"]) --> H{"still untouched?"}
    H -->|yes| RM["delete it: removed"]
    H -->|"no: edited"| KEEP["keep it: kept"]
```

The sync keeps the executable bit on scripts and prunes folders it emptied. At startup the terminal
reads only what `abilities.toml` lists.

## The API's copy

```mermaid
---
config:
  look: handDrawn
  theme: neo-dark
---
sequenceDiagram
    participant T as trigger
    participant S as MarketplaceService
    participant G as GitHub
    participant D as Postgres

    T->>S: startup, hourly, or admin button
    S->>G: GET /commits/ref (sha only)
    alt same commit as the last sync
        S-->>T: nothing changed
    else the branch moved
        S->>G: download the commit's tarball
        S->>S: extract and validate every file
        S->>D: one transaction: upsert each ability,<br/>mark the missing ones removed
        S->>D: record the commit in marketplace_sync
    end
```

- **Triggers.** Once at API start-up (in the background), every hour on the hour, and the admins'
  **Sync now** button. Only one sync runs at a time.
- **Cheap when idle.** The check is one unauthenticated GitHub API call, so the repo must be public. The
  tarball (capped at 50 MB) is only downloaded when the branch head moved.
- **Which repo.** `MARKETPLACE_REPO` (default `SubZtep/kaja`) and `MARKETPLACE_REF` (default `main`).
- **Failures are recorded** in the single `marketplace_sync` row, shown in the admin panel, and
  reported to Sentry. The previous catalog stays in place.
- **Nothing is deleted.** An ability that leaves the folder gets `removed_at`; users' selections survive
  and come back if it returns. `updated_at` only moves when the content hash — which covers just what
  the agent sees — changes.

An ability that can't run in the cloud is skipped at sync time, and one that stops qualifying is hidden
from the catalog: a skill with `scripts/`; an HTTP tool on a non-public host, or needing a key when the
server has no `USER_SECRET_KEY`; an MCP server that's `stdio`, has no `tools` allowlist, is on a
non-public host, or shares a name with an HTTP tool (a key belongs to one name); anything whose manifest
no longer parses.

## Loading

Whichever front door a turn comes in through, [`@kaja/nasi`](/development/nasi#abilities) does the
loading: it asks an `AbilityStore` — the folder on disk, or the Postgres copy — for the enabled
abilities, and turns them into tools, skills in the system prompt, and roster personas. The prompt's
skill and persona sections are rebuilt every turn, which is why a change applies from the next message.

| Front door | Where the choice is stored |
| --- | --- |
| terminal (local), local Telegram bot | `abilities.toml` and the `marketplace/` folder |
| terminal (cloud), cloud Telegram bot | the account's `user_ability` rows |
| widget | the key's `config.skills` |

---

Next:

[Deployment](/development/deployment){: .btn .btn-green .fs-5 }
