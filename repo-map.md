# KIKIT Price Change Repo Map

분석 기준일: 2026-03-31

중요 메모
- 이 스냅샷에는 `.git` 디렉터리가 없어서, 아래 `핵심 파일 Top 20`은 실제 커밋 빈도 순위가 아니라 아키텍처 중심성, 라우트 fan-out, 파일 크기, 변경 파급도를 기준으로 선정했다.
- 저장소는 완전한 단일 저장소 구조가 아니라 하이브리드 영속성 구조다.
- `catalog / draft / execution` 코어 엔진은 현재 [`server/storage.ts`](./server/storage.ts)의 `IndexedMemoryStorage`를 사용한다.
- 설정/로그/벌크가격/상품 라이브러리/필드 동기화 계열은 PostgreSQL + Drizzle 스키마를 사용하고, 일부는 기존 JSON 파일을 1회 import 한다.
- Drizzle 설정은 있지만 [`migrations`](./migrations) 폴더는 현재 비어 있다. 실제 운영 테이블 보정은 [`server/services/shared/work-data-db.ts`](./server/services/shared/work-data-db.ts)에서 `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE IF NOT EXISTS`로도 수행된다.

## 1. 엔트리포인트

| 파일 | 역할 |
| --- | --- |
| [`package.json`](./package.json) | 전체 실행 명령의 진입점. `dev`, `build`, `start`, `db:push`, `test`가 여기서 정의된다. |
| [`server/index.ts`](./server/index.ts) | Express 서버 부팅 진입점. JSON body limit, `/api` 요청 로깅, 에러 핸들링, startup recovery, Vite/static 서빙이 여기서 시작된다. |
| [`server/routes.ts`](./server/routes.ts) | 모든 API 라우트 mount 테이블. 실제 `/api/...` 네임스페이스를 한눈에 보는 곳이다. |
| [`client/src/main.tsx`](./client/src/main.tsx) | React 앱 bootstrap. `App`를 DOM에 마운트한다. |
| [`client/src/App.tsx`](./client/src/App.tsx) | 프런트엔드 실제 앱 엔트리. Provider 구성, 상단 네비, 워크스페이스 탭, 페이지 라우팅이 모두 여기서 연결된다. |
| [`script/build.ts`](./script/build.ts) | 배포 빌드 진입점. Vite로 client build 후 esbuild로 `server/index.ts`를 `dist/index.js`로 번들링한다. |
| [`vite.config.ts`](./vite.config.ts) | 프런트 빌드/개발 서버 설정. root가 `client/`, 산출물이 `dist/public`으로 간다. |
| [`drizzle.config.ts`](./drizzle.config.ts) | Drizzle 스키마 진입점. 스키마 원본은 `shared/schema.ts`다. |
| [`server/load-env.ts`](./server/load-env.ts) | `.env`를 초기에 로드한다. `drizzle.config.ts` 포함 여러 모듈이 여기 의존한다. |

## 2. 주요 폴더 역할

| 폴더 | 역할 |
| --- | --- |
| [`client/src/pages`](./client/src/pages) | 화면 단위 워크스페이스. NAVER, COUPANG, Draft/Runs, Settings, Field Sync 등의 실제 업무 화면이 들어 있다. |
| [`client/src/components`](./client/src/components) | 공용 UI, layout, toast, provider, drawer, dialog 같은 재사용 컴포넌트 계층이다. |
| [`client/src/lib`](./client/src/lib) | 프런트 공통 인프라. API helper, React Query, localStorage persistence, 탭 라우팅, 도메인 유틸이 있다. |
| [`server/routes`](./server/routes) | Express 라우트 파일들. URL 파싱과 request/response shape validation, 서비스 호출 연결이 여기서 일어난다. |
| [`server/services`](./server/services) | 핵심 비즈니스 로직 계층. 외부 API 호출, 저장소 접근, run/queue/retry, 로그, 캐시, bulk price, field sync 등이 모두 여기에 있다. |
| [`server/services/naver`](./server/services/naver) | NAVER 벌크가격 전용 서비스/스토어. |
| [`server/services/coupang`](./server/services/coupang) | COUPANG 제품/주문/문의/배송/쿠폰/벌크가격 등 채널 전용 서비스 묶음. |
| [`server/services/shared`](./server/services/shared) | 공통 API response, async helper, stale cache, DB bootstrap 등 cross-cutting 유틸리티. |
| [`server/adapters`](./server/adapters) | Draft/Execution 엔진이 사용하는 채널 어댑터 계층. 현재는 실제 채널 API가 아니라 인메모리 시뮬레이션 성격이 강하다. |
| [`shared`](./shared) | 클라이언트/서버 공용 타입, Zod schema, API contract, DB schema 정의. |
| [`script`](./script) | 빌드, 성능 측정, NAVER seller barcode warm-up 같은 운영성 스크립트. |
| [`data`](./data) | 런타임 JSON 캐시/설정/로그 파일. 실제 개발/운영 흔적이 가장 많이 쌓이는 폴더다. |
| [`docs`](./docs) | 기능 설계 문서와 운영 메모. |
| [`migrations`](./migrations) | Drizzle migration output 위치. 현재 스냅샷 기준 비어 있다. |
| [`dist`](./dist) | 빌드 결과물. `dist/index.js`와 `dist/public/*`이 생성된다. |

