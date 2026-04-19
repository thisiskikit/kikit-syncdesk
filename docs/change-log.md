# Change Log

이 문서는 구현이 실제 코드와 문서에 함께 반영된 변경만 기록합니다.

## 2026-04-19 / 출고 보기 프리셋 UI를 전체 열 보기만 노출하도록 제한

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `client/src/features/coupang/shipments/fulfillment-grid-controller.tsx`
  - `client/src/features/coupang/shipments/shipment-worksheet-panel.tsx`
  - `client/src/features/coupang/shipments/shipment-column-settings-panel.tsx`
  - `docs/current-status.md`
  - `docs/structure-overview.md`
  - `docs/change-log.md`
- 변경 내용:
  - 워크시트 화면과 컬럼 설정 패널에서 노출하는 보기 프리셋 목록을 `전체 열 보기` 하나로 제한했습니다.
  - `작업 보기`, `송장 입력 보기` 프리셋 정의는 코드에 그대로 두고, UI에서만 일시적으로 숨겼습니다.
  - 안내 문구도 현재 동작에 맞게 `전체 열 보기만 노출 중`인 상태로 정리했습니다.
- 이유:
  - 당분간 프리셋 선택지를 단순화해서, 사용자 화면에서 혼동 없이 하나의 기준 레이아웃만 보이게 하려는 목적입니다.
- 검증:
  - `npm run check`

## 2026-04-19 / 출고 source column 드롭다운에 preview 값 표시 추가

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `client/src/features/coupang/shipments/shipment-column-settings-panel.tsx`
  - `docs/current-status.md`
  - `docs/change-log.md`
- 변경 내용:
  - 컬럼 설정의 source column 드롭다운 각 선택지에 현재 preview 기준 행의 값을 `preview: ...` 형태로 함께 붙여 보여주도록 바꿨습니다.
  - 현재 선택된 source 아래에도 같은 preview 값을 별도로 노출해, 드롭다운을 닫은 상태에서도 바로 확인할 수 있게 했습니다.
- 이유:
  - raw field key를 바꿔 보며 어떤 값이 실제로 들어오는지 확인할 때, 기존에는 드롭다운 목록과 오른쪽 preview를 번갈아 봐야 해서 비교가 불편했습니다.
- 검증:
  - `npm run check`

## 2026-04-19 / 출고 컬럼 설정 preview 기준 행 선택 추가

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/fulfillment-grid-controller.tsx`
  - `client/src/features/coupang/shipments/shipment-column-settings-panel.tsx`
  - `client/src/features/coupang/shipments/types.ts`
  - `client/src/index.css`
  - `docs/current-status.md`
  - `docs/change-log.md`
- 변경 내용:
  - 컬럼 설정 패널 상단에 `미리보기 기준 행` 선택기를 추가해, 사용자가 현재 보이는 주문행 중 원하는 행을 골라 preview 기준을 바꿀 수 있게 했습니다.
  - preview 후보는 선택된 행, 현재 페이지에 보이는 행, active worksheet 행을 합쳐 중복 없이 만들고, 기준 행이 사라지면 자동으로 기본 행으로 되돌아가도록 했습니다.
  - 각 후보는 `주문번호 · 상품명` 중심의 라벨과 `수령인 / 상태`가 포함된 설명을 함께 보여, 긴 raw/source 조합도 어떤 주문 기준인지 바로 파악할 수 있게 했습니다.
- 이유:
  - 기존 preview는 선택 행이나 현재 목록 첫 행에 고정돼 있어서, 옵션값 누락이나 특정 raw field 매핑을 검증할 때 다른 주문행으로 비교해 보기가 불편했습니다.
- 검증:
  - `npm run check`

## 2026-04-19 / 쿠팡 배송 시트 rawFields 평탄화 맵 기반 전환

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `shared/coupang.ts`
  - `server/services/coupang/shipment-worksheet-raw-fields.ts`
  - `server/services/coupang/shipment-worksheet-service.ts`
  - `server/services/coupang/shipment-worksheet-view.ts`
  - `server/stores/work-data-coupang-shipment-worksheet-store.ts`
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/worksheet-config.ts`
  - `client/src/features/coupang/shipments/worksheet-grid-config.tsx`
  - `client/src/features/coupang/shipments/worksheet-row-helpers.tsx`
  - `client/src/features/coupang/shipments/shipment-column-settings-panel.tsx`
  - `client/src/features/coupang/shipments/shipment-column-presets.ts`
  - `client/src/features/coupang/shipments/quick-collect-focus-controller.ts`
  - `client/src/features/coupang/shipments/worksheet-config.test.ts`
  - `client/src/features/coupang/shipments/shipment-column-presets.test.ts`
  - `client/src/features/coupang/shipments/quick-collect-focus-controller.test.ts`
  - `server/stores/work-data-coupang-shipment-worksheet-store.test.ts`
  - `docs/current-status.md`
  - `docs/change-log.md`
- 변경 내용:
  - 배송 시트 row는 이제 `row_data_json.rawFields` 안에 `worksheet.*`, `order.*`, `detail.*`, `detailItem.*`, `product.*`, `productItem.*` scalar 평탄화 맵을 함께 저장합니다.
  - collect / refresh / archive restore는 같은 raw field builder 또는 synthetic backfill 경로를 써서, active worksheet와 archive가 같은 source resolver를 공유합니다.
  - `ShipmentColumnConfig`는 `sourceKey` 단일 문자열에서 `builtin/raw` union source 구조로 전환됐고, 기존 저장된 컬럼 설정은 로드 시 자동 마이그레이션됩니다.
  - 컬럼 설정은 builtin field와 Coupang raw field를 함께 보여주며, 메인 그리드 / 정렬 / 엑셀 다운로드 / 미리보기 / 빠른 수집 집중 보기 응답도 `rawFieldCatalog`를 사용해 같은 선택지를 유지합니다.
  - `optionName`, `productName`, `coupangDisplayProductName`, `deliveryCompanyCode`, `invoiceNumber`, `isOverseas`는 raw field precedence를 기준으로 다시 파생됩니다.
