# @kaja/web

TanStack Start + Vite frontend: public landing site and authenticated admin portal.

## Commands

```bash
bun run --filter @kaja/web dev      # http://localhost:3000
bun run --filter @kaja/web build
```

No UI tests yet (the `test` script is a no-op); `src/lib/*.test.ts` unit tests run with the root `bun test`.

## Layout

```
src/
  router.tsx / routeTree.gen.ts   # TanStack Router (gen file is auto-updated, don't hand-edit)
  routes/
    _public.tsx + _public/        # public shell (Header + Footer): landing, signin|signup, device/ (code approval), -components/
    _admin.tsx + _admin/          # private shell (auth-gated): dashboard/ (overview, stats), agent/ (widget, sandbox tabs), profile, admin/ (admin-only layout with role guard: dashboard, users, models)
  components/                     # layout/ (SiteShell, SiteHeader, ContentWidth, BrandMark, nav-items, SectionTabs), ui/ (Section, PageHeader, Table, …), form/ (TanStack Form fields), abilities/ sandbox/ stats/ user/
  hooks/ lib/ styles.css
messages/    # Paraglide messages (en-GB.json is the source; see the root CLAUDE.md)
public/      favicons, install scripts, PWA bits
```

Sign-in and sign-up are passwordless: email → emailed code (`components/form/CodeForm.tsx`, also the profile's email change), or Google.

Abilities: every one is on for everyone and personas pick what a chat uses, so the web has no ability list and users have no API keys. Admins get the marketplace sync panel and the server-wide Service keys on `/admin/dashboard` (`MarketplaceSection`): `components/abilities/ApiKeys.tsx` lists the keyed abilities from `GET /admin/abilities/keys`, with `KeyDialog` (write-only `PUT /admin/abilities/keys/{name}`, shows the server's check) and Remove; queries are in `components/abilities/queries.ts`. The widget page's persona list comes from `/nasi/personas` (default first); the persona's `abilities` decide a widget's skills.

## Conventions

- **Data**: React Query from Providers (SDK token from the Better Auth session)
- **Auth**: Better Auth client in `hooks/auth-client.ts`; session cookies to the API
- **Forms**: TanStack Form patterns in `lib/form*.ts` and `components/form/`
- **Styling**: Tailwind v4 + `cn()` from `@kaja/shared/ui`; **UI**: Base UI React, lucide icons, react-toastify
- Match existing route file naming (`$userId`, `-components` for colocation)
- Keep admin and public route trees separate; ask before large landing-page redesigns

## Env

`.env.example` is generated from `packages/schema/env/web.ts`. There is no logger package: failures worth knowing about go to Sentry (`Sentry.captureException`), and user-facing ones already show a toast.
