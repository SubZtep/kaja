---
layout: page
title: Schema
parent: Development
nav_order: 9.3
---

`@kaja/schema` is split into four role-based subpaths — `api`, `config`, `store`, `cli` — each its own import (no bare `@kaja/schema` import). See `packages/schema/AGENTS.md` for conventions.

## `@kaja/schema/api`

Shared by `apps/api`, `apps/web`, `packages/sdk`.

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

  Provider ||--o{ Model : "providerId"
  Provider ||--o| ResolvedModel : "resolves into"
```

## `@kaja/schema/config`

CLI on-disk files the user hand-edits (`apps/cli`).

```mermaid
---
config:
  look: handDrawn
  theme: neo-dark
---
erDiagram
  direction LR
  KajaConfig {
    KajaModels models
    KajaStt stt
    KajaTts tts
    KajaMemory memory
    KajaPreferences preferences
  }
  KajaModels {
    KajaModelRef chat
    KajaModelRef embedding
    KajaModelRef rerank
    KajaModelRef image_generation
    KajaModelRef text_to_speech
    KajaModelRef speech_to_text
  }
  KajaModelRef {
    string model
    string provider
  }
  KajaModelsFile {
    ProviderMap providers
    ModelEntry_array models
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
    ServicesZen zen
  }

  KajaConfig ||--|| KajaModels : "models"
  KajaModels ||--o{ KajaModelRef : "per task"
  KajaModelsFile ||--o{ ModelEntry : "models[]"
  KajaModelRef }o--o| ModelEntry : "provider lookup in models.toml"
```

## `@kaja/schema/cli`

Remaining CLI domain concepts (`apps/cli`).

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
    string model
    string dataset
    string when
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
  Persona }o--o| Dataset : "dataset id"
  Dataset ||--o{ DatasetField : "fields[]"
```

## `@kaja/schema/store`

CLI SQLite-backed runtime state (`apps/cli`).

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
- `config`'s `KajaModelRef.provider` → looked up against `config`'s own `KajaModelsFile.providers`
- `store`'s `PersistedSession.persona` → `cli`'s `Persona.id`
- `store`'s `PersistedSession.model` → `api`'s `Model.id` (or a free-tier id)

## Subpaths

| Subpath | Contents | Consumers |
|---|---|---|
| `@kaja/schema/api` | `McpServer`, `Provider`/`Model`, auth payloads | `apps/api`, `apps/web`, `packages/sdk` |
| `@kaja/schema/config` | `KajaConfig` (settings.json), `KajaModelsFile` (models.toml), `McpFile` (mcp.toml), `ServicesFile` (services.toml) | `apps/cli` |
| `@kaja/schema/store` | `PersistedSession`/`SessionMeta`, `MemoryNote`/`MemoryStore` (SQLite-backed) | `apps/cli` |
| `@kaja/schema/cli` | `Persona`, `SamplingParams`, `Dataset`/`DatasetField` | `apps/cli` |
