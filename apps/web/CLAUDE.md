# @kaja/web

TanStack Start + Vite frontend: public landing site and authenticated admin portal.

## Commands

```bash
bun run --filter @kaja/web dev      # http://localhost:3000
bun run --filter @kaja/web build
bun run --filter @kaja/web preview
```

No UI tests yet (the `test` script is a no-op); `src/lib/*.test.ts` unit tests run with the root `bun test`.

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
      device.tsx + device/        # device code approval: index, approve, done
      -components/                # landing sections + auth chrome
    _admin.tsx                    # private shell (auth-gated; same max-w-280 + sticky header pattern)
    _admin/
      dashboard.tsx + dashboard/  # tab layout: overview (index), stats
      agent.tsx + agent/          # tab layout: widget, sandbox (/agent redirects to widget)
      profile
      admin.tsx + admin/          # admin-only layout (role guard, tab nav): dashboard, users, models
  components/
    Providers.tsx, LocaleSync.tsx
    layout/  SiteShell, SiteHeader, ContentWidth, BrandMark, SignOutButton, nav-items (one static menu for everyone, plus each section's tabs), SectionTabs (a section's tab bar)
    ui/      Section, PageHeader, Table, ValueBox, DialogShell, ...
    form/    TanStack Form fields
    abilities/ sandbox/ stats/ user/   # feature components
  hooks/ lib/ styles.css
messages/    # Paraglide messages (en-GB.json is the source; see Translations in the root CLAUDE.md)
public/      favicons, install scripts, PWA bits
```

Abilities: every one is on for everyone, and personas pick what a chat uses, so the web has no ability list. Profile → API keys (`components/abilities/ApiKeys.tsx`) lists the keyed abilities some persona uses from `GET /abilities/me`, with `KeyDialog` (saves the key write-only via `PUT /abilities/me/keys/{name}` and shows the server's check) and Remove; queries live in `components/abilities/queries.ts`. Admins get the marketplace sync panel on `/admin/dashboard` (`MarketplaceSection`). The widget page's persona list comes from `/nasi/personas` (the whole catalog, default first); the persona's `abilities` decide a widget's skills.

Shared layout primitives: `SiteShell` + `SiteHeader` + `BrandMark` + `ContentWidth`.
Cards/titles: `Section`, `PageHeader` (admin).

## Conventions

- **Data**: React Query from Providers (SDK token from Better Auth session)
- **Auth**: Better Auth client in `hooks/auth-client.ts`; session cookies to API; device approval under `/device`
- **Forms**: TanStack Form patterns in `lib/form*.ts` and `components/form/`
- **Styling**: Tailwind v4 + `cn()` from `@kaja/shared/ui`
- **UI**: Base UI React, lucide icons, react-toastify
- Match existing route file naming (`$userId`, `-components` for colocation)
- Components: `layout/`, `form/`, `ui/` under `src/components/`

## Generated files

`src/routeTree.gen.ts` is produced by the router plugin. Prefer not hand-editing.

## Env

`.env.example` (generated from `packages/schema/env/web.ts`): `VITE_API_URL`, `API_URL` (server-to-server), `SSR_SECRET`, `VITE_APP_URL`, the landing demo's widget keys, `VITE_TURNSTILE_SITE_KEY`, `SENTRY_AUTH_TOKEN`.  
Failures worth knowing about go to Sentry (`Sentry.captureException`); user-facing ones already show a toast. There is no logger package.

## Boundaries

- Keep admin and public route trees separate
- Ask before large landing-page redesigns
