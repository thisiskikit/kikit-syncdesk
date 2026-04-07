# Current Status

- Snapshot date: 2026-04-03
- Purpose: establish a baseline documentation snapshot from the current repository state.
- Verification scope: code inspection only.
- Verified files:
  - `package.json`
  - `client/src/App.tsx`
  - `server/index.ts`
  - `server/routes.ts`
  - `server/storage.ts`
  - `server/services/shared/work-data-db.ts`
  - `shared/schema.ts`
  - `server/application/naver/bulk-price/service.ts`
- Latest verified files for bulk-price preset persistence:
  - `client/src/features/naver/bulk-price/page.tsx`
  - `client/src/features/naver/bulk-price/state.ts`
  - `client/src/features/coupang/bulk-price/page.tsx`
  - `client/src/features/coupang/bulk-price/state.ts`
  - `server/routes/ui-state.ts`
  - `server/stores/work-data-ui-state-store.ts`
- Verified in the latest change:
  - `npm run check`
- Not run in this task:
  - `npm run test`
  - `npm run build`

## Current State

| Area | Current state | Basis | Notes |
| --- | --- | --- | --- |
| App shell | Active | `client/src/App.tsx` | Top navigation, workspace tabs, operations toaster, and route switching are wired. |
| NAVER workspace | Mostly active | `client/src/App.tsx` | Products, bulk price, orders, shipment, claims, inquiries, settlements, stats, seller info, and logs are connected. `Product Edit` and `Grouped Products` still render placeholder pages. |
| COUPANG workspace | Active | `client/src/App.tsx` | Connection, logistics, products, product edit, bulk price, library, control, orders, shipments, cancel/refunds, returns, exchanges, inquiries, coupons, settlements, rocket growth, and logs are connected. |
| Shared Draft / Runs engine | Active with mixed persistence | `client/src/App.tsx`, `server/storage.ts` | Catalog, drafts, runs, and field sync routes exist, but shared engine runtime storage is still in memory. |
| Settings / Operations | Active | `client/src/App.tsx`, `server/routes.ts` | Settings hub, channel connection settings, operation center, logs, and UI state APIs are mounted. |
| PostgreSQL-backed work data | Active when `DATABASE_URL` exists | `server/services/shared/work-data-db.ts`, `shared/schema.ts` | Settings, logs, shipment worksheets, field sync, library, and bulk price tables are provisioned here. |
| Bulk-price preset draft persistence | Active | `client/src/features/naver/bulk-price/page.tsx`, `client/src/features/coupang/bulk-price/page.tsx`, `server/stores/work-data-ui-state-store.ts` | NAVER and COUPANG bulk-price pages now persist selected preset IDs plus name/memo draft inputs through `ui_state_entries`, so page refreshes do not clear the template editor state. |

## Implementation Snapshot

- Frontend stack:
  - React 19
  - Vite 7
  - React Query 5
  - Wouter
- Backend stack:
  - Express 5
  - Node 22+
  - Drizzle ORM
  - `pg`
- Startup behavior:
  - resumes queued shared execution runs
  - recovers COUPANG bulk price runs
  - recovers NAVER bulk price runs
  - serves Vite in development and static assets in production
- Storage split:
  - `server/storage.ts` exports `storage` as `new IndexedMemoryStorage()` for catalog, draft, and execution flows
  - `server/storage.ts` also exports optional Drizzle `db` when `DATABASE_URL` exists
  - `server/services/shared/work-data-db.ts` creates and imports persistent work-data tables directly in PostgreSQL
- Bulk-price page UI persistence:
  - `useServerMenuState` writes through `/api/ui-state`
  - `naver.bulk-price.ui` now stores preset accordion state, preview filter state, selected preset IDs, and preset name/memo draft values
  - `coupang.bulk-price.ui` now stores preset accordion state, preview filter state, selected preset IDs, and preset name/memo draft values
  - preset selections are cleared only after the preset list query confirms the saved preset no longer exists
- NAVER bulk price preview behavior:
  - preview sessions and refresh jobs are kept in memory
  - preview cache TTL defaults to 5 minutes
  - refresh job metadata TTL defaults to 10 minutes
  - successful price updates clear preview caches for the affected store

## Change Summary

- Change content:
  - kept the baseline snapshot and updated it to reflect persistent bulk-price preset draft state for NAVER and COUPANG
- Reason:
  - preset lists were already stored durably, but selected preset IDs and name/memo editor fields were local-only and appeared to reset after refresh
- Impact scope:
  - UI persistence behavior changed for NAVER and COUPANG bulk-price preset editors
  - no new API endpoints or DB tables were added

## Remaining Issues

- Shared draft and execution flows still run on in-memory storage even though matching schema definitions exist in `shared/schema.ts`.
- Work-data schema setup is partly managed by imperative SQL in `server/services/shared/work-data-db.ts`, so schema ownership is split between Drizzle definitions and runtime table bootstrap.
- NAVER bulk price preview sessions are not persisted across server restarts and can expire after the cache TTL window.
- `client/src/App.tsx` still contains placeholder routes for some NAVER features, so workspace completeness is uneven.
- `추정`: preset selection and name/memo are now durable across refreshes, but this task did not run an end-to-end browser verification for the actual screen flow.

## Next Work

- Keep this file updated whenever code changes land.
- Run a browser-level verification on NAVER and COUPANG bulk-price pages to confirm preset selection/name/memo survive refresh and tab re-entry as intended.
- If shared draft or execution persistence moves from memory to PostgreSQL, record that change in:
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
  - `docs/decisions/`
- Add runtime verification notes after the next task that actually runs `check`, `test`, or `build`.
