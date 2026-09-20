---
layout: page
title: Schema
parent: Development
nav_order: 12.4
---

# @kaja/schema

Every Zod schema in the project lives here, split into role-based subpaths that are each their own
import — there is no bare `@kaja/schema` import, and no app keeps local schema files.

| Subpath | Contents | Consumers |
|---|---|---|
| `@kaja/schema/api` | REST contracts: `McpServer`, `Provider`/`Model`, `WidgetKey`, the ability catalog and users' keys, usage stats, the Telegram link, auth payloads | `apps/api`, `apps/web` |
| `@kaja/schema/nasi` | cloud turn request/response, widget turn | `apps/api`, `apps/tui`, `packages/nasi` |
| `@kaja/schema/abilities` | marketplace content: skill frontmatter, HTTP tool, MCP server, persona and dataset manifests | `apps/api`, `apps/tui`, `packages/nasi` |
| `@kaja/schema/config` | the CLI's hand-edited TOML files (settings, models, mcp, services, secrets, abilities) | `apps/tui` |
| `@kaja/schema/store` | SQLite/Postgres-backed runtime state | `apps/tui`, `packages/nasi` |
| `@kaja/schema/cli` | remaining CLI domain concepts: datasets, plus a re-export of the persona schema | `apps/tui` |
| `@kaja/schema/env` | env-var schemas — source of truth for every `.env.example` | build scripts |
| `@kaja/schema/tombi` | JSON Schema generation for the TOML config files | build scripts |

The last two are generators' input, not runtime imports: `bun generate:env`,
`bun generate:env-types`, and `bun generate:schemas` read them. See `packages/schema/AGENTS.md` for
naming conventions.

Dates are `z.coerce.date()` throughout, so JSON round-trips cleanly.

## `@kaja/schema/api`

Shared by `apps/api`, `apps/web`.

```mermaid
---
config:
  look: handDrawn
  theme: neo-dark
---
erDiagram
  direction LR
  McpServer {
    string id
    string serverId
    string command
    string url
    boolean enabled
  }
  Provider {
    string id
    string name
    string baseUrl
    string apiKey
  }
  Model {
    string id
    string providerId
    string model
    ModelTask_array tasks
    boolean enabled
    boolean free
  }
  ResolvedModel {
    string id
    string model
    ModelTask_array tasks
    string baseUrl
  }
  WidgetKey {
    string id
    string label
    string keyPrefix
    string_array allowedOrigins
    WidgetConfig config
    boolean enabled
  }

  CatalogAbility {
    string type "skill, persona, tool or mcp"
    string name
    string description
    HttpToolDetail http "tools only"
    McpDetail mcp "MCP servers only"
    PersonaDetail persona "personas only"
  }
  UserAbility {
    string type
    string name
    boolean available "false once it left the marketplace"
  }

  Provider ||--o{ Model : "providerId"
  Provider ||--o| ResolvedModel : "resolves into"
  CatalogAbility ||--o{ UserAbility : "type + name"
```

The same subpath also holds the key routes' payloads (`saveAbilityKeyRequestSchema` and its check result), the
marketplace sync status, the usage-stats response, the Telegram link response and the config export bundle.

## `@kaja/schema/abilities`

What a marketplace folder contains, read by whichever host loads it: the CLI from `marketplace/` on disk, the
API when it syncs the folder into Postgres. Each kind of ability has one manifest schema.

```mermaid
---
config:
  look: handDrawn
  theme: neo-dark
---
erDiagram
  direction LR
  SkillFrontmatter {
    string name "the folder name"
    string description
  }
  HttpToolAbility {
    string baseUrl
    HttpToolAuth auth "none, or an apiKey in a header or query"
    string_map headers
    HttpCheck check "optional request that tests a key"
    HttpTool_array tools "name, method, path, parameters"
  }
  McpAbility {
    string transport "http, sse or stdio"
    string url "remote servers"
    string command "stdio, local only"
    string_array tools "only these reach the model"
    string approval "never, writes or always"
    McpAbilityAuth auth
  }
  Persona {
    string label
    string instructions
    string when "shown in the roster"
    string dataset "a dataset id"
    string_array skills "unset = all enabled"
    PersonaModels models "per-task overrides"
  }
  Dataset {
    string label
    DatasetField_array fields
    integer revalidateAfterDays
    boolean profile "every persona sees the answers"
  }

  Persona }o--o| Dataset : "dataset"
```

## `@kaja/schema/nasi`

The HTTP turn contract, shared by the API, the cloud CLI client, and the widget.