## 3. 구조 한눈에 보기

```text
client page
  -> client/lib/queryClient.ts
  -> /api/... (Express route)
  -> server/services/*
     -> 외부 API client (NAVER / COUPANG)
     -> PostgreSQL work-data tables
     -> JSON cache / log / settings files
  -> shared/* contract/schema
  -> client render/update
```

특수 경로
- Draft/Execution 엔진은 [`server/storage.ts`](./server/storage.ts) + [`server/adapters`](./server/adapters) 기반으로 동작한다.
- Bulk Price / Field Sync는 외부 소스 DB(`MASTER_SKU_DATABASE_URL`)를 직접 읽는 경로가 있다.

## 4. 상태관리 위치

| 계층 | 위치 | 저장 내용 | 영속성 |
| --- | --- | --- | --- |
| 클라이언트 원격 상태 | [`client/src/lib/queryClient.ts`](./client/src/lib/queryClient.ts) | API fetch helper, JSON envelope 해제, React Query stale/gc policy | 메모리 cache |
| 클라이언트 전역 작업 상태 | [`client/src/components/operation-provider.tsx`](./client/src/components/operation-provider.tsx) | operation list, toast, retry, SSE subscribe | 메모리 + `/api/operations/stream` |
| 클라이언트 워크스페이스 탭 상태 | [`client/src/components/workspace-tabs.tsx`](./client/src/components/workspace-tabs.tsx), [`client/src/lib/workspace-tabs.ts`](./client/src/lib/workspace-tabs.ts) | 열린 탭, active tab, 경로/검색어, 제목 | `localStorage` (`kikit:workspace-tabs:v1`) |
| 클라이언트 로컬 설정 상태 | [`client/src/lib/use-persistent-state.ts`](./client/src/lib/use-persistent-state.ts) | 화면별 단순 persisted state | `localStorage` |
| 클라이언트 레이아웃 상태 | [`client/src/components/layout-persistence-manager.tsx`](./client/src/components/layout-persistence-manager.tsx) | table column width, split panel width | `localStorage` |
| 클라이언트 서버 저장 메뉴 상태 | [`client/src/lib/use-server-menu-state.ts`](./client/src/lib/use-server-menu-state.ts) | 화면별 object 상태 | `/api/ui-state` -> [`server/services/ui-state-store.ts`](./server/services/ui-state-store.ts) -> `data/ui-state.json` |
| 서버 코어 제어 엔진 상태 | [`server/storage.ts`](./server/storage.ts) | catalog sync, draft, draft items, execution runs/items | 현재는 인메모리 |
| 서버 로그/운영 상태 | [`server/services/logs/store.ts`](./server/services/logs/store.ts) | operation/event logs | `data/logs/*.jsonl`, legacy import from `data/operation-logs.json` |
| 서버 NAVER 설정 상태 | [`server/services/channel-settings-store.ts`](./server/services/channel-settings-store.ts) | NAVER store credentials, connection test | JSON import -> PostgreSQL `channel_store_settings` |
| 서버 COUPANG 설정 상태 | [`server/services/coupang/settings-store.ts`](./server/services/coupang/settings-store.ts) | COUPANG vendor/access/secret/baseUrl | JSON import -> PostgreSQL `coupang_store_settings` |
| 서버 상품 캐시 | [`server/services/naver-product-cache-store.ts`](./server/services/naver-product-cache-store.ts), [`server/services/coupang/product-cache-store.ts`](./server/services/coupang/product-cache-store.ts) | channel product snapshots / explorer/detail cache | `data/*.json` |
| 서버 배송 워크시트 상태 | [`server/services/coupang/shipment-worksheet-store.ts`](./server/services/coupang/shipment-worksheet-store.ts) | COUPANG shipment worksheet row set, sync state | JSON import + PostgreSQL |
| 서버 벌크가격 상태 | [`server/services/naver/bulk-price-store.ts`](./server/services/naver/bulk-price-store.ts), [`server/services/coupang/bulk-price-store.ts`](./server/services/coupang/bulk-price-store.ts) | presets, runs, runItems, latest applied records | JSON import + PostgreSQL |
| 서버 필드 동기화 상태 | [`server/services/platform-field-sync-service.ts`](./server/services/platform-field-sync-service.ts) | rule/run metadata | PostgreSQL |

