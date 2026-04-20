# Change Log

이 문서는 구현이 실제 코드와 문서에 함께 반영된 변경만 기록합니다.

## 2026-04-20 / 쿠팡 기준 집계와 Active 작업 목록 분리

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `shared/coupang.ts`
  - `shared/schema.ts`
  - `server/interfaces/coupang-shipment-worksheet-store.ts`
  - `server/services/shared/work-data-db.ts`
  - `server/stores/work-data-coupang-shipment-worksheet-store.ts`
  - `server/http/coupang/parsers.ts`
  - `server/services/coupang/shipment-worksheet-service.ts`
  - `server/services/coupang/shipment-worksheet-view.ts`
  - `server/services/coupang/shipment-worksheet-view.test.ts`
  - `server/services/coupang/shipment-worksheet-service-view-read.test.ts`
  - `server/services/coupang/shipment-worksheet-collection.test.ts`
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/types.ts`
  - `client/src/features/coupang/shipments/worksheet-config.ts`
  - `client/src/features/coupang/shipments/quick-collect-focus-controller.ts`
  - `client/src/features/coupang/shipments/shipment-worksheet-overview.tsx`
  - `client/src/features/coupang/shipments/fulfillment-grid-controller.tsx`
  - `client/src/index.css`
  - `docs/current-status.md`
  - `docs/change-log.md`
- 변경 내용:
  - worksheet 저장 구조를 `mirrorItems / activeItems / archiveItems` 3계층으로 고정하고, sheet 저장소와 DB schema에 `mirror_items_json`을 추가했습니다.
  - `worksheet/view` 응답은 이제 `datasetMode`, `mirrorTotalRowCount`, `mirrorFilteredRowCount`, `activeTotalRowCount`, `activeFilteredRowCount`, `activeExclusionCounts`를 함께 반환합니다.
  - 쿠팡 기준 집계(`priorityCounts / pipelineCounts / issueCounts / orderCounts / missingInCoupangCount`)는 `mirrorItems` 기준으로 계산하고, 작업용 지표(`scopeCounts / decisionCounts / invoiceReadyCount / invoiceCounts / outputCounts`)는 `activeItems` 기준으로 유지합니다.
  - 기본 작업 표는 계속 `active` 목록으로 열리지만, 상단 `먼저 확인 / 배송 처리 / 이슈 필터` 카드를 누르면 표를 `mirror` 모드로 전환해 카드 숫자와 목록 건수가 맞도록 바꿨습니다.
  - `mirror` 목록에서 `active` 제외 행은 `isVisibleInActive=false`, `excludedFromActiveReason`을 함께 내려주고, UI에서는 읽기 전용 + 강조선 + 상세 패널의 `active 제외 사유`로 표시합니다.
  - `quick-collect` fallback 시트도 새 응답 shape를 맞추도록 보강해 `datasetMode=active`와 mirror/active 카운트 필드를 함께 채우게 했습니다.
  - collect/full refresh 경로는 먼저 `mirrorItems`를 갱신하고, 완료 취소/반품·쿠팡 미조회 같은 자동보관 규칙은 그 다음 `active/archive` 파생 단계에서만 적용하도록 정리했습니다.
- 이유:
  - `return_completed / cancel_completed / not_found_in_coupang` 같은 자동보관 규칙 때문에 실제 작업 목록은 의도적으로 쿠팡 전체 집합보다 작아질 수 있고, 그 상태로 카드 숫자를 active 기준으로 계산하면 쿠팡 숫자와 계속 어긋나기 때문입니다.
  - 카드 숫자는 쿠팡 기준 정합을 맞추고, 기본 표는 실제 작업 가능한 주문만 보여주려면 두 분모를 구조적으로 분리해야 했습니다.
- 남은 점:
  - 브라우저에서 실제 쿠팡 카드 숫자와 live 화면 숫자를 수동 대조하는 검증은 아직 하지 못했습니다. 이 부분은 `추정`이 남아 있습니다.
- 검증:
  - `npx tsc --noEmit --pretty false`
  - `npx vitest run --root . server/services/coupang/shipment-worksheet-view.test.ts server/services/coupang/shipment-worksheet-service-view-read.test.ts server/stores/work-data-coupang-shipment-worksheet-store.test.ts`
  - `npx vitest run --root . server/services/coupang/shipment-worksheet-collection.test.ts server/services/coupang/shipment-worksheet-archive.test.ts`
  - `npx vitest run --root . client/src/features/coupang/shipments/shipment-audit-missing.test.ts client/src/features/coupang/shipments/shipment-prepare-flow.test.ts`

## 2026-04-20 / 쿠팡 누락 검수 자동 반영 전환

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `shared/coupang.ts`
  - `server/services/coupang/shipment-worksheet-service.ts`
  - `server/services/coupang/shipment-worksheet-audit-missing.test.ts`
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/shipment-audit-missing.ts`
  - `client/src/features/coupang/shipments/shipment-audit-missing-dialog.tsx`
  - `client/src/features/coupang/shipments/shipment-audit-missing.test.ts`
  - `client/src/features/coupang/shipments/shipment-prepare-flow.ts`
  - `client/src/features/coupang/shipments/shipment-prepare-flow.test.ts`
  - `docs/current-status.md`
  - `docs/change-log.md`
