# Structure Overview

- Snapshot date: 2026-04-03
- Reason for this document:
  - establish a current, code-backed overview of structure, data flow, API surface, DB usage, and UI routing
- Verification scope:
  - code inspection only
- Verified sources:
  - `client/src/App.tsx`
  - `server/index.ts`
  - `server/routes.ts`
  - `server/storage.ts`
  - `server/services/shared/work-data-db.ts`
  - `shared/schema.ts`
  - `server/application/naver/bulk-price/service.ts`

## 1. Top-Level Layout

```text
client/
  src/
    App.tsx
    pages/
    features/
    components/
    lib/

server/
  index.ts
  routes.ts
  routes/
  application/
  services/
  adapters/

shared/
  schema.ts
  ...shared API/data contracts

script/
  build and utility scripts

docs/
  architecture/
  deployment/
  current-status.md
  change-log.md
  structure-overview.md
```

## 2. Frontend Structure

- App entry:
  - `client/src/App.tsx`
  - wraps the app with `QueryClientProvider`, `OperationProvider`, `AppErrorBoundary`, and `WorkspaceTabsProvider`
- Main UI layout:
  - top navigation: Dashboard, NAVER, COUPANG, Draft / Runs, Settings, Work Center
  - workspace tabs: multiple route tabs managed in-app
  - operation toaster: shows queued/running work status
- Route groups:
  - `/dashboard`
  - `/naver/*`
  - `/coupang/*`
  - `/engine/*`
  - `/settings`
  - `/operations`
- Current UI behavior:
  - NAVER and COUPANG each render their own section layout and local navigation
  - shared engine routes handle catalog, drafts, runs, and field sync
  - some NAVER routes still intentionally render placeholders instead of completed feature pages

## 3. Backend Structure

- Server bootstrap:
  - `server/index.ts`
  - loads env, applies JSON and URL-encoded body parsing, enables CORS, logs API request timing, mounts routes, normalizes errors, and starts HTTP server
- Startup recovery:
  - `resumeQueuedRuns()`
  - `recoverBulkPriceRuns()`
  - `recoverNaverBulkPriceRuns()`
- API mount registry:
  - `server/routes.ts`
  - central mount point for all Express routers

### Mounted API Areas

| Prefix | Mounted routers |
| --- | --- |
| `/api/catalog` | `catalog`, `sync` |
| `/api/coupang` | `coupang-bulk-price`, `coupang`, `coupang-promotions`, `coupang-support` |
| `/api/drafts` | `drafts` |
| `/api/executions` | `executions` |
| `/api/health` | `health` |
| `/api/logs` | `logs` |
| `/api/naver` | `naver-bulk-price`, `naver-claims`, `naver-inquiries`, `naver-products`, `naver-orders`, `naver-seller`, `naver-settlements`, `naver-stats` |
| `/api/operations` | `operations` |
| `/api/field-sync` | `platform-field-sync` |
| `/api/product-library` | `product-library` |
| `/api/settings` | `settings` |
| `/api/ui-state` | `ui-state` |

### Current Layering

- Verified:
  - route mounting is centralized in `server/routes.ts`
  - the repository contains both `server/application/*` and `server/services/*`
  - bulk price logic includes newer application-layer modules such as `server/application/naver/bulk-price/service.ts`
- `추정`:
  - the codebase is in a hybrid state where some domains are being moved from legacy service-centered structure toward clearer application/domain boundaries

## 4. Data and Persistence Structure

- Shared schema source:
  - `shared/schema.ts`
- Optional PostgreSQL connection:
  - `server/storage.ts` creates `db` only when `DATABASE_URL` exists
- Shared engine runtime storage:
  - `server/storage.ts` exports `storage` as `new IndexedMemoryStorage()`
  - this currently backs catalog, draft, and execution flows in memory
- Persistent work-data bootstrap:
  - `server/services/shared/work-data-db.ts`
  - creates required tables with SQL and supports one-time legacy imports

### Persistent Table Groups Present in `shared/schema.ts`

- Channel control:
  - `channel_products`
  - `channel_options`
  - `sku_channel_mappings`
  - `catalog_sync_runs`
  - `control_drafts`
  - `control_draft_items`
  - `execution_runs`
  - `execution_items`