## 5. API 라우트

실제 mount 위치는 [`server/routes.ts`](./server/routes.ts) 기준이다.

| Mount Prefix | 라우트 파일 | 주요 엔드포인트 |
| --- | --- | --- |
| `/api/catalog` | [`server/routes/catalog.ts`](./server/routes/catalog.ts) | `GET /options` |
| `/api/catalog` | [`server/routes/sync.ts`](./server/routes/sync.ts) | `GET /sync-runs`, `POST /sync` |
| `/api/drafts` | [`server/routes/drafts.ts`](./server/routes/drafts.ts) | `POST /`, `GET /:id`, `POST /:id/items`, `PATCH /:id/items/:itemId`, `POST /:id/validate`, `GET /:id/preview` |
| `/api/executions` | [`server/routes/executions.ts`](./server/routes/executions.ts) | `POST /`, `GET /runs`, `GET /runs/:id`, `POST /runs/:id/retry-failures` |
| `/api/settings` | [`server/routes/settings.ts`](./server/routes/settings.ts) | `GET /stores`, `POST /stores`, `POST /stores/test-connection` |
| `/api/ui-state` | [`server/routes/ui-state.ts`](./server/routes/ui-state.ts) | `GET /`, `PUT /` |
| `/api/operations` | [`server/routes/operations.ts`](./server/routes/operations.ts) | `GET /`, `GET /stream`, `POST /`, `PATCH /:id`, `POST /:id/retry` |
| `/api/logs` | [`server/routes/logs.ts`](./server/routes/logs.ts) | `GET /`, `GET /:id` |
| `/api/naver` | [`server/routes/naver-products.ts`](./server/routes/naver-products.ts) | `GET /products`, `GET /products/price-preview`, `POST /products/price`, `POST /products/price-preview/bulk`, `POST /products/prices/bulk`, `POST /products/status-draft`, `PUT /products/memo` |
| `/api/naver` | [`server/routes/naver-orders.ts`](./server/routes/naver-orders.ts) | `GET /orders`, `GET /orders/:productOrderId`, `POST /orders/confirm`, `POST /orders/dispatch`, `POST /orders/delay-dispatch` |
| `/api/naver` | [`server/routes/naver-claims.ts`](./server/routes/naver-claims.ts) | `GET /claims`, cancel/return/exchange 승인/보류/거부/재배송 액션 |
| `/api/naver` | [`server/routes/naver-inquiries.ts`](./server/routes/naver-inquiries.ts) | `GET /inquiries`, `GET /inquiries/product-templates`, customer/product answer create/update |
| `/api/naver` | [`server/routes/naver-settlements.ts`](./server/routes/naver-settlements.ts) | `GET /settlements` |
| `/api/naver` | [`server/routes/naver-seller.ts`](./server/routes/naver-seller.ts) | `GET /seller-info` |
| `/api/naver` | [`server/routes/naver-stats.ts`](./server/routes/naver-stats.ts) | `GET /stats` |
| `/api/naver` | [`server/routes/naver-bulk-price.ts`](./server/routes/naver-bulk-price.ts) | source metadata/presets/rule presets/preview/run CRUD/pause/resume/stop |
| `/api/coupang` | [`server/routes/coupang.ts`](./server/routes/coupang.ts) | stores, products, explorer, detail, single/bulk price/qty/sale-status update, orders, shipments, returns, exchanges, settlements |
| `/api/coupang` | [`server/routes/coupang-support.ts`](./server/routes/coupang-support.ts) | logistics categories/outbound centers/return centers, inquiries, rocket growth |
| `/api/coupang` | [`server/routes/coupang-promotions.ts`](./server/routes/coupang-promotions.ts) | promotions contracts/budgets/instant coupons/download coupons/cashback |
| `/api/coupang` | [`server/routes/coupang-bulk-price.ts`](./server/routes/coupang-bulk-price.ts) | source metadata/presets/rule presets/preview/run CRUD/pause/resume/stop |
| `/api/product-library` | [`server/routes/product-library.ts`](./server/routes/product-library.ts) | `GET /records`, `GET /record`, `PUT /record`, attachment upload/delete/download |
| `/api/field-sync` | [`server/routes/platform-field-sync.ts`](./server/routes/platform-field-sync.ts) | rules CRUD, runs list, target metadata, preview, run one rule, run enabled rules |