- 변경 내용:
  - `worksheet/audit-missing`는 더 이상 단순 비교 결과를 돌려주지 않고, live `ACCEPT/INSTRUCT` 주문을 읽은 뒤 정상 행은 바로 worksheet에 자동 반영하도록 바꿨습니다.
  - audit 결과는 `autoAppliedCount / restoredCount / exceptionCount / hiddenInfoCount`와 `autoAppliedItems / exceptionItems / hiddenItems`로 재구성했습니다.
  - 이미 worksheet에 있던 정상 행은 상태만 자동 갱신하고, worksheet에 없던 정상 행은 기존 row 생성 경로를 재사용해 자동 추가하거나 보관함에서 자동 복구합니다.
  - 충돌, 식별 불완전, hydration 실패, 클레임/차단 이슈만 `exceptionItems.reasonCode`로 남기고, 현재 뷰 숨김은 정보용 섹션으로만 내렸습니다.
  - 출고 화면은 수동 검수와 `new_only` 후속 auto audit 모두에서 `예외 > 0`일 때만 다이얼로그를 자동으로 열고, 정상 자동 반영만 있었던 경우에는 성공 피드백만 남기도록 바꿨습니다.
  - `결제완료 -> 상품준비중` 흐름은 audit 경고 기준을 `exceptionCount`로 좁혀, 자동 반영/숨김 정보 때문에 warning 취급하지 않게 했습니다.
- 이유:
  - 정상 상태 변화와 복구 가능한 누락 행까지 사람이 직접 보게 하면 검수창이 잡음이 많아지고 실제로 대응해야 할 예외가 묻혔기 때문입니다.
  - 현재 worksheet와 보관함을 audit 시점에 바로 보정해 줘야 `상품준비중 처리`와 후속 작업이 실제 화면 기준과 더 잘 맞습니다.
- 남은 점:
  - 브라우저에서 실제 모달과 토스트의 체감 흐름은 아직 직접 확인하지 못했습니다. 이 부분은 `추정`이 남아 있습니다.
- 검증:
  - `npx tsc --noEmit --pretty false`
  - `npx vitest run --root . server/services/coupang/shipment-worksheet-audit-missing.test.ts client/src/features/coupang/shipments/shipment-audit-missing.test.ts client/src/features/coupang/shipments/shipment-prepare-flow.test.ts`

