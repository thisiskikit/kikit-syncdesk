# Current Status

- Snapshot date: 2026-04-07
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
- Latest verified files for COUPANG claim-aware orders and shipments:
  - `shared/coupang.ts`
  - `server/http/handlers/coupang/orders.ts`
  - `server/services/coupang/customer-service-issues.ts`
  - `server/services/coupang/shipment-worksheet-service.ts`
  - `client/src/lib/coupang-customer-service.ts`
  - `client/src/lib/coupang-order-status.ts`
  - `client/src/lib/coupang-shipment-quick-filters.ts`
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/pages/coupang-orders.tsx`
- Verified in the latest change:
  - `npm run check`
  - `npx vitest run client/src/lib/coupang-customer-service.test.ts`
  - `npx vitest run client/src/lib/coupang-shipment-quick-filters.test.ts`
  - `npx vitest run --root . server/services/coupang/order-service.test.ts server/services/coupang/shipment-worksheet-collection.test.ts`
  - `npx vitest run --root . server/services/coupang/shipment-worksheet-detail.test.ts`
- Not run in this task:
  - `npm run test`
  - `npm run build`

## Current State

| Area | Current state | Basis | Notes |
| --- | --- | --- | --- |
| App shell | Active | `client/src/App.tsx` | Top navigation, workspace tabs, operations toaster, and route switching are wired. |
| NAVER workspace | Mostly active | `client/src/App.tsx` | Products, bulk price, orders, shipment, claims, inquiries, settlements, stats, seller info, and logs are connected. `Product Edit` and `Grouped Products` still render placeholder pages. |
| COUPANG workspace | Active | `client/src/App.tsx` | Connection, logistics, products, product edit, bulk price, library, control, orders, shipments, cancel/refunds, returns, exchanges, inquiries, coupons, settlements, rocket growth, and logs are connected. |
| COUPANG claim-aware order and shipment blocking | Active | `client/src/pages/coupang-orders.tsx`, `client/src/features/coupang/shipments/page.tsx`, `server/services/coupang/customer-service-issues.ts`, `server/services/coupang/shipment-worksheet-service.ts` | Orders now load CS/claim data by default, shipment-stop requested and shipment-stop completed states are surfaced in shared status helpers, stale worksheet claim state is refreshed on read, and claim-bearing rows are excluded from preparing and invoice transmission actions. |
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
- COUPANG claim-aware orders and shipments:
  - `GET /api/coupang/orders` now requests customer-service lookup by default instead of returning only unknown CS state
  - shipment-stop requested and shipment-stop completed claim types are tracked alongside cancel, return, and exchange in `customerServiceIssueBreakdown`
  - completed cancel rows can now be classified by `completeConfirmDate`, `completeConfirmType`, `releaseStatus`, `releaseStatusName`, and `status` signals instead of only the request-status set
  - shipment worksheet reads now force a fresh claim lookup even for recently `ready` rows, so the list can surface newly arrived return/cancel/shipment-stop claims before the user opens the detail popup
  - shipment worksheet detail responses now synthesize claim summary fields from live return/exchange lookups so the detail status box can override `상품준비중` immediately when the popup confirms a claim
  - the shipment page refetches the worksheet on mount and window refocus, and the shipment detail popup prefers detail-derived CS summary/state over persisted row values while patching the local worksheet cache so the list and popup stay aligned in the same session
  - orders with detected claims are excluded from `markPreparing`, and shipment rows with detected claims are excluded from invoice transmission
- NAVER bulk price preview behavior:
  - preview sessions and refresh jobs are kept in memory
  - preview cache TTL defaults to 5 minutes
  - refresh job metadata TTL defaults to 10 minutes
  - successful price updates clear preview caches for the affected store

## Change Summary

- Change content:
  - kept the baseline snapshot and updated it to reflect persistent bulk-price preset draft state for NAVER and COUPANG
  - added a new verified snapshot for COUPANG claim-aware order and shipment handling
- Reason:
  - preset lists were already stored durably, but selected preset IDs and name/memo editor fields were local-only and appeared to reset after refresh
  - COUPANG operators needed earlier visibility for shipment-stop, cancel, return, and exchange claims before executing preparing or invoice actions
- Impact scope:
  - UI persistence behavior changed for NAVER and COUPANG bulk-price preset editors
  - COUPANG order status display, worksheet read behavior, and action eligibility now depend on claim-aware CS lookup
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