실무적으로 많이 보는 라우트
- NAVER 상품 제어: [`server/routes/naver-products.ts`](./server/routes/naver-products.ts)
- COUPANG 전체 운영 API 허브: [`server/routes/coupang.ts`](./server/routes/coupang.ts)
- 벌크가격: [`server/routes/naver-bulk-price.ts`](./server/routes/naver-bulk-price.ts), [`server/routes/coupang-bulk-price.ts`](./server/routes/coupang-bulk-price.ts)
- 운영 상태 스트림: [`server/routes/operations.ts`](./server/routes/operations.ts)

## 6. DB 모델 / 스키마

원본 위치
- 스키마 원본: [`shared/schema.ts`](./shared/schema.ts)
- Drizzle 설정: [`drizzle.config.ts`](./drizzle.config.ts)
- 런타임 테이블 생성/보정: [`server/services/shared/work-data-db.ts`](./server/services/shared/work-data-db.ts)

핵심 테이블 그룹

| 도메인 | 테이블 |
| --- | --- |
| 카탈로그 / 제어 엔진 | `channel_products`, `channel_options`, `sku_channel_mappings`, `catalog_sync_runs`, `control_drafts`, `control_draft_items`, `execution_runs`, `execution_items` |
| 상품 라이브러리 | `product_library_records`, `product_library_attachments` |
| 채널 설정 | `channel_store_settings`, `coupang_store_settings` |
| COUPANG 배송 워크시트 | `coupang_shipment_sheets`, `coupang_shipment_rows` |
| NAVER 벌크가격 | `naver_bulk_price_source_presets`, `naver_bulk_price_rule_presets`, `naver_bulk_price_runs`, `naver_bulk_price_run_items`, `naver_bulk_price_latest_records` |
| COUPANG 벌크가격 | `coupang_bulk_price_source_presets`, `coupang_bulk_price_rule_presets`, `coupang_bulk_price_runs`, `coupang_bulk_price_run_items`, `coupang_bulk_price_latest_records` |
| 운영/관측/동기화 | `operation_logs`, `platform_field_sync_rules`, `platform_field_sync_runs`, `storage_imports` |

중요 관계
- `channel_options.product_id -> channel_products.id`
- `control_draft_items.draft_id -> control_drafts.id`
- `execution_runs.draft_id -> control_drafts.id`
- `execution_items.run_id -> execution_runs.id`
- `product_library_attachments.record_id -> product_library_records.id`
- `platform_field_sync_runs.rule_id -> platform_field_sync_rules.id`

주의할 점
- [`server/storage.ts`](./server/storage.ts)는 `db` 핸들을 export 하지만, 실제 `storage` 구현체는 현재 메모리 기반이다.
- 따라서 `draft / execution / catalog sync`는 schema가 정의되어 있어도 아직 work-data 테이블 계열처럼 Postgres에 완전히 붙어 있지 않다.
- 반대로 bulk price / field sync / logs / settings / library는 실제 PostgreSQL 테이블을 적극 사용한다.

## 7. 외부 연동 지점