## 2026-04-20 / 쿠팡 미조회 예외 포함 30일 정합 보강

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `shared/coupang.ts`
  - `server/interfaces/coupang-shipment-worksheet-store.ts`
  - `server/stores/work-data-coupang-shipment-worksheet-store.ts`
  - `server/services/coupang/shipment-worksheet-service.ts`
  - `server/services/coupang/shipment-worksheet-view.ts`
  - `server/services/coupang/shipment-worksheet-view.test.ts`
  - `server/services/coupang/shipment-worksheet-collection.test.ts`
  - `server/services/coupang/shipment-worksheet-service-view-read.test.ts`
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/shipment-worksheet-overview.tsx`
  - `client/src/features/coupang/shipments/shipment-archive-panel.tsx`
  - `client/src/features/coupang/shipments/shipment-archive-panel.test.tsx`
  - `docs/current-status.md`
  - `docs/change-log.md`
- 변경 내용:
  - `CoupangShipmentWorksheetRow`에 `missingInCoupang`, `missingDetectedAt`, `missingDetectionSource`, `lastSeenOrderStatus`, `lastSeenIssueSummary`를 추가해 `쿠팡 미조회`를 archive reason만이 아니라 row 메타로도 추적하게 했습니다.
  - `worksheet/view` 응답에 `missingInCoupangCount`, `exceptionCounts.notFoundInCoupang`를 추가했고, 메인 배송 카드 분모에서는 `missingInCoupang` row를 제외하도록 projection을 분리했습니다.
  - `syncMode="full"`은 최근 30일 authoritative mirror를 다시 수집한 뒤, 기존 active row 중 live Coupang 상세에서 `item === null`로 확인된 주문을 `not_found_in_coupang` 사유로 보관함으로 이동시키도록 보강했습니다.
  - archive 실패 시에는 row를 삭제하지 않고 `missingInCoupang` 메타만 남겨 경고 상태로 유지합니다.
  - 예전에 `쿠팡 미조회 제외`로 보관된 row가 다시 live 수집 결과에 나타나면 archive에서 제거하고 active worksheet로 자동 복귀시키도록 store restore 경로를 추가했습니다.
  - 출고 허브에는 `예외 추적` 카드와 `쿠팡 미조회 n건 보기` CTA를 추가해 보관함으로 바로 이동할 수 있게 했고, 상세 패널/보관함 row에는 마지막 상태와 감지 시각을 함께 표시하도록 보강했습니다.
- 이유:
  - authoritative mirror 기준 숫자는 쿠팡 배송관리와 맞추되, 우리 DB에는 있었지만 쿠팡 현재 목록에서는 사라진 주문을 조용히 버리지 않고 예외로 추적해야 했기 때문입니다.
  - 수동 `미조회 정리`만으로는 30일 재동기화 기준 정합과 예외 추적이 분리되어 운영자가 숫자와 예외를 함께 이해하기 어려웠기 때문입니다.
- 남은 점:
  - `쿠팡 미조회` 예외 카운트는 현재 `보관함 + active row 메타`를 합산한 값이고, 별도 전용 예외 목록 화면은 아직 없습니다.
  - 브라우저에서 실제 보관함/상세 패널 문구를 끝까지 수동 확인하지는 못했습니다. 이 부분은 `추정`이 남아 있습니다.
- 검증:
  - `npx vitest run --root . server/services/coupang/shipment-worksheet-view.test.ts`
  - `npx vitest run --root . server/services/coupang/shipment-worksheet-service-view-read.test.ts`
  - `npx vitest run --root . server/services/coupang/shipment-worksheet-collection.test.ts`

## 2026-04-20 / 쿠팡 배송관리 메인 분모 정합 보강

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `shared/coupang.ts`
  - `server/http/coupang/parsers.ts`
  - `server/services/coupang/shipment-worksheet-view.ts`
  - `server/services/coupang/shipment-worksheet-view.test.ts`
  - `server/services/coupang/shipment-worksheet-service.ts`
  - `server/services/coupang/shipment-worksheet-service-view-read.test.ts`
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/worksheet-config.ts`
  - `client/src/features/coupang/shipments/shipment-base-filters.tsx`
  - `client/src/features/coupang/shipments/shipment-worksheet-overview.tsx`
  - `client/src/features/coupang/shipments/quick-collect-focus-controller.ts`
  - `client/src/features/coupang/shipments/fulfillment-filter-summary.ts`
  - `client/src/features/coupang/shipments/fulfillment-filter-summary.test.ts`
  - `client/src/lib/ops-handoff-links.ts`
  - `client/src/lib/ops-handoff-links.test.ts`
  - `docs/current-status.md`
  - `docs/change-log.md`