- 이유:
  - 기존 구조는 “어떤 값을 어떤 컬럼에 넣을지”가 정규화 row에만 묶여 있어서, 쿠팡 원본 컬럼을 그대로 고르거나 옵션값 누락 케이스를 사후 복구하기가 어려웠습니다.
  - raw scalar map을 같이 유지하면, 컬럼 설정과 후속 파생 규칙을 같은 source 모델에서 재해석할 수 있고 archive도 동일한 UI를 공유할 수 있습니다.
- 남은 점:
  - archive의 synthetic rawFields는 live worksheet보다 원본 응답 복원도가 낮습니다.
  - 대형 nested payload 전체를 저장하는 구조는 아니므로, 이미지/HTML/contents/notices 계열은 여전히 rawFields 대상에서 제외됩니다.
- 검증:
  - `npm run check`
  - `npx vitest run --root . client/src/features/coupang/shipments/worksheet-config.test.ts client/src/features/coupang/shipments/shipment-column-presets.test.ts client/src/features/coupang/shipments/quick-collect-focus-controller.test.ts server/stores/work-data-coupang-shipment-worksheet-store.test.ts server/services/coupang/shipment-worksheet-view.test.ts`

## 2026-04-19 / 쿠팡 출고 컬럼 설정에 source key 기준 다운로드 매핑 추가

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `client/src/features/coupang/shipments/shipment-column-settings-panel.tsx`
  - `client/src/features/coupang/shipments/worksheet-config.ts`
  - `client/src/features/coupang/shipments/worksheet-config.test.ts`
  - `docs/change-log.md`
  - `docs/current-status.md`
- 변경 내용:
  - `컬럼 설정` 패널에서 각 열의 `다운로드 헤더`와 `source column`을 더 명확히 구분해서 보이도록 바꿨습니다.
  - source column 선택지는 `productName · 상품명`, `invoiceNumber · 송장번호`처럼 원본 key와 한글명을 함께 보여줍니다.
  - 각 열마다 `key명 적용` / `한글명 적용` 버튼을 추가해, 다운로드 헤더를 원본 key 또는 기존 한글명으로 바로 맞출 수 있게 했습니다.
  - source column을 바꿀 때 현재 헤더가 기본 key명 또는 기본 한글명이었다면, 새 source에 맞춰 헤더도 자연스럽게 따라오도록 맞췄습니다.
- 이유:
  - 기존 UI는 한글 컬럼명 중심이라, 사용자가 쿠팡에서 들여온 원본 column key 기준으로 어떤 값을 다운로드할지 판단하기 어려웠습니다.
- 검증:
  - `npx vitest run --root . client/src/features/coupang/shipments/worksheet-config.test.ts`
  - `npm run check`

## 2026-04-19 / 출고 빠른 수집(new_only) 동기 비용 축소

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `server/services/coupang/shipment-worksheet-service.ts`
  - `server/services/coupang/shipment-worksheet-collection.test.ts`
  - `docs/change-log.md`
  - `docs/current-status.md`
- 변경 내용:
  - `new_only` 빠른 수집은 이제 마지막 수집 시점 기준 24시간 겹침 구간으로 조회 시작일을 자동 축소합니다.
  - 빠른 수집 본문에서는 신규 worksheet row 저장만 먼저 수행하고, 클레임 조회와 주문/상품 상세 보강은 동기 경로에서 생략합니다.
  - 대신 기존처럼 `pending_after_collect` 후속 보강이 이어져, 상세/상품명/CS 상태는 백그라운드 refresh에서 채워집니다.
- 이유:
  - 기존 `new_only`는 신규만 저장할 뿐, 원격 조회는 선택 기간 전체를 다시 스캔하고 신규 행마다 상세/상품/클레임 API를 추가 호출해 체감 속도가 크게 느렸습니다.
- 남은 점:
  - 오래된 누락 주문을 다시 찾는 용도는 빠른 수집이 아니라 `증분 수집` 또는 `전체 수집`이 더 적합합니다.
- 검증:
  - `npx vitest run --root . server/services/coupang/shipment-worksheet-collection.test.ts`

## 2026-04-19 / 쿠팡 배송 시트 저장 핫픽스와 체크포인트 누적 저장

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `server/interfaces/coupang-shipment-worksheet-store.ts`
  - `server/services/coupang/shipment-worksheet-store.ts`
  - `server/services/coupang/shipment-worksheet-service.ts`
  - `server/services/coupang/shipment-worksheet-collection.test.ts`
  - `server/stores/work-data-coupang-shipment-worksheet-store.ts`
  - `server/stores/work-data-coupang-shipment-worksheet-store.test.ts`
  - `shared/coupang.ts`
  - `docs/change-log.md`
  - `docs/current-status.md`
- 변경 내용:
  - `coupang_shipment_rows` 저장은 이제 200행 단위 청크 쓰기로 나눠 처리합니다.
  - `setStoreSheet()`와 `upsertStoreRows()`는 같은 `storeId`에 대해 Postgres advisory transaction lock을 잡아 동시 collect/refresh/checkpoint 저장이 서로 엇갈리지 않게 했습니다.
  - 저장소 포트에 `upsertStoreRows()`를 추가해 `source_key` 기준 누적 저장 경로를 만들었고, `new_only` 빠른 수집은 상태 배치 종료 또는 신규 100행 누적 시 체크포인트 저장을 수행합니다.
  - collect DB 예외는 이제 `23505`, `23502`, 일반 쓰기 실패를 구분해 사용자 메시지와 시스템 로그 메타를 남깁니다.
  - `syncSummary`에는 `checkpointCount`, `checkpointPersistedCount`, `lastCheckpointAt`가 optional로 추가됩니다.
- 이유:
  - 기존 구조는 `delete -> 단일 대량 insert` 한 번으로 전체 시트를 다시 써서, 2천 건 이상에서 SQL 크기/파라미터 수/메모리 부담이 커지고 Cloud Run 인스턴스가 중간에 죽을 여지가 있었습니다.
  - 빠른 수집도 끝까지 완주해야만 결과가 남는 구조라, 중간 실패 시 앞에서 받은 신규 주문이 전혀 누적되지 않았습니다.
