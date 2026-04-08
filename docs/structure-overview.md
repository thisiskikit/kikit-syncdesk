# Structure Overview

- Snapshot date: 2026-04-08
- Reason for this document:
  - establish a current, code-backed overview of structure, data flow, API surface, DB usage, and UI routing
- Verification scope:
  - code inspection only
- Verified sources:
  - `client/src/App.tsx`
  - `client/src/components/operation-toaster.tsx`
  - `client/src/features/coupang/products/page.tsx`
  - `server/index.ts`
  - `server/routes.ts`
  - `server/routes/coupang/products.ts`
  - `server/storage.ts`
  - `server/services/shared/work-data-db.ts`
  - `shared/schema.ts`

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
  - operation toaster: shows queued/running work status for generic operations only
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
  - `/naver/bulk-price`, `/naver/product-edit`, `/coupang/bulk-price`, and `/coupang/product-edit` are currently disabled and redirect back to the main product pages

## 3. Backend Structure

- Server bootstrap:
  - `server/index.ts`
  - loads env, applies JSON and URL-encoded body parsing, enables CORS, logs API request timing, mounts routes, normalizes errors, and starts HTTP server
- Startup recovery:
  - `resumeQueuedRuns()`
- API mount registry:
  - `server/routes.ts`
  - central mount point for all Express routers

### Mounted API Areas

| Prefix | Mounted routers |
| --- | --- |
| `/api/catalog` | `catalog`, `sync` |
| `/api/coupang` | `coupang`, `coupang-promotions`, `coupang-support` |
| `/api/drafts` | `drafts` |
| `/api/executions` | `executions` |
| `/api/health` | `health` |
| `/api/logs` | `logs` |
| `/api/naver` | `naver-claims`, `naver-inquiries`, `naver-products`, `naver-orders`, `naver-seller`, `naver-settlements`, `naver-stats` |
| `/api/operations` | `operations` |
| `/api/field-sync` | `platform-field-sync` |
| `/api/product-library` | `product-library` |
| `/api/settings` | `settings` |
| `/api/ui-state` | `ui-state` |

### Current Layering

- Verified:
  - route mounting is centralized in `server/routes.ts`
  - the repository contains both `server/application/*` and `server/services/*`
  - some implementation areas such as bulk-price still exist on disk even when their runtime routes are disabled
- Note:
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
   - `/api/ui-state` backed page state for persisted filters and section state
5. Responses return to the page and update the workspace view.

### Startup and Recovery Flow

1. The server boots through `server/index.ts`.
2. Recovery routines resume queued or interrupted shared-engine work before serving traffic.
3. Development mode attaches Vite middleware.
4. Production mode serves built static assets unless disabled.

### Shared Draft / Runs Flow

1. Catalog data is prepared through shared catalog endpoints.
2. Drafts and draft items are created and validated.
3. Execution runs are queued and resumed on startup if needed.
4. Because runtime storage is still in memory, these shared flows are not yet fully durable across process restarts.

## 6. Operational Constraints

- `DATABASE_URL` is required for persistent work-data features.
- Request body limit defaults to `5mb` unless overridden.
- API request timing and startup events are logged from the server bootstrap path.
- Legacy bulk-price tables and services still exist in the repository, but the live runtime does not currently mount their routes.

## 7. Change Summary

- Change content:
  - updated the structure snapshot to reflect disabled bulk-price runtime routes and disabled dedicated COUPANG product-edit runtime paths
- Reason:
  - the latest code change removed these features from the active runtime surface while leaving source files available for later extraction
- Impact scope:
  - documentation only in this file
  - describes the runtime structure that is actually mounted today

## 8. Remaining Issues

- Shared engine persistence does not yet match the PostgreSQL-oriented schema footprint.
- Work-data table creation is runtime-driven instead of migration-driven only.
- Some UI modules are still placeholders, so route presence does not always mean feature completeness.
- Bulk-price and dedicated product-edit implementation files are still present on disk even though the app runtime does not expose them.

## 9. Next Work

- Update this file whenever one of the following changes:
  - folder/module responsibilities
  - request/data flow
  - API mount points or endpoint ownership
  - database table usage
  - UI route behavior
- When a structural decision is made, add a matching record under `docs/decisions/`.