- 변경 내용:
  - `worksheet/view` query에 `createdAtFrom`, `createdAtTo`를 추가하고, 서버 projection이 실제로 날짜 범위를 먼저 적용한 뒤 카드·scope·목록 집계를 계산하도록 바꿨습니다.
  - 따라서 `totalRowCount`, `scopeCounts`, `priorityCounts`, `pipelineCounts`, `issueCounts`, `decisionCounts`가 모두 같은 기간 분모를 공유합니다.
  - `collect` / `worksheet/view` 응답에는 `coverageCreatedAtFrom`, `coverageCreatedAtTo`, `isAuthoritativeMirror`, `lastFullSyncedAt`를 추가했고, coverage 의미를 누적 범위가 아니라 `마지막 성공한 쿠팡 기준 30일 재동기화 범위`로 고정했습니다.
  - 메인 출고 화면의 기본 필터는 `최근 30일 + 전체 배송관리(all)`로 바꿨고, React Query key와 view URL 모두 날짜 범위를 포함하도록 맞췄습니다.
  - 상단 기본 필터에는 `오늘 / 지난 7일 / 지난 30일` 기간 프리셋을 추가했습니다.
  - `dispatch_active / post_dispatch / claims`는 메인 기준이 아니라 `보조 작업 보기`로만 노출하고, 기본 scope를 더 이상 `dispatch_active`에 두지 않습니다.
  - `syncMode="full"`은 이제 서버가 `최근 30일 + 전체 배송 상태 + 전체 클레임/CS`로 강제 정규화하는 `쿠팡 기준 재동기화` 의미만 가지도록 바꿨습니다.
  - `syncMode="incremental"`은 더 이상 자동으로 `full`로 승격되지 않고, 30일 미러 유지용 겹침 구간 `증분 갱신` 의미로만 남겼습니다.
  - 기본 메인 보기(`출고 / 전체 배송관리 / 추가 필터 없음`)에서 authoritative 30일 미러가 없으면, 상단 카드/행동 큐 숫자를 확정값처럼 쓰지 않고 자동으로 `쿠팡 기준 재동기화`를 다시 시작하도록 바꿨습니다.
  - 자동 재동기화가 돌 때는 메인 허브에 경고 배너를 띄우고, 부분 집계 숫자는 `재동기화 중` 상태로만 보여 주도록 바꿨습니다.
  - 행동 큐는 계속 남기되 `보조 작업 큐`로 설명을 낮춰, 메인 상태 기준이 배송 처리/이슈 필터라는 점을 더 분명히 했습니다.
- 이유:
  - 날짜를 바꿔도 메인 숫자 분모가 그대로면 쿠팡 배송관리와 같은 기준으로 읽을 수 없고, 빠른 수집 직후 부분 집합 숫자로 오해할 여지가 컸기 때문입니다.
  - 내부 작업 scope와 메인 배송관리 기준을 분리하지 않으면 `작업 대상` 숫자가 메인 전체 숫자처럼 읽히는 문제가 계속 남기 때문입니다.
- 남은 점:
  - 현재 구현은 별도 신규 미러 테이블을 만들지 않고 기존 worksheet 저장소를 `쿠팡 배송관리 미러 캐시`로 재사용합니다. 이 구조 자체가 장기적으로 충분한지는 추가 검토가 필요합니다.
  - 브라우저에서 실제 쿠팡 화면 숫자와 샘플 50~100건을 대조하는 수동 검증은 아직 하지 못했습니다. 이 부분은 `추정`이 남아 있습니다.
- 검증:
  - `npx tsc --noEmit --pretty false`
  - `npx vitest run --root . server/services/coupang/shipment-worksheet-view.test.ts server/services/coupang/shipment-worksheet-service-view-read.test.ts client/src/lib/ops-handoff-links.test.ts client/src/features/coupang/shipments/fulfillment-filter-summary.test.ts`
  - `npx vitest run --root . client/src/features/coupang/shipments/quick-collect-focus.test.ts client/src/features/coupang/shipments/quick-collect-focus-controller.test.ts`

