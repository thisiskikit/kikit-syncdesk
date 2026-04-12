# Current Status

- Snapshot date: 2026-04-12
- Purpose: record the current runtime state of KIKIT SyncDesk after the 1차 운영 데스크 UI 개편.
- Verification scope:
  - code inspection
  - TypeScript check
  - targeted unit tests
- Verified files for this snapshot:
  - `client/src/App.tsx`
  - `client/src/lib/workspace-tabs.ts`
  - `client/src/lib/workspace-tabs.test.ts`
  - `client/src/lib/coupang-navigation.ts`
  - `client/src/lib/coupang-navigation.test.ts`
  - `client/src/lib/operation-links.ts`
  - `client/src/pages/dashboard.tsx`
  - `client/src/pages/fulfillment.tsx`
  - `client/src/pages/cs-hub.tsx`
  - `client/src/pages/channels-hub.tsx`
  - `client/src/pages/operation-center.tsx`
  - `client/src/pages/settings-hub.tsx`
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/fulfillment-decision.ts`
  - `client/src/features/coupang/shipments/fulfillment-decision.test.ts`
  - `client/src/features/coupang/shipments/fulfillment-filter-summary.ts`
  - `client/src/features/coupang/shipments/fulfillment-filter-summary.test.ts`
  - `client/src/features/coupang/shipments/shipment-base-filters.tsx`
  - `client/src/features/coupang/shipments/shipment-archive-panel.tsx`
  - `client/src/features/coupang/shipments/shipment-selection-summary.ts`
  - `client/src/features/coupang/shipments/shipment-selection-summary.test.ts`
  - `client/src/features/coupang/shipments/shipment-selection-action-bar.tsx`
  - `client/src/features/coupang/shipments/shipment-worksheet-panel.tsx`
  - `client/src/features/coupang/shipments/shipment-worksheet-overview.tsx`
  - `client/src/features/coupang/shipments/shipment-decision-drawer.tsx`
  - `client/src/features/coupang/shipments/worksheet-grid-config.tsx`
  - `client/src/features/coupang/shipments/worksheet-row-helpers.tsx`
  - `client/src/features/coupang/shipments/worksheet-config.ts`
  - `client/src/components/status-badge.tsx`
  - `client/src/index.css`

## Current State

| Area | Current state | Basis | Notes |
| --- | --- | --- | --- |
| App shell / top navigation | Active | `client/src/App.tsx`, `client/src/lib/workspace-tabs.ts` | The main navigation is now organized around `대시보드`, `출고`, `CS`, `채널`, `작업센터`, and `설정`. The app brand text is `KIKIT SyncDesk` and frames the product as an operations desk focused on fulfillment, CS, and recovery work. |
| Workspace tab routing | Active | `client/src/lib/workspace-tabs.ts`, `client/src/lib/workspace-tabs.test.ts` | Top-level tab ownership now maps Coupang shipment routes to `출고`, inquiry/claim routes to `CS`, remaining channel screens to `채널`, and draft/run/engine routes to `설정`. `/operations` is treated as `/work-center`. |
| Dashboard | Active | `client/src/pages/dashboard.tsx` | The dashboard is no longer a channel launcher. It is now an operator start page with a hero, 핵심 액션 카드, 지금 먼저 볼 것, 최근 이슈, 빠른 작업 패널, and a small channel-state strip. It deep-links directly to `출고`, `CS`, `작업센터`, and `채널`. |
| Fulfillment top-level | Active | `client/src/pages/fulfillment.tsx`, `client/src/features/coupang/shipments/page.tsx` | `출고` is now the primary top-level operational page and wraps the existing Coupang shipment worksheet flow. `/coupang/shipments` still exists but redirects to `/fulfillment` instead of being exposed in the main shell. |
| Fulfillment filter hierarchy | Active in worksheet view | `client/src/features/coupang/shipments/page.tsx`, `client/src/features/coupang/shipments/fulfillment-filter-summary.ts` | The worksheet now treats `출고 판단` as the main operator-facing axis, keeps `작업 대상 / 배송 이후 / 예외·클레임 / 전체` as a secondary scope selector, and moves `송장 상태 / 출력 상태 / 주문 상태` into a collapsed detail-filter area. The page also shows a `현재 적용 조건` summary row so operators can understand why the list is filtered the way it is. |
| Fulfillment top-layer composition | Active | `client/src/features/coupang/shipments/shipment-base-filters.tsx`, `client/src/features/coupang/shipments/shipment-worksheet-overview.tsx`, `client/src/features/coupang/shipments/shipment-selection-action-bar.tsx` | The worksheet top layer is no longer rendered as one uninterrupted JSX block. Base filters, worksheet overview, and selection actions are now isolated into focused components so future layout changes can stay small and reviewable without changing the shipment business flow. |
| Fulfillment worksheet and archive panels | Active | `client/src/features/coupang/shipments/shipment-worksheet-panel.tsx`, `client/src/features/coupang/shipments/shipment-archive-panel.tsx` | The worksheet card and archive card are now rendered through focused panel components. The page file still coordinates data and actions, but list-card markup, empty states, pagination controls, and archive table rendering are no longer embedded inline in the main page JSX. |
| Fulfillment decision model | Active in UI | `client/src/features/coupang/shipments/fulfillment-decision.ts`, `client/src/features/coupang/shipments/fulfillment-decision.test.ts` | Shipment rows are now mapped into five operator-facing decision states: `출고 가능`, `송장 대기`, `보류`, `차단`, and `재확인 필요`. Reason labels are surfaced consistently in the table, summary, and detail drawer. |
| Fulfillment detail presentation | Active | `client/src/features/coupang/shipments/page.tsx`, `client/src/features/coupang/shipments/shipment-decision-drawer.tsx` | The fulfillment list remains table-first, but the first detail surface is now a right-side drawer focused on decision status, reason, shipment status, CS impact, and recent activity. The full existing detail dialog remains available as a deeper layer. |
| Fulfillment batch actions | Active with decision-aware exclusion | `client/src/features/coupang/shipments/page.tsx`, `client/src/features/coupang/shipments/shipment-selection-summary.ts` | The worksheet now shows a selection action bar that separates `즉시 실행` rows from `제외 또는 확인 필요` rows. Selected invoice transmission automatically proceeds with executable rows only and reports which blocked decision groups were excluded. Existing shipment actions such as quick collect, prepare, invoice input, invoice transmission, missing audit, archive, and view settings are preserved. |
| CS hub | Active | `client/src/pages/cs-hub.tsx` | `CS` is now a dedicated top-level hub rather than a channel menu item. It is implemented as a routing hub that deep-links to existing NAVER and COUPANG inquiry/claim screens and also links back to fulfillment for shipment-impact issues. |
| Channels hub | Active | `client/src/pages/channels-hub.tsx` | `채널` is now a secondary layer for channel connection screens and raw channel workflows. It intentionally pushes channel-specific product tools and raw operational screens below the main operations flow. |
| Work center | Active with recovery framing | `client/src/pages/operation-center.tsx`, `client/src/lib/operation-links.ts` | `작업센터` reuses the existing operation log infrastructure but is now framed as a failure-recovery workspace. Warning, error, retryable, running, and slow items are prioritized. Raw payloads and detailed error JSON are kept inside expandable sections instead of the main list. |
| Settings hub | Active | `client/src/pages/settings-hub.tsx` | `설정` now groups channel connection settings and advanced tools. Draft/run/field-sync tools remain available here, but they are no longer top-level navigation items. |
| Legacy exposure policy | Active | `client/src/App.tsx`, `client/src/pages/channels-hub.tsx`, `client/src/pages/settings-hub.tsx`, `client/src/lib/coupang-navigation.ts` | `bulk-price`, `product-edit`, `grouped products`, and `Draft / Runs` are removed from the main top-level flow. Direct URLs still exist where needed, and advanced entry points remain reachable through `채널` or `설정`. |

## Route Summary

- Main top-level routes:
  - `/dashboard`
  - `/fulfillment`
  - `/cs`
  - `/channels`
  - `/work-center`
  - `/settings`
- Redirect / wrapper behavior:
  - `/operations` -> `/work-center`
  - `/coupang/shipments` -> `/fulfillment`
  - `/naver` -> `/channels`
  - `/coupang` -> `/channels`
  - `/runs` -> `/engine/runs`
  - `/drafts/:id` -> `/engine/drafts/:id`

## Fulfillment Decision Rules In Use

- `차단`
  - cancel / return / exchange-like order states
  - shipment-stop customer service issues
- `재확인 필요`
  - invoice transmission failed
  - customer service snapshot is `unknown` or `stale`
  - required shipment data is missing
- `보류`
  - non-blocking customer service impact exists
- `송장 대기`
  - invoice transmission is pending
  - invoice input or invoice transmission is still required
- `출고 가능`
  - no blocking or recheck issue exists and the row can move forward operationally

## Validation

- Passed:
  - `npm run check`
  - `npm run build`
  - `npx vitest run client/src/lib/workspace-tabs.test.ts client/src/lib/coupang-navigation.test.ts client/src/features/coupang/shipments/fulfillment-decision.test.ts`
  - `npx vitest run client/src/features/coupang/shipments/fulfillment-decision.test.ts client/src/features/coupang/shipments/fulfillment-filter-summary.test.ts`
  - `npx vitest run client/src/features/coupang/shipments/shipment-selection-summary.test.ts`
  - `npx vitest run client/src/features/coupang/shipments/shipment-selection-summary.test.ts client/src/features/coupang/shipments/fulfillment-filter-summary.test.ts client/src/features/coupang/shipments/fulfillment-decision.test.ts`
  - `Invoke-WebRequest http://localhost:4173/dashboard`
  - `Invoke-WebRequest http://localhost:4173/fulfillment`
  - `Invoke-WebRequest http://localhost:4173/cs`
  - `Invoke-WebRequest http://localhost:4173/channels`
  - `Invoke-WebRequest http://localhost:4173/work-center`
- Not run in this task:
  - `npm run test`
  - browser-level manual verification for dashboard, fulfillment drawer, CS hub, channel hub, and work-center flows
- Attempted but blocked:
  - headless Chrome / Edge verification against `http://localhost:4173/*` returned `ERR_CONNECTION_REFUSED` inside the browser process even though `Invoke-WebRequest` to the same dev server returned `200`, so this task could not complete an actual browser-render validation on this machine

## Remaining Issues

- `client/src/features/coupang/shipments/page.tsx` is still a large coordinator file even after the new decision-focused framing.
- The fulfillment table now emphasizes decision state and drawer-first detail, but some older worksheet controls still sit in the same page and should be modularized further in a later phase.
- The fulfillment worksheet now has a clearer filter hierarchy, but the page still contains both action wiring and presentation in one file.
- `CS` is currently a hub with deep-links, not a unified cross-channel execution surface.
- Channel product tools and other legacy pages are hidden from the main flow but still remain in the repository and at direct URLs.
- This snapshot does not include browser-level confirmation that the new IA is visually coherent end-to-end.
