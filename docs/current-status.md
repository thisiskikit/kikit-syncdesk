# Current Status

- Snapshot date: 2026-04-09
- Purpose: establish a baseline documentation snapshot from the current repository state.
- Verification scope: code inspection and targeted validation.
- Verified files:
  - `package.json`
  - `client/src/App.tsx`
  - `client/src/components/operation-toaster.tsx`
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/products/page.tsx`
  - `client/src/features/coupang/products/product-presenters.tsx`
  - `client/src/lib/coupang-navigation.ts`
  - `client/src/lib/coupang-navigation.test.ts`
  - `client/src/lib/operation-links.ts`
  - `server/http/coupang/parsers.ts`
  - `server/http/handlers/coupang/shipments.ts`
  - `server/index.ts`
  - `server/routes.ts`
  - `server/routes/coupang/shipments.ts`
  - `server/routes/coupang/products.ts`
  - `server/storage.ts`
  - `server/services/coupang/shipment-worksheet-view.ts`
  - `server/services/coupang/shipment-worksheet-view.test.ts`
  - `server/services/shared/work-data-db.ts`
  - `shared/schema.ts`
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
  - `npx vitest run client/src/lib/coupang-navigation.test.ts`
  - `npx vitest run --root . server/services/coupang/shipment-worksheet-view.test.ts server/services/coupang/shipment-worksheet-collection.test.ts`
- Verified in the previous claim-aware change:
  - `npm run check`
  - `npx vitest run client/src/lib/coupang-customer-service.test.ts`
  - `npx vitest run client/src/lib/coupang-shipment-quick-filters.test.ts`
  - `npx vitest run --root . server/services/coupang/order-service.test.ts server/services/coupang/shipment-worksheet-collection.test.ts`
  - `npx vitest run --root . server/services/coupang/shipment-worksheet-detail.test.ts`
- Not run in this task:
  - `npm run test`
  - `npm run build`
  - browser-level manual verification

## Current State

| Area | Current state | Basis | Notes |
| --- | --- | --- | --- |
| App shell | Active | `client/src/App.tsx` | Top navigation, workspace tabs, operations toaster, and route switching are wired. |
| NAVER workspace | Active with disabled product-edit and bulk-price routes | `client/src/App.tsx` | Products, control, orders, shipment, claims, inquiries, settlements, stats, seller info, and logs are connected. `/naver/bulk-price` and `/naver/product-edit` now redirect to `/naver/products`. `Grouped Products` still renders a placeholder page. |
| COUPANG workspace | Active with shipment-first primary navigation and disabled product-edit / bulk-price routes | `client/src/App.tsx`, `client/src/lib/coupang-navigation.ts` | `Shipment / Dispatch` is now the primary operational entry in the top navigation. `/coupang/orders` remains directly reachable by URL, but `Orders / Outbound` is no longer shown in the main Coupang menu. `/coupang/product-edit` and `/coupang/bulk-price` redirect to `/coupang/products`. |
| COUPANG claim-aware order and shipment blocking | Active | `client/src/pages/coupang-orders.tsx`, `client/src/features/coupang/shipments/page.tsx`, `server/services/coupang/customer-service-issues.ts`, `server/services/coupang/shipment-worksheet-service.ts` | Orders load CS/claim data by default, shipment-stop requested and shipment-stop completed states are surfaced in shared status helpers, stale worksheet claim state is refreshed on read, and claim-bearing rows are excluded from preparing and invoice transmission actions. |
| Shared Draft / Runs engine | Active with mixed persistence | `client/src/App.tsx`, `server/storage.ts` | Catalog, drafts, runs, and field sync routes exist, but shared engine runtime storage is still in memory. |
| Settings / Operations | Active | `client/src/App.tsx`, `server/routes.ts`, `client/src/components/operation-toaster.tsx` | Settings hub, channel connection settings, operation center, logs, and UI state APIs are mounted. The operation toaster now only shows generic operations and no longer polls bulk-price run state. |
| PostgreSQL-backed work data | Active when `DATABASE_URL` exists | `server/services/shared/work-data-db.ts`, `shared/schema.ts` | Settings, logs, shipment worksheets, field sync, library, and legacy bulk-price tables are provisioned here. Bulk-price tables still exist in schema, but their runtime routes are disabled. |
| Product edit / bulk price runtime surface | Disabled | `client/src/App.tsx`, `server/routes.ts`, `server/index.ts`, `server/routes/coupang/products.ts` | NAVER/COUPANG bulk-price pages are no longer reachable through the live app, startup no longer recovers bulk-price runs, bulk-price API routers are no longer mounted, and dedicated COUPANG `/partial` and `/full` product edit routes are removed from the live API surface. |
| COUPANG shipment worksheet view | Active with server-driven scope, counts, pagination, and bulk resolution | `server/routes/coupang/shipments.ts`, `server/services/coupang/shipment-worksheet-service.ts`, `server/services/coupang/shipment-worksheet-view.ts`, `client/src/features/coupang/shipments/page.tsx` | The shipment page now reads `GET /api/coupang/shipments/worksheet/view` instead of loading the full worksheet into the browser, defaults to the `dispatch_active` scope, and resolves bulk invoice/download targets on the server. Claim rows remain stored but are hidden from the default scope. |

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
  - serves Vite in development and static assets in production
- Storage split:
  - `server/storage.ts` exports `storage` as `new IndexedMemoryStorage()` for catalog, draft, and execution flows
  - `server/storage.ts` also exports optional Drizzle `db` when `DATABASE_URL` exists
  - `server/services/shared/work-data-db.ts` creates and imports persistent work-data tables directly in PostgreSQL
- Disabled product edit / bulk price runtime behavior:
  - `/naver/bulk-price`, `/naver/product-edit`, `/coupang/bulk-price`, and `/coupang/product-edit` redirect to the main product pages
  - `/api/coupang/bulk-price/*` and `/api/naver/bulk-price/*` are no longer mounted from `server/routes.ts`
  - startup no longer runs COUPANG or NAVER bulk-price recovery
  - the shared operation toaster no longer polls bulk-price runs or preview refresh jobs
  - COUPANG product quick actions still support price, stock, and sale-status changes, but no longer call the dedicated `/api/coupang/products/partial` or `/api/coupang/products/full` edit routes
- COUPANG claim-aware orders and shipments:
  - order-sheet lookup now sends Seoul date-with-offset values (`yyyy-MM-dd+09:00`) because the Coupang `ordersheets` API rejects timestamp-style `createdAtFrom/To` values; shipment collection now keeps the selected date range without switching formats mid-request
  - aggregate order-sheet lookup without an explicit status now fetches statuses serially instead of fan-out parallel requests, and retryable per-status failures are retried once before being reported as partial failures
  - `GET /api/coupang/orders` requests customer-service lookup by default
  - shipment-stop requested and shipment-stop completed claim types are tracked alongside cancel, return, and exchange in `customerServiceIssueBreakdown`
  - completed cancel rows can be classified by `completeConfirmDate`, `completeConfirmType`, `releaseStatus`, `releaseStatusName`, and `status` signals
  - shipment worksheet reads force a fresh claim lookup even for recently `ready` rows so the list can surface newly arrived claims before the user opens detail
  - shipment worksheet quick collect fetches live return/exchange claims and can add claim-only rows that no longer appear in the active order list
- shipment worksheet `빠른 수집` now runs in a `new_only` mode that rechecks the selected date range, fetches `ACCEPT` and `INSTRUCT` as required statuses, and only inserts rows not already present in the worksheet; the previous overlap-based incremental merge remains available as `전체 재수집`
- shipment worksheet `빠른 수집` no longer auto-runs `markPreparing`, so newly collected `결제완료(ACCEPT)` orders remain visible instead of being immediately pushed to `상품준비중`
- shipment worksheet now exposes a `결제완료 -> 발송준비중` action beside `빠른 수집`; it resolves the current shipment view on the server, excludes claim rows, and sends only eligible `markPreparing` targets to the Coupang prepare-order API
- shipment worksheet `빠른 수집` now records a Coupang channel error log with the failed status, date range, and store context whenever a required status lookup such as `ACCEPT` or `INSTRUCT` fails
- shipment worksheet collect requests now create a tracked Coupang shipment operation immediately when `빠른 수집`, `전체 재수집`, or `전체 재동기화` starts, so operators can inspect running/failed collection attempts even when the request ends early before a status-specific error event is written
- shipment page collection requests now preserve the user-selected `createdAtFrom ~ createdAtTo` values instead of forcing `createdAtTo` back to the current date on the client
  - shipment worksheet detail responses synthesize claim summary fields from live return/exchange lookups so the detail status box can override the base order status immediately when the popup confirms a claim
  - orders with detected claims are excluded from `markPreparing`, and shipment rows with detected claims are excluded from invoice transmission
  - shipment worksheet Excel downloads exclude claim-bearing rows so only order rows are exported and marked as printed
  - the shipment worksheet UI now uses server-provided scope counts, card counts, filtered totals, and page slices instead of recomputing those values over the full worksheet array in the browser
  - the default shipment worksheet scope is `dispatch_active`, which shows non-claim rows that are still unprinted, plus regular `ACCEPT` and `INSTRUCT` work items
  - claim rows stay available under the dedicated `claims` scope, and exported post-shipment rows stay available under `post_dispatch`

## Change Summary

- Change content:
  - updated the runtime snapshot to reflect disabled NAVER/COUPANG bulk-price workspaces and disabled COUPANG dedicated product editing routes
  - kept the existing COUPANG claim-aware order and shipment snapshot
- Reason:
  - the bulk-price and dedicated product-info editing features are being taken out of this repository's live runtime surface for now
  - COUPANG operators still need earlier visibility for shipment-stop, cancel, return, and exchange claims before executing preparing or invoice actions
- Impact scope:
  - NAVER and COUPANG app routing behavior
  - COUPANG product-edit write API surface
  - operation status panel behavior
  - COUPANG order status display, worksheet read behavior, and action eligibility
  - no new API endpoints or DB tables were added

## Remaining Issues

- Shared draft and execution flows still run on in-memory storage even though matching schema definitions exist in `shared/schema.ts`.
- Work-data schema setup is partly managed by imperative SQL in `server/services/shared/work-data-db.ts`, so schema ownership is split between Drizzle definitions and runtime table bootstrap.
- Bulk-price and dedicated product-edit implementation files still exist in the repository for later extraction, even though the runtime routes and pages are disabled.
- `client/src/App.tsx` still contains placeholder routes for some NAVER features, so workspace completeness is uneven.
- This task did not run an end-to-end browser verification for the disabled-route redirects or the COUPANG products page quick-action flow.

## Next Work

- Keep this file updated whenever code changes land.
- If these features move into another repository, decide whether to fully delete the remaining dormant bulk-price and product-edit implementation files here or keep them until the migration is complete.
- If shared draft or execution persistence moves from memory to PostgreSQL, record that change in:
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
  - `docs/decisions/`
- Add runtime verification notes after the next task that actually runs `check`, `test`, or `build`.