## 2026-04-20 / 쿠팡 기준 정합성 재설계

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `shared/coupang.ts`
  - `shared/coupang-status.ts`
  - `server/http/coupang/parsers.ts`
  - `server/services/coupang/shipment-worksheet-view.ts`
  - `server/services/coupang/shipment-worksheet-view.test.ts`
  - `server/services/coupang/shipment-worksheet-service.ts`
  - `client/src/lib/coupang-order-status.ts`
  - `client/src/lib/coupang-order-status.test.ts`
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/types.ts`
  - `client/src/features/coupang/shipments/worksheet-config.ts`
  - `client/src/features/coupang/shipments/quick-collect-focus.ts`
  - `client/src/features/coupang/shipments/quick-collect-focus-controller.ts`
  - `client/src/features/coupang/shipments/fulfillment-filter-summary.ts`
  - `client/src/features/coupang/shipments/shipment-worksheet-overview.tsx`
  - `client/src/features/coupang/shipments/worksheet-row-helpers.tsx`
  - `client/src/features/coupang/shipments/shipment-hub-side-panel.tsx`
  - `client/src/features/coupang/shipments/coupang-status-view.ts`
  - `docs/current-status.md`
  - `docs/change-log.md`
- 변경 내용:
  - 쿠팡 출고 worksheet row와 view 응답에 `rawOrderStatus`, `shippingStage`, `issueStage`, `priorityBucket`, `pipelineBucket`, `isDirectDelivery`, `syncSource`, `statusDerivedAt`, `statusMismatchReason` 정규화 상태 필드를 추가했습니다.
  - `priorityCard`, `pipelineCard`는 호환용 alias로만 남기고, 실제 집계와 상태 계산은 `priorityBucket`, `pipelineBucket`을 기준으로 고정했습니다.
  - 서버 view 계층은 더 이상 CS/클레임 이슈로 배송 단계를 덮어쓰지 않고, `배송 축`과 `이슈 축`을 분리해서 계산합니다.
  - 배송 축은 `payment_completed / preparing_product / shipping_instruction / in_delivery / delivered`, 이슈 축은 `shipment_stop_requested / shipment_stop_resolved / cancel / return / exchange / cs_open / none` 어휘로 고정했습니다.
  - 상단 집계는 `decisionCounts` 중심이 아니라 `priorityCounts`, `pipelineCounts`, `issueCounts`, `directDeliveryCount`, `staleSyncCount` 중심으로 확장했습니다.
  - `우선 처리 카드 / 배송 처리 / 이슈 필터`는 현재 필터 전체 기준으로 계산하고, 클릭 시 하단 원본 테이블이 같은 쿠팡 기준 상태 축으로 연동됩니다.
  - UX 레이어도 함께 정리해, 상단 첫 화면은 `즉시 출고 / 송장 입력 / 재확인 / 보류 / 차단` 행동 큐 카드와 대표 주문 미리보기 중심으로 재구성했습니다.
  - 메인 테이블 상태 셀은 `배송 단계 / 이슈 / 다음 액션 / 원본+동기화 메타` 순서로 축약하고, 우측 판단 패널은 `지금 해야 할 일 -> 왜 이 큐에 들어왔는지 -> 다음 이동 -> 상태 비교` 순서로 재배치했습니다.
  - `NONE_TRACKING`은 `배송중`으로 보이되 `업체 직접 배송` 이슈 필터와 보조 배지로 따로 드러나도록 정리했습니다.
  - 우측 판단 패널과 상태 셀은 `쿠팡 원본 상태 -> 현재 배송 단계 -> 현재 이슈 단계`를 먼저 보여주고, 내부 `다음 액션` 정보는 보조 안내로만 남겼습니다.
  - 패널에는 `원본값`, `현재 표시값`, `불일치 사유`, `마지막 동기화 시각`을 같이 보여줘 live/worksheet 차이를 설명할 수 있게 했습니다.
  - 레거시 CS summary만 남은 row도 handled 계열 예전 표현을 fallback으로 흡수해 `shipment_stop_resolved`로 정규화되게 맞췄습니다.
- 이유:
  - 주 화면의 기준을 내부 작업 상태가 아니라 쿠팡 원본 의미 체계로 다시 고정하고, 카드/필터/목록이 서로 다른 기준으로 말하는 문제를 줄이기 위해서입니다.
  - 배송 상태와 반품/취소/CS 이슈를 같은 한 줄 상태로 섞으면 원본 의미가 깨져 운영 판단이 흔들리기 때문입니다.
- 남은 점:
  - 라이브 쿠팡 값과 저장 스냅샷의 차이를 행별 실시간으로 모두 검증한 것은 아니며, 현재 `syncSource`와 `statusMismatchReason`은 기존 저장 필드 조합을 기준으로 계산합니다.
  - 브라우저에서 새 상단 카드와 우측 패널의 실제 체감까지 직접 검증한 것은 아직 아닙니다. 이 부분은 `추정`이 남아 있습니다.
- 검증:
  - `npx tsc --noEmit --pretty false`
  - `npx vitest run --root . server/services/coupang/shipment-worksheet-view.test.ts`
  - `npx vitest run client/src/features/coupang/shipments/quick-collect-focus.test.ts client/src/features/coupang/shipments/quick-collect-focus-controller.test.ts client/src/features/coupang/shipments/fulfillment-filter-summary.test.ts client/src/lib/coupang-order-status.test.ts`

## 2026-04-20 / 쿠팡 셀픽주문번호 절대 중복 방지

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `shared/schema.ts`
  - `server/services/shared/work-data-db.ts`
  - `server/interfaces/coupang-shipment-worksheet-store.ts`
  - `server/services/coupang/shipment-worksheet-store.ts`
  - `server/stores/work-data-coupang-shipment-worksheet-store.ts`
  - `server/services/coupang/shipment-worksheet-service.ts`
  - `server/services/coupang/shipment-worksheet-collection.test.ts`
  - `server/services/coupang/shipment-worksheet-store.test.ts`
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/worksheet-config.ts`
  - `docs/current-status.md`
  - `docs/change-log.md`