```mermaid
---
config:
  look: handDrawn
  theme: neo-dark
---
erDiagram
  direction LR
  NasiTurnRequest {
    string message
    string session
    boolean includeThinking
  }
  WidgetTurnRequest {
    string message
    string session
    string visitorId
  }
  NasiTurnResponse {
    string session
    NasiStatus status
    string message
    NasiStep_array steps
    string thinking
    NasiUsage usage
  }
  NasiStep {
    NasiStepType type
    string payload
  }

  NasiTurnRequest ||--o| NasiTurnResponse : "POST /nasi/turn"
  WidgetTurnRequest ||--o| NasiTurnResponse : "POST /widget/turn"
  NasiTurnResponse ||--o{ NasiStep : "steps[]"
```

See [Agent brain](/development/nasi) for what the statuses and step types mean.

## `@kaja/schema/config`

CLI on-disk files the user hand-edits (`apps/tui`).

```mermaid
---
config:
  look: handDrawn
  theme: neo-dark
---
erDiagram
  direction LR
  KajaConfig {
    KajaStt stt
    KajaTts tts
    KajaMemory memory
    KajaPreferences preferences
  }
  KajaModelsFile {
    ProviderMap providers
    ModelEntryMap models
  }
  ModelEntry {
    string model
    Task task
    string provider
  }
  McpFile {
    McpServerEntry_array servers
  }
  ServicesFile {
    ServicesLocation location
    ServicesWebSearch webSearch
    ServicesTelegram telegram
    ServicesApi api
  }

  AbilitiesFile {
    string_array skills "enabled, by folder name"
    string_array tools
    string_array mcp
    string_array personas
  }
  SecretsFile {
    ProviderMap providers "apiKey per provider"
    McpSecretMap mcp
    AbilitySecretMap abilities "apiKey per ability"
    SecretsTelegram telegram
  }

  KajaModelsFile ||--o{ ModelEntry : "models[id]"
```

## `@kaja/schema/cli`

Remaining CLI domain concepts (`apps/tui`).

```mermaid
---
config:
  look: handDrawn
  theme: neo-dark
---
erDiagram
  direction LR
  Persona {
    string label
    string instructions
    PersonaModels models
    string dataset
    string when
  }
  PersonaModels {
    string chat
    string embedding
    string rerank
    string image_generation
    string tts
    string stt
  }
  SamplingParams {
    number temperature
    number top_p
    number max_tokens
  }
  Dataset {
    string label
    DatasetField_array fields
    number revalidateAfterDays
  }
  DatasetField {
    string name
    string prompt
    string_array accepted
  }

  Persona ||--|| SamplingParams : "extends"
  Persona ||--o| PersonaModels : "models"
  Persona }o--o| Dataset : "dataset id"
  Dataset ||--o{ DatasetField : "fields[]"
```

## `@kaja/schema/store`

CLI SQLite-backed runtime state (`apps/tui`).

```mermaid
---
config:
  look: handDrawn
  theme: neo-dark
---
erDiagram
  direction LR
  PersistedSession {
    number id
    string persona
    string model
    string title
    string owner
    json session
    json_array events
  }
  SessionMeta {
    number id
    string persona
    string model
    string title
    string owner
  }
  MemoryNote {
    string content
    MemoryImportance importance
    string_array tags
    boolean sticky
  }
  MemoryStore {
    map notes
  }

  PersistedSession ||--|| SessionMeta : "omit(session, events)"
  MemoryStore ||--o{ MemoryNote : "keyed by note key"
```

## Cross-subpath references

These aren't type imports (each subpath stays decoupled per `packages/schema/AGENTS.md`) — just IDs/strings that happen to reference a concept in another subpath at runtime:

- `config`'s `KajaPreferences.persona` → `cli`'s `Persona.id`
- `cli`'s `Persona.models.<task>` (all six tasks) → `config`'s own `CliResolvedModel.id` (soft fallback: unmatched id falls through to models.toml's `[models.<task>]` entry, resolved per-task via `resolveActiveModel`)
- `store`'s `PersistedSession.persona` → `cli`'s `Persona.id`
- `store`'s `PersistedSession.model` → `api`'s `Model.id`

## TOML schemas

`bun generate:schemas` turns the `config`, `abilities` and `cli` schemas into the JSON Schemas under
[`docs/config/schemas`](https://github.com/SubZtep/kaja/tree/main/docs/config/schemas), which is
what gives editors completion and validation for `settings.toml`, `models.toml`, `mcp.toml`,
`services.toml`, `secrets.toml`, `abilities.toml`, and the marketplace manifests (personas, datasets, HTTP
tools and MCP abilities). The pre-commit hook regenerates them whenever those
schemas change — never edit the JSON by hand.

---

Next:

[Deployment](/development/deployment){: .btn .btn-green .fs-5 }
