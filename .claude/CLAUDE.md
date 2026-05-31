# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kaja is a TypeScript monorepo built with Bun, featuring:
- **API**: Hono-based REST API with Better Auth authentication
- **Web**: TanStack Start frontend with admin portal
- **CLI**: Installable device authorization CLI for node orchestration
- **Mobile**: Expo/React Native mobile app for iOS and Android
- **Packages**: Shared schemas, utilities, geolocation, and logger

The project uses device authorization flow allowing CLI nodes to connect to the API after user approval via web interface.

## Key File Locations

When looking for configuration files, check these locations first:
- **Docker Compose**: `compose.yaml` (NOT `docker-compose.yml` or `docker-compose.yaml`)
- **Biome Config**: `biome.jsonc`
- **TypeScript Config**: Root `tsconfig.json` with per-app configs in `apps/*/tsconfig.json`
- **Package Manager**: `bun.lock` (Bun's lockfile)
- **Environment Files**: `.env.example` files in `apps/api/`, `apps/web/`, and `apps/cli/`
- **Database Schema**: `apps/api/src/db/schema/*.schema.ts` (Drizzle schemas)
- **Bootstrap SQL**: `apps/api/src/db/migrations/000-uuidv7.sql` (UUIDv7 function only)

## Development Commands

### Quick Start
```bash
# Start all services (PostgreSQL, MailDev, API, Web)
docker compose up -d

# Run CLI in development
bun dev:cli
```

### Common Commands
```bash
# Development (excludes CLI and Mobile)
bun dev

# Linting
bun lint              # Check code
bun lint:fix          # Fix issues (includes unsafe fixes)

# Type checking
bun typecheck         # Run TypeScript compiler checks across all apps

# Testing
bun run test              # Runs tests with both .env.example and .env
```

### Per-Workspace Commands
```bash
# API
bun run --filter @kaja/api dev          # Hot-reload server
bun run --filter @kaja/api build        # Build to dist/server.js

# Web
bun run --filter @kaja/web dev          # Vite dev server on :3000
bun run --filter @kaja/web build

# CLI
bun run --env-file=apps/cli/.env apps/cli/src/cli.tsx
bun run --filter @kaja/cli build:release  # Build standalone executable

# Mobile
bun run --filter @kaja/mobile start       # Start Expo dev server
bun run --filter @kaja/mobile android     # Run on Android
bun run --filter @kaja/mobile ios         # Run on iOS
```

## Architecture

### Authentication Flow
- Uses Better Auth with device authorization plugin
- CLI initiates device auth flow with KAJA_CLI_CLIENT_ID constant (from @kaja/schema)
- User approves device via web `/device` route
- CLI polls API for token approval
- Supports email/password, email verification, password reset, and admin roles
- Session cookies prefixed with "kaja"

### API Structure (`apps/api/src/`)
- **Entry**: `core/server.ts` starts Hono app and SchedulerService
- **App**: `app.ts` defines routes and middleware
- **Core**:
  - `core/db.ts` - PostgreSQL connection pool
  - `core/logger.ts` - Pino structured logging
  - `core/rate-limit.ts` - Rate limiting middleware (hono-rate-limiter)
    - Global: 100 req/15min per IP
    - Auth endpoints: 50 req/15min per IP
- **Features**:
  - `features/auth/` - Better Auth configuration and routes
  - `features/kaja/routes/node/` - Node management endpoints:
    - `connect.ts` - Register/connect new nodes
    - `heartbeat.ts` - Update node heartbeat
    - `disconnect.ts` - Gracefully disconnect nodes
    - `list.ts` - List all nodes
    - `stream.ts` - Server-sent events for real-time updates
  - `features/kaja/routes/admin/` - Admin endpoints:
    - `command.ts` - Send commands to nodes
  - `features/kaja/services/` - Business logic:
    - `scheduler.ts` - Marks inactive nodes based on heartbeat timeout
    - `command.ts` - Command queuing and execution
    - `events.ts` - Server-sent event management
    - `node.ts` - Node operations and queries
- **Emails**: React Email templates sent via nodemailer

### Web Structure (`apps/web/src/`)
- TanStack Router with file-based routing
- Two route layouts: `_public.tsx` and `_admin.tsx`
- Uses `#/*` import alias for src/
- Auth client from Better Auth in `hooks/auth-client.ts`
- SDK instance initialized in `components/Providers.tsx` with Better Auth session token
- Access SDK via `useApiSdk()` hook from `hooks/use-api-sdk.ts`
- Components organized: layout/, form/, ui/

### CLI Structure (`apps/cli/`)
- Entry: `src/cli.tsx` - initializes auth session and node operations
- `lib/sdk.ts` - SDK instance using @kaja/sdk with Bun.secrets token storage
- `lib/auth-client.ts` - Better Auth client for device authorization flow
- `lib/config.ts` - Configuration management using env-paths
- `lib/token.ts` - Token storage and retrieval via Bun.secrets
- `ui/` - React Ink components for interactive CLI

### Mobile Structure (`apps/mobile/`)
- Expo SDK v56 with React Native 0.85
- File-based routing via expo-router
- Uses Expo UI and Expo Glass Effect for native UI components
- React 19 with react-native-reanimated for animations
- Development scripts: start, android, ios, web
- See `apps/mobile/AGENTS.md` for Expo-specific guidance

### Packages
- **@kaja/sdk**: Type-safe API client with automatic response validation using Zod schemas
- **@kaja/schema**: Zod schemas for API contracts (auth.ts, geo.ts, node.ts) - single source of truth for types (includes KAJA_CLI_CLIENT_ID)
- **@kaja/shared**: Pure utility functions (clsx, tailwind-merge)
- **@kaja/geo**: Geolocation services using MaxMind
- **@kaja/logger**: Pino logger with node/browser exports

### SDK Architecture

The `@kaja/sdk` package provides a centralized, type-safe API client used by both web and CLI applications:

**Features:**
- Typed methods for all API endpoints (e.g., `nodes.list()`, `nodes.connect()`, `nodes.heartbeat()`)
- Automatic response validation using Zod schemas from `@kaja/schema`
- Proper TypeScript types for requests and responses
- Centralized error handling

**Token Management:**
- **Web**: Uses Better Auth client session (`authClient.getSession()`) to get current access token
- **CLI**: Uses Bun.secrets for persistent token storage across sessions

**Usage:**
- **Web**: SDK instance created in `components/Providers.tsx`, accessed via `useApiSdk()` hook
- **CLI**: SDK instance in `lib/sdk.ts`, imported directly where needed

**Benefits:**
- No code duplication between web and CLI
- Single source of truth for API client logic
- Type safety across all API interactions
- Automatic validation ensures response integrity

### Type Architecture

The codebase follows a **single source of truth** pattern for types:

**API Contract Types** (`@kaja/schema`):
- `Node`, `Command` - Public API types exposed to clients
- All Zod schemas for request/response validation
- Exported from `@kaja/schema` package
- Used by SDK, web app, CLI, and API routes

**Database Row Types** (`apps/api/src/db/schema/*.schema.ts`):
- `NodeRow`, `CommandRow` - Internal database representation
- `InsertNode`, `InsertCommand` - Types for inserting into database
- Derived from Drizzle schema using `typeof table.$inferSelect`
- **Never exported** outside of API codebase

**Mapping Pattern:**
- Services use mapper functions (e.g., `#rowToNode(row: NodeRow): Node`)
- Database rows → API types for responses
- API types → Database inserts for requests
- Keeps database schema decoupled from API contract

**Key Rules:**
- ✅ Import `Node`, `Command` from `@kaja/schema` for API interactions
- ✅ Use `NodeRow`, `CommandRow` only within API service layer
- ✅ Never export database types from `apps/api/src/db/schema`
- ✅ Date fields use `z.coerce.date()` for JSON serialization compatibility

### Database
- **Schema Management**: Drizzle ORM with push-based workflow (not traditional migrations)
  - Local: `migration` service in `compose.yaml` runs `bun run db:push -- --force`
  - Production: `hook:deploy:start:before` in `disco.api.json` runs `bun run db:push -- --force`
- **Bootstrap SQL**: Single file in `apps/api/src/db/migrations/000-uuidv7.sql` creates UUIDv7 function
  - Runs on PostgreSQL init via docker-entrypoint-initdb.d volume mount
  - Only contains the custom UUIDv7() function definition
- **Schema Definitions**: Drizzle schemas in `apps/api/src/db/schema/`
  - `auth.schema.ts` - Better Auth tables
  - `node.schema.ts` - Node tracking table
  - `command.schema.ts` - Command queue table
- Uses UUIDv7 for all primary keys
- Node statuses: idle, busy, inactive
- Scheduler marks nodes inactive after timeout

### Node Orchestration
- CLI connects as a "node" with user_id association via `/kaja/nodes/connect`
- Sends heartbeats via `/kaja/nodes/:id/heartbeat` to maintain active status
- Can gracefully disconnect via `/kaja/nodes/:id/disconnect`
- SchedulerService (in API) marks nodes inactive if heartbeat missed
- Real-time updates via Server-Sent Events at `/kaja/nodes/:id/stream`
- Admin can send commands to nodes via `/kaja/admin/command`
- Tracks geo_location, status, last_seen timestamps

## Environment Configuration

### API (.env.example)
Required for development and production:
- `CORS_ORIGIN` - Allowed origin for CORS (e.g., `http://localhost:3000` or `https://kaja.io`)
- `DATABASE_URL` - PostgreSQL connection string
- `BETTER_AUTH_URL` - API base URL for Better Auth callbacks (e.g., `http://localhost:3001`)
- `BETTER_AUTH_SECRET` - Secret for session encryption (generate with `openssl rand -base64 32`)
- `SMTP_HOST`, `SMTP_PORT` - SMTP server for emails
- `KAJA_APP_NAME=api` - App identifier for logging
- `KAJA_LOG_LEVEL` - Log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`)
- `NODE_ENV` - Environment mode (`development`, `production`)

Optional:
- `WEB_PUBLIC_URL` - Public URL for device authorization flow
- `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` - Global rate limiting config
- `AUTH_RATE_LIMIT_WINDOW_MS`, `AUTH_RATE_LIMIT_MAX` - Auth endpoint rate limiting

**Production Requirements:**
- Set `NODE_ENV=production` (disables pino-pretty, uses JSON logs)
- Set `KAJA_LOG_LEVEL=info` or `warn` (reduce log verbosity)
- Set `BETTER_AUTH_SECRET` to a strong random value
- Use real SMTP credentials (not MailDev)
- Configure `CORS_ORIGIN` to match your production domain

### Web (.env.example)
Required:
- `VITE_API_URL` - API base URL (e.g., `http://localhost:3001` or `https://api.kaja.io`)
- `VITE_APP_URL` - Web app URL (e.g., `http://localhost:3000`)
- `KAJA_APP_NAME=web` - App identifier for logging
- `KAJA_LOG_LEVEL=debug` - Log level for browser console

**Note:** Web uses Vite's `import.meta.env.MODE` instead of `NODE_ENV` for environment detection

### CLI (.env.example)
Required:
- `API_URL` - API base URL (resolution order: `--api-url` flag > `API_URL` env > config.json > default)
- `KAJA_APP_NAME=cli` - App identifier for logging
- `KAJA_LOG_LEVEL=info` - Log level for CLI
- `NODE_ENV=development` - Environment mode

### Compose File
- Located at `compose.yaml` (not docker-compose.yaml)
- Services: PostgreSQL, MailDev, API, Web
- PostgreSQL: localhost:5433 (testuser/testpass/testdb)
- MailDev: localhost:1080 (web), 1025 (SMTP)
- API: localhost:3001
- Web: localhost:3000

## Code Style

### Biome Configuration
- Line width: 120
- Double quotes, semicolons "asNeeded", arrow parens "asNeeded"
- No trailing commas, space indentation
- Organizes imports on save
- Located: `biome.jsonc`

### TypeScript
- ESNext target with bundler module resolution
- Strict mode enabled
- JSX: react-jsx
- Monorepo uses workspace protocol (workspace:*)

## Testing & CI

- Tests run with `bun run test` using both .env.example and .env
- CI workflow (`.github/workflows/ci.yaml`):
  - Runs Biome lint/format checks
  - Runs tests with PostgreSQL service
- Additional workflow for CLI builds

## Import Aliases
- API: `#/*` maps to `src/`
- Web: `#/*` maps to `src/`
- All packages export from their root index.ts

## Key Dependencies
- **Bun**: Runtime and package manager (v1.3.11+)
- **Hono**: API framework
- **Better Auth**: Authentication with device flow
- **TanStack Start**: Full-stack React framework
- **Zod v4**: Schema validation
- **Biome**: Linting and formatting
- **Pino**: Structured logging
- Lockfile is bun.lock (not bun.lockb)