- 변경 내용:
  - 셀픽주문번호 발급 기준을 현재 worksheet 스냅샷 계산에서 DB 영구 예약 방식으로 바꿨습니다.
  - 새 `coupang_shipment_selpick_counters`, `coupang_shipment_selpick_registry` 구조를 추가해 번호 문자열의 전역 이력과 플랫폼별 마지막 시퀀스를 따로 저장합니다.
  - collect 경로는 더 이상 메모리 allocator로 번호를 만들지 않고, store 계층의 공통 `materializeSelpickOrderNumbers()`를 통해서만 새 번호를 예약합니다.
  - legacy/file 저장소와 DB 저장소 모두 active + archive 전체를 기준으로 셀픽 무결성을 점검하고, 안전한 중복만 자동 재번호하도록 맞췄습니다.
  - 이미 송장 반영·출력 등 운영 사용 이력이 있는 중복은 자동으로 바꾸지 않고, patch / collect / refresh / invoice input 같은 write 경로를 명시적으로 차단합니다.
  - 클라이언트는 `4자리 이상` suffix를 허용하도록 패턴을 넓히고, 붙여넣기/송장 반영 전에 중복 셀픽이 남아 있으면 조용히 `Map`으로 덮어쓰지 않도록 막았습니다.
- 이유:
  - 보관함 이동 후 재수집, 날짜 변경, 앱 재시작, 동시 수집처럼 worksheet 스냅샷만으로는 막기 어려운 경우까지 포함해 셀픽주문번호 재사용과 충돌을 구조적으로 차단해야 했습니다.
- 남은 점:
  - 이미 운영에 쓰인 중복은 자동 복구하지 않으므로, 해당 데이터가 남아 있으면 차단 메시지에 따라 수동 정리가 필요합니다.
- 검증:
  - `npx tsc --noEmit --pretty false`
  - `npx vitest run --root . server/services/coupang/shipment-worksheet-collection.test.ts server/services/coupang/shipment-worksheet-store.test.ts`