- 남은 점:
  - 이번 변경은 체크포인트 저장 기반과 메타데이터까지만 깔았습니다.
  - 사용자에게 각 행별 수집 진행 상황을 바로 보여주는 UI는 아직 별도 작업이 필요합니다.
- 검증:
  - `npm test -- server/services/coupang/shipment-worksheet-collection.test.ts server/stores/work-data-coupang-shipment-worksheet-store.test.ts`
  - `npm run check`

## 2026-04-19 / 쿠팡 API 기본 요청 스케줄러 완화

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `server/services/coupang/api-client.ts`
  - `docs/change-log.md`
- 변경 내용:
  - 쿠팡 API 요청 스케줄러의 기본 fallback 값을 `동시성 2 -> 4`, `요청 간격 250ms -> 100ms`로 조정했습니다.
  - 배포 환경에서 별도 env를 주지 않은 경우에도 빠른 수집, 송장 전송, 출고 보강 계열 요청이 덜 보수적으로 흘러가도록 맞췄습니다.
- 이유:
  - 출고 워크시트의 빠른 수집과 후속 상세 보강이 외부 API 왕복 수에 크게 좌우되는데, 기존 기본값이 너무 보수적이라 신규 주문 수집 체감 속도를 과하게 늦추고 있었습니다.
- 남은 점:
  - 실제 운영 트래픽에서 `429` 재시도 비율은 배포 후 로그로 추가 확인이 필요합니다.
- 검증:
  - `npx vitest run --root . server/services/coupang/api-client.test.ts`

## 2026-04-19 / 작업 상태 패널에 쿠팡 API backoff 표시 추가

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `shared/operations.ts`
  - `server/services/coupang/api-client.ts`
  - `server/routes/operations.ts`
  - `client/src/components/operation-toaster.tsx`
  - `server/services/coupang/api-client.test.ts`
  - `docs/change-log.md`
- 변경 내용:
  - 작업 상태 패널이 `/api/operations/runtime-status`를 주기적으로 조회해 쿠팡 API 요청 런타임 상태를 함께 표시하도록 했습니다.
  - 패널에서 현재 동시 실행 수, 대기열 크기, 기본 요청 간격, backoff 남은 시간을 볼 수 있습니다.
  - 서버는 쿠팡 요청 스케줄러의 런타임 스냅샷을 읽어 UI에 필요한 최소 상태만 노출합니다.
- 이유:
  - 대량 수집이나 송장 전송 중 지연이 생겼을 때, 사용자가 단순히 느리기만 한지, 대기열인지, 재시도 backoff인지 바로 구분할 수 있게 하기 위해서입니다.
- 남은 점:
  - 현재는 쿠팡 스케줄러만 표시합니다.
- 검증:
  - `npx vitest run --root . server/services/coupang/api-client.test.ts client/src/components/operation-toaster.test.ts`
  - `npm run check`

## 2026-04-17 / 출고 기본 조회의 live CS 자동 갱신 중단

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `server/services/coupang/shipment-worksheet-service.ts`
  - `docs/current-status.md`
  - `docs/structure-overview.md`
  - `docs/change-log.md`
- 변경 내용:
  - `GET /api/coupang/shipments/worksheet/view`는 이제 저장된 worksheet 스냅샷만 반환하고, 기본 조회 시 live CS 요약 재조회와 worksheet 재계산을 수행하지 않습니다.
  - live CS 재확인은 `worksheet/refresh`, `shipment_boxes` refresh, `customer_service` refresh, bulk resolve 직전 후보 refresh 같은 explicit 경로에만 남깁니다.
- 이유:
  - 출고 화면 기본 진입과 필터 변경마다 live CS 갱신이 붙으면서 응답이 느려지고, 대량 worksheet에서 화면 체감 속도를 악화시키고 있었습니다.

