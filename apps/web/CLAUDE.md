# @kaja/web

- Dev server on http://localhost:3000. No UI tests; `tests/` (for `src/lib`) runs with the root `bun test`
- `routeTree.gen.ts` is generated
- Keep the portal (`_portal`, signed-in pages; the real admin pages live under `_portal/admin`) and public route trees separate; ask before large landing-page redesigns
- Every ability is on for everyone and personas pick, so the web has no ability list and users have no API keys; admins manage server-wide keys on `/admin/dashboard`
- Failures worth knowing go to `Sentry.captureException` (no logger); user-facing ones already show a toast