## 2026-04-19 / 쿠팡 출고 허브 UI 재구성

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `shared/coupang.ts`
  - `shared/coupang-fulfillment.ts`
  - `server/services/coupang/shipment-worksheet-view.ts`
  - `server/services/coupang/shipment-worksheet-service.ts`
  - `server/services/coupang/shipment-worksheet-view.test.ts`
  - `server/services/coupang/shipment-worksheet-service-view-read.test.ts`
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/shipment-worksheet-overview.tsx`
  - `client/src/features/coupang/shipments/shipment-hub-side-panel.tsx`
  - `client/src/features/coupang/shipments/worksheet-row-helpers.tsx`
  - `client/src/features/coupang/shipments/quick-collect-focus.ts`
  - `client/src/features/coupang/shipments/quick-collect-focus-controller.ts`
  - `client/src/features/coupang/shipments/fulfillment-decision.ts`
  - `client/src/features/coupang/shipments/fulfillment-handoff.ts`
  - `client/src/features/coupang/shipments/types.ts`
  - `client/src/index.css`
  - `docs/current-status.md`
  - `docs/change-log.md`
- 변경 내용:
  - 출고 화면 상단을 `즉시 출고 / 송장 입력 / 재확인 / 보류 / 차단` 5개 행동 큐 허브로 재구성했습니다.
  - 큐 카드의 건수와 대표 주문 미리보기는 현재 필터 전체 기준으로 계산하고, 카드를 누르면 하단 원본 테이블이 같은 `decisionStatus`로 바로 연동됩니다.
  - 출고 판단 로직을 `shared/coupang-fulfillment.ts`로 공용화해 서버 집계, quick collect 집중 보기, 클라이언트 표시가 같은 규칙을 쓰도록 맞췄습니다.
  - worksheet view 응답에 `decisionCounts`, `decisionPreviewGroups`, row summary(`primaryDecision`, `secondaryStatus`, `riskSummary`, `nextHandoffLinks`)를 포함하도록 확장했습니다.
  - 작업 화면과 구매확정 탭에는 새 우측 판단 패널을 추가해 `업무 판단 상태 -> 쿠팡 원본 상태 -> CS·클레임 신호` 3층 구조와 다음 이동 링크를 한 자리에서 보여주도록 바꿨습니다.
  - 기존 오버레이 Drawer는 기본 작업 경로가 아니라 보관함 상세 확인 중심으로만 남기고, 메인 테이블 상태 셀도 같은 3층 순서를 요약해 보여주도록 보강했습니다.
- 이유:
  - 운영자가 원본 상태 해석보다 “지금 무엇을 해야 하는지”를 먼저 판단할 수 있게, 출고 화면을 다음 액션 중심 허브로 바꾸려는 요구를 반영했습니다.
  - 큐 숫자가 현재 페이지가 아니라 현재 필터 전체 기준이어야 상단 허브와 하단 작업판이 서로 다른 숫자를 말하지 않기 때문입니다.
- 남은 점:
  - 브라우저에서 실제 클릭으로 큐 카드 전환, 우측 판단 패널 체감, 모바일 폭까지 직접 검증한 것은 아직 아닙니다.
- 검증:
  - `npx tsc --noEmit --pretty false`
  - `npx vitest run --root . server/services/coupang/shipment-worksheet-view.test.ts server/services/coupang/shipment-worksheet-service-view-read.test.ts`

## 2026-04-19 / 쿠팡 미조회 주문 정리 + 잔여 주문 상태 재조회 버튼

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `shared/coupang.ts`
  - `server/http/coupang/parsers.ts`
  - `server/http/handlers/coupang/shipments.ts`
  - `server/routes/coupang/shipments.ts`
  - `server/services/coupang/shipment-worksheet-service.ts`
  - `server/stores/work-data-coupang-shipment-worksheet-store.ts`
  - `server/services/coupang/shipment-worksheet-collection.test.ts`
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/fulfillment-toolbar.tsx`
  - `docs/current-status.md`
  - `docs/change-log.md`
- 변경 내용:
  - 출고 작업 화면에 `미조회 정리 + 상태 재조회` 버튼을 추가했습니다.
  - 새 `/api/coupang/shipments/worksheet/reconcile-live` 엔드포인트가 현재 스토어, 현재 화면 필터, 현재 조회 기간 기준으로 대상 worksheet row를 다시 확인합니다.
  - 쿠팡 live 상세 조회가 성공했고 `item === null`인 주문만 `not_found_in_coupang` / `쿠팡 미조회 제외` 사유로 보관함으로 이동합니다.
  - fallback 응답이나 API 오류는 자동 제외하지 않고 warning으로만 남기며, 남아 있는 주문은 기존 `shipment_boxes` refresh 경로로 다시 상태를 맞춥니다.
  - 보관함 reason 라벨에 `쿠팡 미조회 제외`를 추가했고, 저장소 정규화도 새 reason을 그대로 유지하도록 맞췄습니다.
- 이유:
  - 플랫폼에서 이미 사라진 주문을 active worksheet에 계속 남겨 두지 않고, 작업 화면 기준으로 수동 정리한 뒤 남은 주문의 상태만 다시 맞추려는 운영 요구를 반영했습니다.
