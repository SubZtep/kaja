# @kaja/web

TanStack Start + Vite frontend: public landing site and authenticated admin portal.

## Commands

```bash
bun run --filter @kaja/web dev      # http://localhost:3000
bun run --filter @kaja/web build
bun run --filter @kaja/web preview
```

No automated UI tests yet (`test` script is a no-op).

## Layout

```
src/
  router.tsx / routeTree.gen.ts   # TanStack Router (gen file is auto-updated)
  routes/
    __root.tsx
    _public.tsx                   # public shell (Header + Footer)
    _public/
      index.tsx                   # landing (/)
      signin|signup|reset-password
      device/                     # device code approval
      -components/                # landing sections + auth chrome
    _admin.tsx                    # private shell (auth-gated; same max-w-280 + sticky header pattern)
    _admin/
      -components/header.tsx      # admin nav (mirrors public Header)
      dashboard|users|profile|models|mcp-servers|widget|packages|skills (redirect)|welcome
  components/
    layout/  SiteShell, SiteHeader, ContentWidth, BrandMark, SignOutButton, nav-items
    ui/      Section, PageHeader, LandingSection, Table, ValueBox, ...
    form/ Providers
  hooks/ lib/ styles.css
public/      favicons, install scripts, PWA bits
```

Packages: `/packages` (every signed-in user; `?tab=skills|personas|tools`, `/skills` redirects there) and `/welcome` (right after signup, without the Personas tab) share `components/packages/PackageTabs.tsx` — `SkillCards` (toggle saved via `/packages/me`, instructions loaded on demand from `/packages/skill/{name}`), `PersonaCards` (label, when, instructions from the catalog; `default` is always on and not listed) and `ToolCards` (HTTP tools and MCP servers: host, key need, tools; one that requires a key opens `KeyDialog` first, which saves the key write-only and shows the server's check). Queries live in `components/packages/queries.ts`. Admins also get the marketplace sync panel on `/packages`. The widget page picks each key's own skills (`SkillChecklist`) and edits keys through `PATCH /widget/admin/{id}`; its persona list comes from `/nasi/personas` (the whole catalog, default first).

Shared layout primitives: `SiteShell` + `SiteHeader` + `BrandMark` + `ContentWidth`.
Cards/titles: `Section`, `PageHeader` (admin), `LandingSection` (public bands).

## Conventions

- **Data**: React Query from Providers (SDK token from Better Auth session)
- **Auth**: Better Auth client in `hooks/auth-client.ts`; session cookies to API; device approval under `/device`
- **Forms**: TanStack Form patterns in `lib/form*.ts` and `components/form/`
- **Styling**: Tailwind v4 + `cn()` from `@kaja/shared`
- **UI**: Base UI React, lucide icons, react-toastify
- Match existing route file naming (`$userId`, `-components` for colocation)
- Components: `layout/`, `form/`, `ui/` under `src/components/`

## Generated files

`src/routeTree.gen.ts` is produced by the router plugin. Prefer not hand-editing.

## Env

`.env.example`: `VITE_API_URL`, `VITE_APP_URL`, `KAJA_APP_NAME`, `KAJA_LOG_LEVEL`.  
Vite uses `import.meta.env.MODE` (not `NODE_ENV`) for browser environment detection in the logger.

## Boundaries

- Keep admin and public route trees separate
- Ask before large landing-page redesigns