## 2026-04-17 / 송장 전송 대상 해석과 성공 상태 즉시 반영 보강

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/fulfillment-decision.ts`
  - `server/application/coupang/orders/service.ts`
  - `server/stores/work-data-coupang-shipment-worksheet-store.ts`
  - `docs/current-status.md`
  - `docs/structure-overview.md`
  - `docs/change-log.md`
- 변경 내용:
  - 출고 화면 상단 `송장 전송하기` 버튼을 기본 화면에서도 현재 필터 범위의 전송 가능 행 대상으로 동작하게 바꿨습니다. 선택 건 전송은 선택 action bar에서만 유지합니다.
  - 송장 전송 성공 시 worksheet patch 단계에서 `orderStatus`를 `DEPARTURE`로, `availableActions`를 `updateInvoice` 기준으로 함께 낙관 갱신해 직후 화면이 오래 `INSTRUCT` / `uploadInvoice`로 남는 현상을 줄였습니다.
  - stale/unknown CS 스냅샷이더라도 이미 송장 반영이 끝났거나 배송 단계로 넘어간 row는 더 이상 `재확인 필요`로만 분류하지 않도록 출고 판단 로직을 완화했습니다.
- 이유:
  - 상단 버튼이 사실상 선택 전송처럼 동작해 운영자가 기대한 “현재 조건의 전송 가능 건 일괄 전송”과 어긋나고 있었습니다.
  - 쿠팡 송장 전송 성공 직후에도 worksheet가 옛 상태를 오래 유지해 실제 전송 여부와 화면 판단이 계속 엇갈리는 문제가 있었습니다.

## 2026-04-15 / 출고 옵션명 컬럼 실제 옵션값 기준 고정

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `server/services/coupang/shipment-worksheet-service.ts`
  - `server/services/coupang/shipment-worksheet-collection.test.ts`
  - `docs/current-status.md`
  - `docs/change-log.md`
- 변경 내용:
  - `옵션명` 컬럼은 더 이상 주문 목록 응답의 노출 옵션 문자열을 사용하지 않고, `product detail.itemName -> order detail.optionName -> 기존 정상 optionName` 우선순위로만 채우도록 고정했습니다.
  - collect 단계에서 신규 행, 빈 `optionName`, 노출값과 섞인 `optionName`만 골라 최소 `order detail / product detail` 조회를 수행해, 수집 직후부터 옵션값이 실제 기준으로 맞춰지게 했습니다.
  - 실제 옵션값을 collect 시점에 가져오지 못하면 기존 정상 `optionName`은 유지하고, 기존 값도 없으면 `null`로 둡니다.
  - 회귀 테스트를 추가해 신규 collect 즉시 등록 옵션값 반영, collect 실패 시 빈값 유지, 혼합된 기존 옵션값 교정을 고정했습니다.
- 이유:
  - 최근 collect/refresh 분리 이후 같은 워크시트 안에서 어떤 행은 노출 옵션 문자열, 어떤 행은 실제 옵션값이 들어가 일관성이 깨지고 있었기 때문입니다.
- 남은 점:
  - 브라우저에서 실제 빠른 수집 직후 여러 주문 행의 옵션 컬럼이 시각적으로 일관된지까지는 아직 직접 확인하지 못했습니다.
- 검증:
  - `npx vitest run --root . server/services/coupang/shipment-worksheet-collection.test.ts`
  - `npm run check`

## 2026-04-15 / 셀픽주문번호 연속 증가 고정

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `server/services/coupang/shipment-worksheet-service.ts`
  - `server/services/coupang/shipment-worksheet-collection.test.ts`
  - `docs/current-status.md`
  - `docs/change-log.md`
- 변경 내용:
  - 추가 수집으로 새 주문이 들어올 때 `셀픽주문번호`의 마지막 4자리 시퀀스가 날짜별로 다시 시작되지 않고, 기존 워크시트의 마지막 번호 다음 값으로 계속 증가하도록 allocator 기준을 바꿨습니다.
  - 새 주문의 번호 prefix 날짜는 수집 시각이 아니라 실제 주문 시각 기준 `orderDateKey`를 사용하도록 맞췄습니다.
  - 회귀 테스트를 추가해 기존 최대 번호가 `0009`일 때 다음 날짜 신규 주문도 `0010`을 받는 동작을 고정했습니다.
- 이유:
  - 추가 수집 시 `셀픽주문번호`가 다시 초기화되면 송장 작업과 주문 추적 문맥이 끊겨 운영 혼선이 생기기 때문입니다.
- 남은 점:
  - 실제 운영 데이터에서 여러 스토어를 동시에 수집하는 동시성 충돌은 아직 직접 검증하지 못했습니다.
- 검증:
  - `npm exec vitest run --root . server/services/coupang/shipment-worksheet-collection.test.ts`
  - `npm run check`

## 2026-04-14 / 출고 컬럼 설정 복귀 경로 수정

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `client/src/features/coupang/shipments/page.tsx`
  - `docs/change-log.md`
- 변경 내용:
  - 출고 화면의 `워크시트 / 보관함 / 컬럼 설정` 탭 전환을 로컬 state만 바꾸는 방식에서, URL workspace state까지 함께 갱신하는 단일 경로로 묶었습니다.
  - 컬럼 설정의 `워크시트로 돌아가기` 버튼과 상단 탭 전환이 같은 핸들러를 사용하도록 맞췄습니다.
- 이유:
  - `컬럼 설정 -> 워크시트`로 돌아갈 때 로컬 탭 state만 바뀌고 URL의 `tab=settings`가 그대로 남아, route sync effect가 다시 `settings`로 되돌리는 문제가 있었습니다.
- 남은 점:
  - 브라우저에서 실제 클릭으로 `컬럼 설정 -> 워크시트`, `컬럼 설정 -> 보관함`을 직접 끝까지 검증하지는 못했습니다.
- 검증:
  - `npm run check`

## 2026-04-14 / 출고 수집-후속 보강 분리

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `shared/coupang.ts`
  - `shared/operations.ts`
  - `server/services/coupang/shipment-worksheet-service.ts`
  - `server/http/coupang/parsers.ts`
  - `server/http/handlers/coupang/shipments.ts`
  - `server/routes/coupang/shipments.ts`
  - `server/stores/work-data-coupang-shipment-worksheet-store.ts`
  - `server/services/coupang/shipment-worksheet-collection.test.ts`
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/shipment-prepare-flow.ts`
  - `client/src/features/coupang/shipments/shipment-prepare-flow.test.ts`
  - `docs/current-status.md`
  - `docs/structure-overview.md`
  - `docs/change-log.md`
- 변경 내용:
  - `collectShipmentWorksheet()`는 더 이상 자동 `상품준비중(markPreparing)`과 주문 상세/상품 상세/CS 상태 보강을 함께 수행하지 않습니다.
  - collect 응답은 worksheet 1차 반영을 우선 돌려주고, `syncSummary.completedPhases / pendingPhases / warningPhases`로 후속 보강 상태를 함께 기록합니다.
  - `/api/coupang/shipments/worksheet/refresh`를 추가해 `pending_after_collect`, `shipment_boxes`, `customer_service` scope 기준 후속 보강을 분리했습니다.
  - 출고 화면은 collect 성공 직후 화면을 먼저 갱신하고, pending phase가 있으면 refresh를 non-blocking으로 이어서 호출합니다.
  - `결제완료 -> 상품준비중`은 성공 후 `incremental collect`를 다시 기다리지 않고, 성공 행을 먼저 `INSTRUCT`로 낙관 반영한 뒤 targeted refresh를 비동기로 붙입니다.
  - refresh 후속 단계는 작업센터 operation에 `출고 후속 보강` action으로 남고, 경고가 있어도 선행 collect / prepare 성공 자체를 되돌리지는 않습니다.
- 이유:
  - 기존 출고 수집과 준비중 처리 체감 지연의 큰 원인이 `첫 응답 경로에 상세 보강/재수집을 함께 묶어 둔 구조`였기 때문입니다.