- 남은 점:
  - 자동 실행은 하지 않고 수동 버튼으로만 지원합니다.
  - 네트워크 실패나 fallback은 안전하게 유지 우선으로 처리하므로, 일부 미조회 후보는 warning 후 워크시트에 남을 수 있습니다.
- 검증:
  - `npx tsc --noEmit --pretty false`
  - `npx vitest run --root . server/services/coupang/shipment-worksheet-collection.test.ts`

## 2026-04-19 / 쿠팡 구매확정 수동 sync와 구매확정 탭 분리

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `shared/coupang.ts`
  - `server/http/coupang/parsers.ts`
  - `server/application/coupang/orders/read.ts`
  - `server/application/coupang/orders/service.ts`
  - `server/services/coupang/shipment-worksheet-service.ts`
  - `server/services/coupang/shipment-worksheet-view.ts`
  - `server/services/coupang/shipment-worksheet-collection.test.ts`
  - `server/services/coupang/shipment-worksheet-view.test.ts`
  - `client/src/lib/ops-handoff-links.ts`
  - `client/src/lib/ops-handoff-links.test.ts`
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/fulfillment-toolbar.tsx`
  - `client/src/features/coupang/shipments/fulfillment-grid-controller.tsx`
  - `client/src/features/coupang/shipments/fulfillment-selection-controller.tsx`
  - `client/src/features/coupang/shipments/fulfillment-summary-bar.tsx`
  - `client/src/features/coupang/shipments/fulfillment-filter-summary.ts`
  - `client/src/features/coupang/shipments/shipment-base-filters.tsx`
  - `client/src/features/coupang/shipments/shipment-worksheet-panel.tsx`
  - `client/src/features/coupang/shipments/quick-collect-focus-controller.ts`
  - `docs/current-status.md`
  - `docs/change-log.md`
- 변경 내용:
  - 출고 화면에 `구매확정` 상단 탭과 `구매확정 sync` 수동 액션을 추가했습니다.
  - 구매확정 판정은 주문 상태값이 아니라 기존 쿠팡 `revenue-history` 정산 인식 데이터로만 수행하도록 고정했습니다.
  - worksheet row에 `purchaseConfirmedAt`, `purchaseConfirmedSyncedAt`, `purchaseConfirmedFinalSettlementDate`, `purchaseConfirmedSource` 확장 필드를 추가했고, 새 테이블 없이 기존 row 저장 경로를 그대로 사용합니다.
  - `worksheet/refresh`에 `purchase_confirmed` scope를 추가해 현재 스토어/조회 기간 기준의 post-dispatch 후보만 별도로 구매확정 sync 할 수 있게 했습니다.
  - 매칭은 `orderId + vendorItemId`를 기본으로 사용하고, `vendorItemId`가 없는 정산 row만 이름 fallback을 허용합니다. fallback이 다중 후보면 경고만 남기고 건너뜁니다.
  - `dispatch_active`, `post_dispatch`에서는 구매확정된 행을 숨기고, 새 `confirmed` scope에서는 claim 없는 구매확정 행만 보여줍니다.
  - claim이 있는 구매확정 행은 계속 `claims` 범위에 남기고, `구매확정` 탭은 읽기 전용으로 유지합니다.
- 이유:
  - 주문 시트 API만으로는 구매확정 상태를 신뢰성 있게 알 수 없어서, 이미 저장소에 있는 정산 인식 데이터를 출고 운영 화면과 연결할 필요가 있었습니다.
  - 최근 구매확정건을 active worksheet/보관함과 분리해 보여 주되, 기존 30일 archive 정책은 바꾸지 않는 것이 이번 운영 요구에 맞았습니다.
- 남은 점:
  - 구매확정 sync는 수동 실행만 지원합니다.
  - 이미 확정된 행을 미확정으로 되돌리는 해제(sync rollback)는 이번 범위에 넣지 않았습니다.
- 검증:
  - `npx tsc --noEmit --pretty false`
  - `npx vitest run --root . server/services/coupang/shipment-worksheet-collection.test.ts server/services/coupang/shipment-worksheet-view.test.ts`
  - `npx vitest run client/src/lib/ops-handoff-links.test.ts`

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