| 외부 시스템 | 진입 파일 | 설명 |
| --- | --- | --- |
| NAVER OAuth / Commerce API | [`server/services/naver-auth.ts`](./server/services/naver-auth.ts), [`server/services/naver-api-client.ts`](./server/services/naver-api-client.ts) | access token 발급과 공통 HTTP 요청 래퍼. `NAVER_COMMERCE_AUTH_URL`, `NAVER_COMMERCE_API_BASE_URL` 환경변수를 사용한다. |
| NAVER 상품/주문/클레임/문의/정산/판매자 정보 | [`server/services/naver-product-service.ts`](./server/services/naver-product-service.ts), [`server/services/naver-order-service.ts`](./server/services/naver-order-service.ts), [`server/services/naver-claim-service.ts`](./server/services/naver-claim-service.ts), [`server/services/naver-inquiry-service.ts`](./server/services/naver-inquiry-service.ts), [`server/services/naver-settlement-service.ts`](./server/services/naver-settlement-service.ts), [`server/services/naver-seller-service.ts`](./server/services/naver-seller-service.ts), [`server/services/naver-stats-service.ts`](./server/services/naver-stats-service.ts) | NAVER 업무 도메인별 실제 연동 구현. |
| COUPANG Seller API | [`server/services/coupang/auth.ts`](./server/services/coupang/auth.ts), [`server/services/coupang/api-client.ts`](./server/services/coupang/api-client.ts) | HMAC 인증, 재시도, rate-limit 완화, request scheduler가 있다. |
| COUPANG 상품/주문/배송/반품/교환/문의/쿠폰 | [`server/services/coupang/product-service.ts`](./server/services/coupang/product-service.ts), [`server/services/coupang/order-service.ts`](./server/services/coupang/order-service.ts), [`server/services/coupang/shipment-worksheet-service.ts`](./server/services/coupang/shipment-worksheet-service.ts), [`server/services/coupang/support-service.ts`](./server/services/coupang/support-service.ts), [`server/services/coupang/coupon-service.ts`](./server/services/coupang/coupon-service.ts) | COUPANG 기능 대부분이 이 묶음으로 들어간다. |
| PostgreSQL work-data DB | [`server/storage.ts`](./server/storage.ts), [`server/services/shared/work-data-db.ts`](./server/services/shared/work-data-db.ts) | `DATABASE_URL` 기반. 설정, 로그, 필드동기화, 라이브러리, 배송워크시트, 벌크가격 저장에 사용된다. |
| 외부 소스 DB / Master SKU DB | [`server/services/bulk-price/shared.ts`](./server/services/bulk-price/shared.ts), [`server/services/platform-field-sync-service.ts`](./server/services/platform-field-sync-service.ts) | `MASTER_SKU_DATABASE_URL` 기반으로 외부 테이블 메타데이터 조회와 source row 로드를 수행한다. |
| 파일시스템 캐시/로그 | [`server/services/ui-state-store.ts`](./server/services/ui-state-store.ts), [`server/services/naver-product-cache-store.ts`](./server/services/naver-product-cache-store.ts), [`server/services/coupang/product-cache-store.ts`](./server/services/coupang/product-cache-store.ts), [`server/services/logs/store.ts`](./server/services/logs/store.ts) | `data/` 폴더 아래 JSON/JSONL 파일을 직접 읽고 쓴다. |
| 개발 서버 / 정적 서빙 | [`server/vite.ts`](./server/vite.ts), [`server/static.ts`](./server/static.ts) | dev/prod 환경별 프런트 자산 제공 경계다. |

## 8. 자주 수정하게 될 핵심 파일 Top 20

선정 기준
- `.git` 이력이 없어서 실제 수정 횟수 순위는 아니다.
- UI 진입점, API 허브, 도메인 서비스 중심으로 “수정 파급도가 큰 파일”을 우선 배치했다.