- Product library:
  - `product_library_records`
  - `product_library_attachments`
- Store settings:
  - `channel_store_settings`
  - `coupang_store_settings`
- COUPANG shipment:
  - `coupang_shipment_sheets`
  - `coupang_shipment_rows`
- UI/cache:
  - `ui_state_entries`
  - `coupang_product_explorer_cache_entries`
  - `coupang_product_detail_cache_entries`
  - `naver_product_cache_entries`
  - `naver_product_seller_barcode_cache_entries`
  - `naver_product_memo_entries`
- Bulk price:
  - NAVER preset, run, run item, latest record tables
  - COUPANG preset, run, run item, latest record tables
- Logs and orchestration:
  - `operation_logs`
  - `event_logs`
  - `platform_field_sync_rules`
  - `platform_field_sync_runs`
  - `storage_imports`

## 5. Key Data Flows

### Request and UI Flow

1. React pages issue queries and mutations through React Query.
2. Requests hit Express routers mounted in `server/routes.ts`.
3. Route modules delegate to service/application logic.
4. Logic reads or writes one or more of:
   - external channel APIs
   - PostgreSQL work-data tables
   - in-memory shared engine storage
   - file-based legacy imports or caches
   - `/api/ui-state` backed page state for persisted filters, section state, and bulk-price preset draft fields
5. Responses return to the page and update the workspace view.

### Bulk-Price Preset Draft Persistence Flow

1. NAVER and COUPANG bulk-price pages load `MenuState` and `UiState` through `useServerMenuState`.
2. Source/rule form values continue to live in `naver.bulk-price` or `coupang.bulk-price`.
3. Preset accordion state, preview filter state, selected preset IDs, and preset name/memo draft fields now live in `naver.bulk-price.ui` or `coupang.bulk-price.ui`.
4. `useServerMenuState` writes those objects to `/api/ui-state`, which persists them in `ui_state_entries`.
5. The pages only clear a selected preset after the preset list query succeeds and the preset is confirmed missing, preventing refresh-time false resets while the list is still loading.

### Startup and Recovery Flow

1. The server boots through `server/index.ts`.
2. Recovery routines resume queued or interrupted work before serving traffic.
3. Development mode attaches Vite middleware.
4. Production mode serves built static assets unless disabled.

### NAVER Bulk Price Preview Flow

1. A refresh job is created for the current source config and rule set.
2. Preview rows are generated in the background and cached in memory.
3. The UI polls preview refresh jobs and then loads the cached preview by `previewId`.
4. Preview sessions expire after the preview cache TTL.
5. Successful price updates clear preview caches for the affected store.

### Shared Draft / Runs Flow

1. Catalog data is prepared through shared catalog endpoints.
2. Drafts and draft items are created and validated.
3. Execution runs are queued and resumed on startup if needed.
4. `추정`: because runtime storage is still in memory, these shared flows are not yet fully durable across process restarts.

## 6. Operational Constraints

- `DATABASE_URL` is required for persistent work-data features.
- Request body limit defaults to `5mb` unless overridden.
- API request timing and startup events are logged from the server bootstrap path.
- NAVER bulk price preview cache is intentionally ephemeral.
- Bulk-price preset editor durability depends on the `/api/ui-state` route and `ui_state_entries` persistence rather than dedicated preset-draft tables.

## 7. Change Summary

- Change content:
  - updated the structure snapshot to reflect durable bulk-price preset editor state in the shared UI-state persistence flow
- Reason:
  - the latest code change altered UI persistence behavior and data flow for bulk-price preset editors
- Impact scope:
  - documentation only in this file
  - describes a real UI persistence behavior change now present in code

## 8. Remaining Issues

- Shared engine persistence does not yet match the PostgreSQL-oriented schema footprint.
- Work-data table creation is runtime-driven instead of migration-driven only.
- Some UI modules are still placeholders, so route presence does not always mean feature completeness.
- `추정`: this overview reflects code and type-check results, but the exact bulk-price refresh UX was not validated in a live browser during this task.

## 9. Next Work

- Update this file whenever one of the following changes:
  - folder/module responsibilities
  - request/data flow
  - API mount points or endpoint ownership
  - database table usage
  - UI route behavior
- When a structural decision is made, add a matching record under `docs/decisions/`.