- 남은 점:
  - 브라우저에서 collect 직후 pending phase 표시와 background refresh 체감은 아직 직접 클릭 검증하지 못했습니다.
  - true background worker나 queue는 아직 도입하지 않았고, 현재는 클라이언트가 후속 refresh를 non-blocking으로 시작하는 구조입니다.
- 검증:
  - `npm run check`
  - `npm exec vitest run --root . server/services/coupang/shipment-worksheet-collection.test.ts`
  - `npm exec vitest run --root . client/src/features/coupang/shipments/shipment-prepare-flow.test.ts`

## 2026-04-14 / 상품준비중 선행 차단 제거

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/shipment-audit-missing.ts`
  - `client/src/features/coupang/shipments/shipment-prepare-flow.ts`
  - `client/src/features/coupang/shipments/shipment-audit-missing.test.ts`
  - `client/src/features/coupang/shipments/shipment-prepare-flow.test.ts`
  - `docs/current-status.md`
  - `docs/change-log.md`
- 변경 내용:
  - `결제완료 -> 상품준비중` 실행 전에 보던 `수집 누락 audit`는 유지하되, 누락 주문이 있어도 현재 worksheet에서 처리 가능한 주문은 계속 `상품준비중`으로 전달하도록 바꿨습니다.
  - `수집 누락 audit`는 7일 초과 범위를 받으면 내부적으로 7일 단위 요청으로 나눠 계속 확인하도록 바꿨습니다.
  - 결과 피드백에는 기존 실패 항목과 함께 `수집 누락` 상세를 같이 남기고, audit 다이얼로그도 계속 열 수 있게 유지했습니다.
  - `결제완료` 건수가 0일 때 버튼을 아예 막지 않고, 클릭 시 현재 화면 기준으로 왜 처리 대상이 없는지 경고가 뜨도록 바꿨습니다.
  - helper 테스트를 추가해 `누락이 있어도 진행`, `실패 상세 + 누락 상세 동시 표시`를 고정했습니다.
- 이유:
  - 실제 백엔드는 부분 성공을 허용하고 있었는데, 출고 화면만 선행 audit 때문에 전체를 막고 있어 운영 동선이 끊기고 있었습니다.
- 남은 점:
  - 브라우저에서 실제 클릭으로 audit 다이얼로그와 결과 피드백이 함께 어떻게 보이는지는 아직 직접 확인하지 못했습니다.
- 검증:
  - `npm exec vitest run --root . client/src/features/coupang/shipments/shipment-audit-missing.test.ts client/src/features/coupang/shipments/shipment-prepare-flow.test.ts server/services/coupang/order-service.test.ts`
  - `npm run check`
  - `git diff --check`

## 2026-04-13 / 상품준비중 처리 부분 성공 허용

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `server/application/coupang/orders/service.ts`
  - `server/services/coupang/order-service.test.ts`
  - `docs/current-status.md`
  - `docs/change-log.md`
- 변경 내용:
  - `상품준비중 처리`는 50건 배치 구조를 유지하되, 특정 배치가 예외로 실패하면 해당 배치 안의 주문을 단건으로 다시 시도하도록 바꿨습니다.
  - 아직 수집되지 않아 실패하는 주문은 실패 항목으로 남기고, 나머지 주문은 계속 `상품준비중` 처리합니다.
  - 부분 성공 동작을 order service 테스트로 고정했습니다.
- 이유:
  - 수집 누락 주문 몇 건 때문에 전체 준비중 처리가 중단되면 운영자가 이미 처리 가능한 주문까지 다시 골라야 했습니다.
- 남은 점:
  - 실제 쿠팡 API에서 어떤 에러 문구로 내려오는지는 환경별 차이가 있을 수 있습니다.
  - 브라우저에서 실제 출고 화면 버튼을 눌러 부분 성공 메시지까지 확인한 것은 아직 아닙니다.
- 검증:
  - `npm exec vitest run --root . server/services/coupang/order-service.test.ts`
  - `npm run check`

## 2026-04-13 / 빌드-배포 하드닝

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `vite.config.ts`
  - `.github/workflows/deploy-kikit-price-change.yml`
  - `.github/workflows/deploy-kikit-price-change-dev.yml`
  - `docs/deployment/cloud-run-branch-deployments.md`
  - `docs/deployment/cloud-run-smoke-check.md`
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
- 변경 내용:
  - Vite build에 vendor / route chunk 분리를 추가해 500k 초과 chunk warning을 제거했습니다.
  - GitHub Actions workflow 이름을 `Cloud Run Prod Deploy`, `Cloud Run Dev Deploy`로 정리했습니다.
  - Cloud Run 브랜치 배포 문서에 workflow 표시 이름을 추가하고, 별도 smoke check / rollback 문서를 만들었습니다.
  - 남은 CSS minify warning의 원인이 `react-data-grid/lib/styles.css`임을 확인하고 운영 문서에 기록했습니다.
- 이유:
  - 운영 배포 전에 빌드 경고, workflow 이름 혼선, smoke check 부재를 줄여야 개편 구조를 더 안전하게 올릴 수 있었습니다.
- 남은 점:
  - CSS minify warning은 현재 upstream dependency 이슈로 남아 있으며, 빌드를 막지는 않습니다.
  - 실제 Cloud Run console에서 smoke check와 rollback을 직접 실행한 것은 아닙니다.
- 검증:
  - `npm run check`
  - `npm run build`
  - `npm exec vitest run --root . client/src/pages/hub-navigation.test.ts client/src/lib/ops-handoff-links.test.ts client/src/pages/operation-center-recovery.test.ts`

## 2026-04-13 / 채널-설정 허브 구조 정리

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `client/src/pages/channels-hub.tsx`
  - `client/src/pages/settings-hub.tsx`
  - `client/src/pages/hub-navigation.ts`
  - `client/src/pages/hub-navigation.test.ts`
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
- 변경 내용:
  - 채널 허브를 `연결 상태 / 점검`, `원본 화면 진입`, `채널별 주요 도구`, `고급 / 레거시 화면` 순서로 재구성했습니다.
  - 설정 허브를 `연결 설정`, `운영 고급 도구`, `레거시 / 직접 진입` 순서로 재구성했습니다.
  - 허브 카드 설명과 empty state 문구를 operator 관점의 운영 문장으로 다시 맞췄습니다.
  - 섹션 구성은 `hub-navigation.ts` descriptor로 분리하고 테스트로 고정했습니다.
- 이유:
  - 기존 허브는 “어디로 들어가야 하는지”보다 “무엇이 있는지”가 먼저 보여 operator가 진입 위치를 다시 해석해야 했습니다.
- 남은 점:
  - 브라우저에서 실제 허브 카드 체감과 모바일 폭 확인은 아직 직접 검증하지 못했습니다.
  - 레거시 직접 진입은 유지하지만, 어떤 링크가 실제로 자주 쓰이는지는 추가 관찰이 필요합니다.
- 검증:
  - `npm run check`
  - `npm exec vitest run --root . client/src/pages/hub-navigation.test.ts client/src/lib/ops-handoff-links.test.ts client/src/pages/operation-center-recovery.test.ts`

## 2026-04-13 / 출고-CS-작업센터 연결 흐름 강화

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `client/src/lib/ops-handoff-links.ts`
  - `client/src/lib/ops-handoff-links.test.ts`
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/shipment-worksheet-overview.tsx`
  - `client/src/features/coupang/shipments/shipment-decision-drawer.tsx`
  - `client/src/features/coupang/shipments/fulfillment-drawer-controller.tsx`
  - `client/src/pages/operation-center.tsx`
  - `client/src/pages/cs-hub.tsx`
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
- 변경 내용:
  - 출고와 작업센터가 `tab / storeId / scope / decisionStatus / query / status / level / q / slowOnly / logId` 기준 deep-link를 읽고 다시 URL에 반영하도록 정리했습니다.
  - 출고 요약과 Drawer에서 `보류 / 차단 / 재확인 필요` 상태에 맞는 다음 이동 경로를 `CS 허브` 또는 `작업센터` 기준으로 안내합니다.
  - 작업센터 쿠팡 operation 상세에서 payload 기반 주문 식별자를 추출해 `관련 출고 보기`, `CS 허브 열기`로 이어지게 했습니다.
  - CS 허브는 허브 역할을 유지하면서 `focus / source` 문맥 안내와 복귀 링크를 함께 보여주도록 보강했습니다.
