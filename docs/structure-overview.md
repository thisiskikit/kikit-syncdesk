# Structure Overview

- Snapshot date: 2026-04-12
- Reason for this document:
  - record the current structure after KIKIT SyncDesk UI 개편 1차
  - explain how the app now presents itself as an operations desk instead of a channel-first admin console
- Verification scope:
  - code inspection
  - route inspection
  - targeted TypeScript and unit-test validation

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
  coupang.ts
  ...shared API/data contracts

docs/
  current-status.md
  change-log.md
  structure-overview.md
  decisions/
  handoffs/
```

## 2. Frontend App Shell

- Entry point:
  - `client/src/App.tsx`
- Providers:
  - React Query
  - operation provider
  - app error boundary
  - workspace tabs provider
- Main shell responsibilities:
  - brand and top navigation
  - multi-tab workspace strip
  - top-level route switching
  - operation toaster

### Current top navigation

- `대시보드`
- `출고`
- `CS`
- `채널`
- `작업센터`
- `설정`

This is the main identity shift in the UI. NAVER and COUPANG are no longer top-level sections in the primary shell.

## 3. Route Ownership

| Top-level route | Purpose | Main implementation |
| --- | --- | --- |
| `/dashboard` | 오늘의 운영 시작점 | `client/src/pages/dashboard.tsx` |
| `/fulfillment` | 출고 판단 + 실행 + 예외 확인 | `client/src/pages/fulfillment.tsx` -> `client/src/features/coupang/shipments/page.tsx` |
| `/cs` | CS 허브 / deep-link launcher | `client/src/pages/cs-hub.tsx` |
| `/channels` | 채널 연결 / 원본 화면 허브 | `client/src/pages/channels-hub.tsx` |
| `/work-center` | 실패 작업 복구 / 로그 상세 | `client/src/pages/operation-center.tsx` |
| `/settings` | 연결 설정 + 고급 도구 허브 | `client/src/pages/settings-hub.tsx` |

### Redirect / wrapper rules

- `/operations` redirects to `/work-center`
- `/coupang/shipments` redirects to `/fulfillment`
- `/naver` redirects to `/channels`
- `/coupang` redirects to `/channels`
- `/runs` redirects to `/engine/runs`
- `/drafts/:id` redirects to `/engine/drafts/:id`

## 4. Fulfillment Screen Structure

The primary fulfillment implementation still lives in the Coupang shipment feature, but its presentation layer has been reframed.

### Main structure in use

- page hero
- primary actions
  - 빠른 수집
  - 결제완료 -> 상품준비중
  - 송장 입력
  - 송장 전송
- secondary actions
  - 누락 검수
  - 보관함
  - 화면 설정
- base filters
  - store
  - date range
  - search
  - secondary `보기 범위`
- decision tabs
  - 전체
  - 출고 가능
  - 송장 대기
  - 보류
  - 차단
  - 재확인 필요
- result summary metrics
- current filter summary row
- collapsed detail filters
  - 송장 상태
  - 출력 상태
  - 주문 상태
- main worksheet table
- selection action bar
  - separates `즉시 실행` rows from `제외 또는 확인 필요` rows
  - selected invoice transmission automatically skips blocked decision groups and reports what was excluded
- right-side decision drawer
- deeper full-detail dialog

### Fulfillment filter layering

- Main axis:
  - `출고 판단`
- Secondary scope:
  - `작업 대상`
  - `배송 이후`
  - `예외·클레임`
  - `전체`
- Detail drill-down:
  - `송장 상태`
  - `출력 상태`
  - `주문 상태`

This layering is intentionally used so operators first answer "what should I act on now?" before narrowing by raw status details.

### Supporting modules

- `client/src/features/coupang/shipments/fulfillment-decision.ts`
  - maps worksheet rows into fulfillment decision states and reasons
- `client/src/features/coupang/shipments/shipment-base-filters.tsx`
  - owns the store / date / search / secondary scope controls
- `client/src/features/coupang/shipments/shipment-worksheet-overview.tsx`
  - owns the decision tabs, decision summary metrics, current filter summary, and collapsed detail-filter section
- `client/src/features/coupang/shipments/shipment-worksheet-panel.tsx`
  - owns the worksheet card shell, worksheet empty states, and worksheet pagination controls
- `client/src/features/coupang/shipments/shipment-archive-panel.tsx`
  - owns the archive card shell, archive empty states, archive pagination controls, and archive table markup
- `client/src/features/coupang/shipments/shipment-selection-action-bar.tsx`
  - owns the mixed-selection summary and decision-aware batch action CTA area
- `client/src/features/coupang/shipments/shipment-decision-drawer.tsx`
  - thin detail surface for operator-first review
- `client/src/features/coupang/shipments/worksheet-grid-config.tsx`
  - exposes decision status and decision reason columns
- `client/src/features/coupang/shipments/worksheet-row-helpers.tsx`
  - renders decision cells and keeps them searchable/sortable

## 5. CS / Channel / Work-Center Framing

### CS

- `client/src/pages/cs-hub.tsx`
- Purpose:
  - send operators into channel-native inquiry / claim screens
  - keep CS visible as a fulfillment-impact layer
- Current implementation approach:
  - card hub
  - deep-links to existing NAVER and COUPANG screens
  - fulfillment-impact counts pulled from shipment view data

### Channels

- `client/src/pages/channels-hub.tsx`
- Purpose:
  - connection settings and raw channel work entry
  - keep channel tools below the main operations path
- Notes:
  - raw channel workflows still exist under `/naver/*` and `/coupang/*`
  - legacy product-oriented tools are disclosed under advanced / legacy sections

### Work Center

- `client/src/pages/operation-center.tsx`
- Purpose:
  - recovery-first log console
- Current behavior:
  - prioritizes warning / error / retryable / running / slow entries
  - exposes retry in the main list
  - pushes raw JSON into expandable detail sections

## 6. Legacy Exposure Policy

The following areas are intentionally removed from the main top-level navigation and operator-first landing flow:

- bulk-price
- product-edit
- grouped products
- draft / runs as a main nav axis
- channel-first shell sections

Current policy:

- keep direct URL access where needed
- keep source files and wrappers unless removal is clearly safe
- surface advanced entry points through `채널` or `설정`

## 7. Backend Relationship

This UI 개편 1차 is mainly a frontend and information-architecture change.

- No new dashboard-only backend service was introduced.
- The new dashboard and hubs reuse existing APIs such as:
  - `/api/settings/stores`
  - `/api/coupang/stores`
  - `/api/ui-state`
  - `/api/coupang/shipments/worksheet/view`
  - `/api/logs`
- Existing shipment, operation, and channel APIs continue to own business logic.

## 8. Data Flow Summary

### Dashboard flow

1. Load connected NAVER / COUPANG stores.
2. Resolve the preferred Coupang shipment store from UI state.
3. Load the current shipment worksheet view for that store.
4. Convert worksheet rows into fulfillment decision counts.
5. Combine decision counts with operation provider state to build the dashboard cards.

### Fulfillment flow

1. The page loads worksheet view data from the existing shipment API.
2. Rows are decorated with fulfillment decision status and reason in the UI layer.
3. Decision tabs filter the currently visible rows.
4. The main table remains thin.
5. Selecting a row opens the right-side decision drawer.
6. Deep detail remains available in the full detail dialog.
7. The top filter, overview, worksheet card, and archive card areas are now composed from focused presentation components instead of a single large JSX block in the page file.

### Work-center flow

1. Load operation or event logs from `/api/logs`.
2. Sort entries by recovery priority.
3. Show retry and summary information in the list.
4. Reveal raw payloads and detail JSON only in foldout sections.

## 9. Validation Snapshot

- Passed:
  - `npm run check`
  - `npm run build`
  - `npx vitest run client/src/lib/workspace-tabs.test.ts client/src/lib/coupang-navigation.test.ts client/src/features/coupang/shipments/fulfillment-decision.test.ts`
  - `Invoke-WebRequest` returned `200` for `/dashboard`, `/fulfillment`, `/cs`, `/channels`, and `/work-center` on the local dev server
- Not yet verified:
  - browser-level end-to-end walkthrough of the new dashboard -> fulfillment -> drawer flow
  - browser-level walkthrough of CS hub, channels hub, and work-center reframing
  - note: headless Chrome / Edge verification against the local dev server was attempted during this task but both browsers returned `ERR_CONNECTION_REFUSED`, while plain HTTP requests still returned `200`

## 10. Remaining Structural Gaps

- The fulfillment page still carries a large amount of orchestration logic in one file.
- The top filter, worksheet, archive, and selection areas are now modularized, but the main grid wiring and action orchestration still live in the same page coordinator.
- The CS top-level page is a hub, not a unified workflow engine.
- Legacy channel and engine routes still exist, which is intentional for compatibility, but they are not yet fully wrapped behind dedicated adapters.
- The main IA has changed, but some deep screens still keep older wording or layout patterns.