| 순위 | 파일 | 왜 자주 건드리게 되는가 |
| --- | --- | --- |
| 1 | [`client/src/App.tsx`](./client/src/App.tsx) | 전체 프런트 라우팅, Provider 구성, 상단 네비/탭 구조가 모두 여기 모인다. |
| 2 | [`server/routes.ts`](./server/routes.ts) | 새 API 네임스페이스를 붙이거나 제거할 때 반드시 수정된다. |
| 3 | [`server/index.ts`](./server/index.ts) | 서버 startup, middleware, logging, error handling, dev/prod 서빙 경계가 여기 있다. |
| 4 | [`shared/schema.ts`](./shared/schema.ts) | DB 테이블과 타입의 사실상 단일 원본이다. |
| 5 | [`server/services/shared/work-data-db.ts`](./server/services/shared/work-data-db.ts) | work-data 계열 테이블 생성/보정과 DB 가용성 게이트가 집중돼 있다. |
| 6 | [`server/storage.ts`](./server/storage.ts) | catalog/draft/execution 코어 스토리지와 DB 핸들 정의가 함께 있다. |
| 7 | [`client/src/lib/queryClient.ts`](./client/src/lib/queryClient.ts) | 모든 fetch/JSON parsing/error surface/React Query 정책이 통과한다. |
| 8 | [`client/src/components/operation-provider.tsx`](./client/src/components/operation-provider.tsx) | 작업 상태, SSE, toast, retry UX를 관리한다. |
| 9 | [`client/src/components/workspace-tabs.tsx`](./client/src/components/workspace-tabs.tsx) | 멀티 탭 워크스페이스 UX를 바꾸면 거의 항상 여기까지 온다. |
| 10 | [`client/src/pages/naver-products.tsx`](./client/src/pages/naver-products.tsx) | NAVER 제품 조회/제어의 대표 화면이자 주요 사용자 접점이다. |
| 11 | [`server/routes/naver-products.ts`](./server/routes/naver-products.ts) | NAVER 제품 관련 HTTP 계약과 작업 추적이 집중돼 있다. |
| 12 | [`server/services/naver-product-service.ts`](./server/services/naver-product-service.ts) | NAVER 제품 API 연동, 가격 preview/update, 캐시 로직의 핵심이다. |
| 13 | [`client/src/pages/coupang-products.tsx`](./client/src/pages/coupang-products.tsx) | COUPANG 제품 관리의 중심 화면이다. |
| 14 | [`server/routes/coupang.ts`](./server/routes/coupang.ts) | 저장소 전체에서 가장 넓은 API surface 중 하나다. |
| 15 | [`server/services/coupang/product-service.ts`](./server/services/coupang/product-service.ts) | COUPANG 제품 탐색/상세/수정/일괄 작업의 핵심 서비스다. |
| 16 | [`server/services/coupang/order-service.ts`](./server/services/coupang/order-service.ts) | 주문, 배송, 반품, 교환, 정산까지 묶여 있어 파급도가 크다. |
| 17 | [`client/src/pages/coupang-shipments.tsx`](./client/src/pages/coupang-shipments.tsx) | 현재 화면 중 매우 큰 편이며 배송 실무 UI가 집중돼 있다. |
| 18 | [`client/src/pages/naver-bulk-price.tsx`](./client/src/pages/naver-bulk-price.tsx) | 프로젝트 성격상 가격 자동화 관련 변경이 많이 모일 가능성이 높다. |
| 19 | [`client/src/pages/coupang-bulk-price.tsx`](./client/src/pages/coupang-bulk-price.tsx) | COUPANG 벌크가격 UI의 중심 화면이다. |
| 20 | [`server/services/platform-field-sync-service.ts`](./server/services/platform-field-sync-service.ts) | 외부 DB 동기화 규칙/실행/업서트 로직이 집중된 cross-system 허브다. |

Top 20 바로 다음 후보
- [`server/routes/naver-bulk-price.ts`](./server/routes/naver-bulk-price.ts)
- [`server/routes/coupang-bulk-price.ts`](./server/routes/coupang-bulk-price.ts)
- [`server/services/naver/bulk-price-service.ts`](./server/services/naver/bulk-price-service.ts)
- [`server/services/coupang/bulk-price-service.ts`](./server/services/coupang/bulk-price-service.ts)
- [`client/src/pages/field-sync.tsx`](./client/src/pages/field-sync.tsx)
- [`server/services/product-library-service.ts`](./server/services/product-library-service.ts)

## 9. 처음 파악할 때 추천 오픈 순서

1. [`package.json`](./package.json)
2. [`server/index.ts`](./server/index.ts)
3. [`server/routes.ts`](./server/routes.ts)
4. [`client/src/App.tsx`](./client/src/App.tsx)
5. [`client/src/lib/queryClient.ts`](./client/src/lib/queryClient.ts)
6. [`shared/schema.ts`](./shared/schema.ts)
7. 관심 도메인의 route 파일
8. 같은 도메인의 service 파일
9. 관련 page 파일
10. 관련 store/cache 파일