- 이유:
  - 운영자가 예외 주문, CS 영향, 복구 로그를 따로 기억해서 오가던 비용을 줄이고 현재 상태에 맞는 다음 화면을 더 빨리 판단하게 하려는 목적입니다.
- 남은 점:
  - 브라우저에서 실제 deep-link 이동과 workspace tab 체감은 아직 직접 검증하지 못했습니다.
  - `관련 출고 보기`는 주문 식별자 기반 필터 진입이며 특정 행을 자동으로 여는 수준까지는 확장하지 않았습니다.
- 검증:
  - `npm run check`
  - `npm exec vitest run --root . client/src/lib/ops-handoff-links.test.ts client/src/features/coupang/shipments/quick-collect-focus-controller.test.ts client/src/pages/operation-center-recovery.test.ts`

## 2026-04-13 / 운영 manual regression 문서화

- 변경 유형:
  - 문서
- 관련 파일:
  - `docs/qa/manual-fulfillment-regression.md`
  - `docs/qa/work-center-recovery-scenarios.md`
  - `docs/current-status.md`
  - `docs/change-log.md`
- 변경 내용:
  - dashboard -> fulfillment 진입, 빠른 수집 집중 보기, 혼합 선택 자동 제외, fulfillment drawer 흐름을 manual regression 시나리오로 정리했습니다.
  - work-center recovery 흐름을 `복구 묶음 -> 리스트 -> 상세 -> 재시도` 기준으로 문서화했습니다.
  - 각 시나리오별 기대 결과, 위험도(high / medium / low), 자동화 테스트 후보를 분리했습니다.
- 이유:
  - 이번 차수에서 고정한 운영 구조를 사람이 반복 검증 가능한 자산으로 남길 필요가 있었습니다.
- 남은 점:
  - 문서 안의 `추정` 표기는 아직 브라우저에서 직접 밟지 못한 기대 결과입니다.
- 검증:
  - 문서 내용은 2026-04-13 기준 `codex/dev` 구현과 이번 차수의 타입체크/단위 테스트 결과를 기준으로 작성했습니다.

## 2026-04-13 / 작업센터 recovery-first 강화

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `client/src/pages/operation-center.tsx`
  - `client/src/pages/operation-center-recovery.ts`
  - `client/src/pages/operation-center-operation-detail-sections.tsx`
  - `client/src/pages/operation-center-recovery.test.ts`
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
- 변경 내용:
  - 작업센터 목록을 `즉시 재시도 / 원인 확인 / 진행 관찰 / 완료` lane 기준으로 읽히게 바꿨습니다.
  - 같은 성격 실패를 상단 `복구 묶음`으로 그룹핑해 operator가 먼저 볼 복구 단위를 요약합니다.
  - 상세 패널은 `지금 할 일`, `영향 범위`, foldout detail section 순서로 조치 중심 흐름을 갖도록 정리했습니다.
  - 작업센터 상세 foldout 렌더를 `operation-center-operation-detail-sections.tsx`로 분리했습니다.
- 이유:
  - 기존 작업센터는 로그 정보는 많았지만 operator가 무엇을 먼저 복구해야 하는지 판단하는 비용이 높았습니다.
- 남은 점:
  - 브라우저 클릭 기반의 실제 체감 검증은 아직 남아 있습니다.
  - failure grouping은 현재 프론트 계산 기준이며, 백엔드 집계 확장은 이번 차수 범위에 포함하지 않았습니다.
- 검증:
  - `npm run check`
  - `npm exec vitest run --root . client/src/features/coupang/shipments/quick-collect-focus.test.ts client/src/features/coupang/shipments/quick-collect-focus-controller.test.ts client/src/pages/operation-center-recovery.test.ts`

