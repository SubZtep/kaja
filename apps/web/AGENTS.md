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
    _public.tsx                   # public shell
    _public/_landing/             # marketing pages + signin/signup
    _public/(auth)/               # device auth, reset-password
    _admin.tsx                    # admin shell (auth-gated)
    _admin/dashboard|nodes|users|profile
  components/                     # layout, form, ui, Providers
  hooks/                          # auth-client, use-api-sdk, user
  lib/                            # query client, loaders, session, form helpers
  styles.css
public/                           # favicons, install scripts, PWA bits
```

Import alias: `#/*` → `./src/*`

## Conventions

- **Data**: React Query + `@kaja/sdk` via `useApiSdk()` from Providers (SDK token from Better Auth session)
- **Auth**: Better Auth client in `hooks/auth-client.ts`; session cookies to API; device approval under `/device`
- **Forms**: TanStack Form patterns in `lib/form*.ts` and `components/form/`
- **Styling**: Tailwind v4 + `cn()` from `@kaja/shared`
- **UI**: Base UI React, lucide icons, react-toastify
- Match existing route file naming (`$userId`, `-components` for colocation)
- Components: `layout/`, `form/`, `ui/` under `src/components/`

## Generated files

`src/routeTree.gen.ts` is produced by the router plugin. Prefer not hand-editing.  
Root `biome.json` currently has a typo (`apps/weeb` instead of `apps/web`), so Biome may flag this file until the ignore is fixed.

## Env

`.env.example`: `VITE_API_URL`, `VITE_APP_URL`, `KAJA_APP_NAME`, `KAJA_LOG_LEVEL`.  
Vite uses `import.meta.env.MODE` (not `NODE_ENV`) for browser environment detection in the logger.

## Boundaries

- Do not add a second API client; extend `@kaja/sdk` if new endpoints are needed
- Keep admin and public route trees separate
- Ask before large landing-page redesigns
