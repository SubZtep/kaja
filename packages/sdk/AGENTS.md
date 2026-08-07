# @kaja/sdk

Typed HTTP client for the Kaja API. Used primarily by the web app; designed so other clients can share the same surface.

## Layout

```
index.ts    # KajaAPI class (mcpServers, providers, models, private #request)
```

## Usage

```ts
import { KajaAPI } from "@kaja/sdk"

const api = new KajaAPI({
  baseUrl: import.meta.env.VITE_API_URL,
  getAccessToken: async () => /* session token or null */
})

const models = await api.models.list()
```

Web wires this in `components/Providers.tsx` and exposes it via `useApiSdk()`. Token comes from the Better Auth session (`authClient.getSession()` / session token). Cookie sessions also work via `credentials: "include"`.

## Conventions

- Methods return **parsed** data using Zod schemas from `@kaja/schema`
- Auth: `Authorization: Bearer` when `getAccessToken()` returns a token; `credentials: "include"` for cookie sessions
- POST when a payload is passed; GET when `payload` is `undefined`
- Log failures with `@kaja/logger` (`error(message, payload)`)
- Single client for API access — do not add parallel `fetch` wrappers in apps

## Extending

1. Add/adjust schema in `@kaja/schema`
2. Implement the route in `@kaja/api`
3. Add a typed method here that `#request`s and `.parse`s the response
4. Call from web (or other clients) — no ad-hoc `fetch` to the same endpoints

## Boundaries

- No React, no browser-only APIs
- Do not duplicate schema definitions; import from `@kaja/schema`
- Keep error handling centralized in `#request`