## 2026-04-13 / 출고 coordinator render 분해

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/fulfillment-shell.tsx`
  - `client/src/features/coupang/shipments/fulfillment-toolbar.tsx`
  - `client/src/features/coupang/shipments/fulfillment-summary-bar.tsx`
  - `client/src/features/coupang/shipments/fulfillment-selection-controller.tsx`
  - `client/src/features/coupang/shipments/fulfillment-grid-controller.tsx`
  - `client/src/features/coupang/shipments/fulfillment-drawer-controller.tsx`
  - `client/src/features/coupang/shipments/quick-collect-focus-controller.ts`
  - `client/src/features/coupang/shipments/quick-collect-focus-controller.test.ts`
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
- 변경 내용:
  - 출고 화면의 render tree를 shell, toolbar, summary, selection, grid, drawer controller로 분리했습니다.
  - 빠른 수집 집중 보기의 active sheet / visible rows 계산을 `quick-collect-focus-controller.ts`로 분리했습니다.
  - `page.tsx`는 상태, query, action coordinator 역할을 유지하고, 화면 조립 책임은 새 controller들로 이동했습니다.
- 이유:
  - 운영 구조를 고정하려면 `page.tsx` 안에 섞여 있던 render 조립과 view state 계산을 먼저 분리해 책임 경계를 안정화할 필요가 있었습니다.
- 남은 점:
  - `page.tsx`에는 여전히 network action orchestration과 많은 handler가 남아 있습니다.
  - 브라우저 클릭 기반 수동 검증은 아직 남아 있습니다.
- 검증:
  - `npm run check`
  - `npm exec vitest run --root . client/src/features/coupang/shipments/quick-collect-focus.test.ts client/src/features/coupang/shipments/quick-collect-focus-controller.test.ts`

## 2026-04-12 / 작업센터 상세 티켓 샘플 로그

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `shared/operations.ts`
  - `shared/operations.test.ts`
  - `server/http/coupang/tracked-actions.ts`
  - `server/http/coupang/tracked-actions.test.ts`
  - `server/http/handlers/coupang/orders.ts`
  - `server/http/handlers/coupang/shipments.ts`
  - `server/http/handlers/coupang/shipments.test.ts`
  - `client/src/pages/operation-center.tsx`
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
- 변경 내용:
  - 쿠팡 배치 작업 결과에 주문 단위 티켓 샘플을 최대 5건까지 기록하도록 확장했습니다.
  - 우선순위는 `실패 -> 경고 -> 건너뜀 -> 성공`입니다.
  - 메인 작업 목록은 여전히 요약만 유지하고, 상세 패널에서만 티켓 샘플을 노출합니다.
  - 수집, 상품준비중 처리, 송장 업로드/수정 결과에 주문 식별자와 짧은 상태 메시지를 남깁니다.
- 이유:
  - 운영자가 원본 payload를 열지 않고도 어떤 주문이 실제로 처리됐는지 확인할 수 있어야 했습니다.
- 남은 점:
  - 최대 5건만 저장하는 capped sample이며, 전체 감사 로그는 아닙니다.
  - 브라우저에서 실제 클릭 기반 수동 검증은 아직 남아 있습니다.
- 검증:
  - `npm run check`
  - `npx vitest run --root . shared/operations.test.ts server/http/coupang/tracked-actions.test.ts server/http/handlers/coupang/shipments.test.ts`
  - `npm run build`

## 2026-04-12 / 출고 컬럼 보기 프리셋

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/shipment-worksheet-panel.tsx`
  - `client/src/features/coupang/shipments/shipment-column-settings-panel.tsx`
  - `client/src/features/coupang/shipments/shipment-column-presets.ts`
  - `client/src/features/coupang/shipments/shipment-column-presets.test.ts`
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
- 변경 내용:
  - 워크시트에 `작업 보기`, `송장 입력 보기`, `전체 열 보기` 프리셋을 추가했습니다.
  - 기존 persisted 컬럼 설정은 자동으로 덮어쓰지 않고, 사용자가 프리셋을 명시적으로 적용할 때만 바뀝니다.
  - `송장 입력 보기` 프리셋을 적용하면 워크시트 모드도 `invoice`로 함께 전환합니다.
- 이유:
  - 기본 워크시트가 너무 넓어서 일반 데스크톱 폭에서 가로 스크롤 부담이 컸습니다.
- 남은 점:
  - 합성 컬럼 기반의 2차 압축은 아직 남아 있습니다.
  - 브라우저에서 실제 프리셋 전환 체감 검증은 아직 남아 있습니다.
- 검증:
  - `npm run check`
  - `npx vitest run client/src/features/coupang/shipments/shipment-column-presets.test.ts client/src/features/coupang/shipments/quick-collect-focus.test.ts client/src/features/coupang/shipments/fulfillment-filter-summary.test.ts client/src/features/coupang/shipments/fulfillment-decision.test.ts`

