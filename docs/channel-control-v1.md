# Channel Control v1 Design Summary

## Goal

- Query Naver Smart Store and Coupang products/options from one admin tool.
- Map channel items by internal `master_sku` and `option_sku`.
- Control price, stock, sale state through `draft -> validation -> execution`.
- Keep `sold_out` and `sale_stopped` as separate states.
- Allow partial success, preserve snapshots, and retry failed items only.

## Domain Boundaries

- Product listing: local option-level read model for search and preview.
- Channel sync: adapters normalize channel payloads into local catalog records.
- Drafts: manual selection and CSV upload become draft items.
- Execution logs: run/item result history, errors, and snapshots.
- Channel adapters: Naver and Coupang share the same `ChannelAdapter` contract.

## Current Initial Implementation

- Runtime storage currently uses an in-memory fallback so the app runs without PostgreSQL.
- `shared/schema.ts` already defines Drizzle/Postgres tables for the later persistence step.
- Naver/Coupang adapters are mocked but support sync, snapshot, partial failure, and retry flow verification.
- External master SKU lookup is abstracted behind `server/integrations/master-sku.ts` and currently uses fallback sample data.

## State Model

- `sale_status`: `on_sale` | `sale_stopped`
- `sold_out_status`: `in_stock` | `sold_out`
- `requested_patch_json`: requested control change
- `before_snapshot_json`: live snapshot before execution
- `validation_status`: `pending` | `valid` | `invalid`
- `execution item status`: `pending` | `running` | `succeeded` | `failed` | `skipped`

## CSV Columns

- Primary identifiers: `channel`, `optionSku`
- Fallback identifier: `channelOptionId`
- Patch fields: `price`, `stockQuantity`, `saleStatus`, `soldOutStatus`
- Optional context: `masterSku`, `channelProductId`

## API Outline

- `GET /api/catalog/options`
- `POST /api/catalog/sync`
- `GET /api/catalog/sync-runs`
- `POST /api/drafts`
- `GET /api/drafts/:id`
- `POST /api/drafts/:id/items`
- `PATCH /api/drafts/:id/items/:itemId`
- `POST /api/drafts/:id/validate`
- `GET /api/drafts/:id/preview`
- `POST /api/executions`
- `GET /api/executions/runs`
- `GET /api/executions/runs/:id`
- `POST /api/executions/runs/:id/retry-failures`

## Execution Flow

1. Operator runs channel sync.
2. Adapter returns normalized products/options.
3. Local catalog and SKU mapping are upserted.
4. Operator creates a draft from selected rows or CSV upload.
5. Server validates the draft and builds a current-to-next preview.
6. Adapter reads a fresh live snapshot before each execution item.
7. Each item is executed independently and logged independently.
8. Failed items can be copied into a retry run without touching success items.

