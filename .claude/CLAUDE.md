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
bun test              # Runs tests with both .env.example and .env
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
- CLI initiates device auth flow with KAJA_CLI_CLIENT_ID constant (from @kaja/schemas)
- User approves device via web `/device` route
- CLI polls API for token approval
- Supports email/password, email verification, password reset, and admin roles
- Session cookies prefixed with "kaja"

### API Structure (`apps/api/src/`)
- **Entry**: `core/server.ts` starts Hono app and SchedulerService
- **App**: `app.ts` defines routes and middleware
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
- **Core**: `core/db.ts` (PostgreSQL pool), `core/logger.ts` (Pino)
- **Emails**: React Email templates sent via nodemailer

### Web Structure (`apps/web/src/`)
- TanStack Router with file-based routing
- Two route layouts: `_public.tsx` and `_admin.tsx`
- Uses `#/*` import alias for src/
- Auth client from Better Auth in `hooks/auth-client.ts`
- Components organized: layout/, form/, ui/

### CLI Structure (`apps/cli/`)
- Entry: `src/cli.tsx` - initializes auth session and node operations
- `lib/kaja-sdk.ts` - API client for node heartbeat and status
- `lib/config.ts` - Configuration management using env-paths
- `lib/token.ts` - Token storage and retrieval
- `ui/` - React Ink components for interactive CLI

### Mobile Structure (`apps/mobile/`)
- Expo SDK v56 with React Native 0.85
- File-based routing via expo-router
- Uses Expo UI and Expo Glass Effect for native UI components
- React 19 with react-native-reanimated for animations
- Development scripts: start, android, ios, web
- See `apps/mobile/AGENTS.md` for Expo-specific guidance

### Packages
- **@kaja/schemas**: Zod schemas shared across workspaces (includes KAJA_CLI_CLIENT_ID)
- **@kaja/shared**: Pure utility functions (clsx, tailwind-merge)
- **@kaja/geo**: Geolocation services using MaxMind
- **@kaja/logger**: Pino logger with node/browser exports

### Database
- PostgreSQL migrations in `apps/api/migrations/`
- Runs migrations on container init via docker-entrypoint-initdb.d
- Uses UUIDv7 for IDs (custom function)
- Better Auth tables + custom "node" table
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
- PORT, CORS_ORIGIN, DATABASE_URL, BETTER_AUTH_URL
- SMTP settings for MailDev (or real SMTP)
- BETTER_AUTH_SECRET (generate with `openssl rand -base64 32`)
- Optional: WEB_PUBLIC_URL, CROSS_PARENT_DOMAIN for subdomain cookies

### CLI (.env.example)
- API_URL - resolution order: --api-url flag > API_URL env > config.json > default

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

- Tests run with `bun test` using both .env.example and .env
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