## 2026-04-12 / 빠른 수집 직후 신규 주문 우선 보기

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `shared/coupang.ts`
  - `server/services/coupang/shipment-worksheet-service.ts`
  - `server/stores/work-data-coupang-shipment-worksheet-store.ts`
  - `server/services/coupang/shipment-worksheet-collection.test.ts`
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/quick-collect-focus.ts`
  - `client/src/features/coupang/shipments/quick-collect-focus.test.ts`
  - `client/src/features/coupang/shipments/shipment-worksheet-overview.tsx`
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
- 변경 내용:
  - `new_only` 빠른 수집 응답에 `insertedSourceKeys`를 포함시켰습니다.
  - 빠른 수집 후 실제로 추가된 주문이 있으면 워크시트가 그 주문만 임시로 먼저 보여줍니다.
  - 이 집중 보기는 필터 변경, 새로고침, 탭 이동 시 자동으로 해제됩니다.
- 이유:
  - 빠른 수집 후 신규 주문이 기존 목록에 섞여 보이면 운영자가 바로 확인하기 어려웠습니다.
- 남은 점:
  - 브라우저에서 실제 집중 보기 배너와 복귀 흐름 수동 검증이 남아 있습니다.
- 검증:
  - `npm run check`
  - `npm run build`
  - `npx vitest run --root . server/services/coupang/shipment-worksheet-collection.test.ts client/src/features/coupang/shipments/quick-collect-focus.test.ts client/src/features/coupang/shipments/fulfillment-filter-summary.test.ts client/src/features/coupang/shipments/fulfillment-decision.test.ts`

## 2026-04-12 / 출고 상단 구조 및 선택 흐름 정리

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/fulfillment-filter-summary.ts`
  - `client/src/features/coupang/shipments/fulfillment-filter-summary.test.ts`
  - `client/src/features/coupang/shipments/shipment-selection-summary.ts`
  - `client/src/features/coupang/shipments/shipment-selection-summary.test.ts`
  - `client/src/features/coupang/shipments/shipment-selection-action-bar.tsx`
  - `client/src/features/coupang/shipments/shipment-base-filters.tsx`
  - `client/src/features/coupang/shipments/shipment-worksheet-overview.tsx`
  - `client/src/features/coupang/shipments/shipment-worksheet-panel.tsx`
  - `client/src/features/coupang/shipments/shipment-archive-panel.tsx`
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
- 변경 내용:
  - 메인 필터 축을 `출고 판단`으로 고정하고, `작업 대상 / 배송 이후 / 예외·클레임 / 전체`는 보조 범위로 내렸습니다.
  - `송장 상태 / 출력 상태 / 주문 상태`는 접힌 세부 필터로 이동했습니다.
  - 상단 영역을 `기본 필터`, `출고 판단 요약`, `선택 일괄 작업`, `워크시트/보관함 패널` 컴포넌트로 나눴습니다.
  - 혼합 선택 상태에서도 실행 가능한 행만 자동 제외 후 진행하도록 선택 바 흐름을 바꿨습니다.
- 이유:
  - 기존 화면은 서로 다른 필터 축이 같은 레벨에 놓여 있어 운영자가 무엇을 먼저 봐야 하는지 이해하기 어려웠습니다.
- 남은 점:
  - `page.tsx`는 여전히 큰 coordinator 파일입니다.
  - 그리드 wiring과 Drawer 상세 조립 분리는 다음 단계입니다.
- 검증:
  - `npm run check`
  - `npm run build`
  - `npx vitest run client/src/features/coupang/shipments/shipment-selection-summary.test.ts client/src/features/coupang/shipments/fulfillment-filter-summary.test.ts client/src/features/coupang/shipments/fulfillment-decision.test.ts`

## 2026-04-12 / 운영 데스크 IA 1차

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `client/src/App.tsx`
  - `client/src/lib/workspace-tabs.ts`
  - `client/src/lib/coupang-navigation.ts`
  - `client/src/pages/dashboard.tsx`
  - `client/src/pages/fulfillment.tsx`
  - `client/src/pages/cs-hub.tsx`
  - `client/src/pages/channels-hub.tsx`
  - `client/src/pages/operation-center.tsx`
  - `client/src/pages/settings-hub.tsx`
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
  - `docs/decisions/2026-04-12-syncdesk-operation-desk-ia.md`
- 변경 내용:
  - 상단 주요 메뉴를 `대시보드`, `출고`, `CS`, `채널`, `작업센터`, `설정`으로 재구성했습니다.
  - 대시보드를 채널 런처가 아니라 오늘의 운영 시작점으로 재배치했습니다.
  - 작업센터를 로그 화면이 아니라 실패 작업 복구 공간으로 재정의했습니다.
  - 채널/설정 아래로 레거시 도구와 direct route 진입점을 내렸습니다.
- 이유:
  - 제품 인상을 채널별 관리자 콘솔이 아니라 `출고 / CS / 복구` 중심 운영 데스크로 바꾸기 위해서입니다.
- 남은 점:
  - CS는 아직 허브 + deep-link 구조이며, 통합 실행 화면은 아닙니다.
  - 브라우저 클릭 기반 end-to-end 수동 검증은 아직 남아 있습니다.
- 검증:
  - `npm run check`
  - `npm run build`
  - `npx vitest run client/src/lib/workspace-tabs.test.ts client/src/lib/coupang-navigation.test.ts client/src/features/coupang/shipments/fulfillment-decision.test.ts`

## 2026-04-12 / 작업센터 및 작업 상태 패널 한국어 정리

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `client/src/components/operation-toaster.tsx`
  - `client/src/pages/operation-center.tsx`
  - `client/index.html`
  - `client/src/features/coupang/shipments/fulfillment-filter-summary.ts`
  - `client/src/features/coupang/shipments/fulfillment-filter-summary.test.ts`
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
- 변경 내용:
  - 작업 상태 패널의 상태 라벨, 버튼, 빈 상태 문구를 한국어로 정리했습니다.
  - 작업센터의 메트릭, 필터, 목록, 상세 패널, 티켓 상세 레이블을 한국어로 정리했습니다.
  - 출고 범위 라벨과 현재 적용 조건 토큰도 한국어 레이블로 다시 맞췄습니다.
  - 문서와 브라우저 스크린샷 기준으로 `KIKIT SyncDesk`, `출고`, `작업센터`, `작업 상태` 패널이 현재 한국어로 렌더되는 것을 확인했습니다.
- 이유:
  - 운영 데스크 개편 이후에도 일부 사용자 노출 문자열이 깨진 인코딩 또는 혼합 언어 상태로 남아 있어 읽기 흐름을 방해했습니다.
- 남은 점:
  - 완전한 클릭 기반 수동 검증은 아직 남아 있습니다.
- 검증:
  - `npm run check`
  - `npm run build`
  - `npx vitest run client/src/features/coupang/shipments/fulfillment-filter-summary.test.ts`
  - Chrome headless fresh profile 스크린샷으로 `출고`, `작업센터`, `작업 상태` 패널 렌더 확인
