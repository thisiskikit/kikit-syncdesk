# Current Status

- 스냅샷 날짜: 2026-04-20
- 목적: 현재 구현된 KIKIT SyncDesk 운영 데스크 구조와 출고/작업센터 동작을 기준으로 실제 상태를 기록합니다.

## 확인한 범위

- 코드 경로 확인
- 타입체크
- 출고 quick collect/controller, 작업센터 recovery helper 대상 단위 테스트

## 현재 상태

### 앱 셸 / 주요 메뉴
- 상단 주요 메뉴는 `대시보드`, `출고`, `CS`, `채널`, `작업센터`, `설정` 6축입니다.
- 브랜드 텍스트는 `KIKIT SyncDesk`입니다.
- `/operations`는 `/work-center`로, `/coupang/shipments`는 `/fulfillment`로 연결됩니다.
- `NAVER`, `COUPANG`, `Draft / Runs`는 더 이상 메인 상단 메뉴에 직접 노출하지 않습니다.

### 대시보드
- 대시보드는 채널 런처가 아니라 오늘의 운영 시작점입니다.
- 핵심 액션 카드, 지금 먼저 볼 것, 최근 이슈, 빠른 작업 패널, 얇은 채널 상태 스트립을 중심으로 구성됩니다.
- 카드 클릭 시 `출고`, `CS`, `작업센터`, `채널`로 바로 이동합니다.

### 출고
- `출고`는 쿠팡 배송/송장 워크시트를 운영 화면으로 재배치한 top-level 화면입니다.
- `client/src/features/coupang/shipments/page.tsx`는 상태, 조회, 실행 action coordinator를 맡고, 렌더 구조는 별도 controller/component로 분리됐습니다.
- `tab / storeId / scope / priorityCard / pipelineCard / issueFilter / decisionStatus / query` 기반 deep-link를 읽고, 현재 상태에 맞춰 `/fulfillment` URL을 다시 정규화합니다.
- 상단 탭은 `작업 화면`, `구매확정`, `보관함`, `화면 설정`으로 나뉘며, `구매확정`은 최근 구매확정건만 따로 보는 운영 탭입니다.
- `구매확정 sync`는 자동이 아니라 수동 액션이고, 현재 선택 스토어와 현재 조회 기간을 기준으로만 실행합니다.
- 구매확정 판정의 진실 원천은 주문 상태값이 아니라 쿠팡 `revenue-history` 계열 정산 인식 데이터입니다.
- 주문 상태가 `FINAL_DELIVERY / NONE_TRACKING`까지만 내려오더라도, 구매확정 여부는 별도 sync 결과로 `purchaseConfirmedAt` 등 worksheet row 확장 필드에 저장합니다.
- worksheet row와 `worksheet/view` 응답은 이제 `rawOrderStatus`, `shippingStage`, `issueStage`, `priorityBucket`, `pipelineBucket`, `isDirectDelivery`, `syncSource`, `statusDerivedAt`, `statusMismatchReason` 정규화 필드를 함께 돌려줍니다.
- `priorityCard`, `pipelineCard`는 아직 query/state 호환을 위해 남아 있지만, 실제 계산 기준값은 `priorityBucket`, `pipelineBucket`입니다.
- 상태 계산은 `라이브 쿠팡 주문 존재 여부 확인 -> rawOrderStatus 정규화 -> issueStage 정규화 -> shippingStage 계산 -> priority/pipeline bucket 계산 -> 내부 decision 보조 연결` 순서로 고정했습니다.
- 배송 축 값은 `payment_completed / preparing_product / shipping_instruction / in_delivery / delivered`이고, 이슈 축 값은 `shipment_stop_requested / shipment_stop_resolved / cancel / return / exchange / cs_open / none`입니다.
- 상단 카드/필터 집계도 `priorityCounts`, `pipelineCounts`, `issueCounts`, `directDeliveryCount`, `staleSyncCount`를 별도로 받아 쿠팡 의미 체계 기준으로 계산합니다.
- 메인 화면의 기본 기간은 이제 `최근 30일`이고, 상단 필터에는 `오늘 / 지난 7일 / 지난 30일` 프리셋과 직접 날짜 입력이 함께 있습니다.
- `worksheet/view` 조회는 `createdAtFrom`, `createdAtTo`를 실제 서버 projection에 반영하므로, 카드·필터·목록·scope 집계가 모두 같은 기간 분모를 공유합니다.
- `collect` / `worksheet/view` 응답은 이제 `coverageCreatedAtFrom`, `coverageCreatedAtTo`, `isAuthoritativeMirror`, `lastFullSyncedAt`를 함께 돌려줍니다. 여기서 coverage는 누적 범위가 아니라 `마지막 성공한 쿠팡 기준 30일 재동기화` 범위를 뜻합니다.
- `worksheet/view` 응답은 `missingInCoupangCount`, `exceptionCounts.notFoundInCoupang`도 함께 돌려주며, 이 값은 메인 배송 카드 분모에서는 제외된 `쿠팡 미조회` 예외 건수를 뜻합니다.
- `syncMode="full"`은 클라이언트가 어떤 날짜나 상태를 보내더라도 서버에서 `최근 30일 + 전체 배송 상태 + 전체 클레임/CS` 기준으로 강제 정규화합니다. 쿠팡과 메인 숫자를 다시 맞추는 책임은 이 재동기화만 가집니다.
- `syncMode="full"`은 기존 active worksheet에만 남아 있고 쿠팡 live 기준 최근 30일 authoritative mirror에는 없는 주문을 다시 검증합니다. live 상세가 성공했고 `item === null`이면 `쿠팡 미조회` 예외로 보관함으로 이동시키고, archive 실패 시에는 row에 `missingInCoupang` 메타를 남긴 채 경고로 유지합니다.
- `syncMode="incremental"`은 더 이상 자동으로 `full`로 승격되지 않고, 저장된 미러를 유지하기 위한 겹침 구간 `증분 갱신` 의미로만 동작합니다.
- 기본 메인 보기(`출고 / 전체 배송관리 / 추가 필터 없음`)에서 authoritative 30일 미러가 없으면, 화면이 부분 집계를 확정값처럼 쓰지 않고 자동으로 `쿠팡 기준 재동기화`를 다시 시작합니다.
- 같은 스토어의 `쿠팡 기준 재동기화(full)`가 이미 `queued/running`이면 서버가 추가 full 재동기화와 `빠른 수집(new_only)`, `증분 갱신(incremental)`을 함께 막아 중복 수집을 방지합니다.
- 출고 툴바는 서버 operation 목록에서 `선택 스토어의 active full sync`를 감지하고, `재동기화 취소` 버튼과 함께 왜 `빠른 수집`이 막혔는지 바로 안내합니다.
- `POST /api/operations/:id/cancel` 경로와 collect 내부 취소 체크포인트가 연결돼 있어, full 재동기화 취소 요청 후에는 다음 status/page/보강 단계부터 추가 진행을 멈추고 현재 worksheet 스냅샷으로 돌아옵니다.
- 필터 위계는 아래와 같습니다.
  - 메인 축: `우선 처리 카드 / 배송 처리 / 이슈 필터`
  - 보조 축: `전체 배송관리 / 내부 작업 대상 / 배송 이후 / 구매확정 / 이슈·클레임`
  - 세부 축: `다음 액션 / 송장 상태 / 출력 상태 / 주문 상태`
- 상단은 `쿠팡 기준 정합 허브`, `현재 적용 조건`, `세부 필터`, `선택 일괄 작업 바` 순서로 읽히도록 정리돼 있습니다.
- 상단 허브는 `먼저 확인`, `배송 처리`, `이슈 필터` 3개 층으로 나뉘며, 모든 숫자는 현재 페이지가 아니라 현재 필터 전체 기준으로 계산합니다.
- `worksheet/view`는 이제 `mirrorItems(쿠팡 기준 authoritative 30일 미러)`와 `activeItems(실제 작업 대상)`를 분리해서 다루고, 응답에 `datasetMode`, `mirrorTotalRowCount`, `mirrorFilteredRowCount`, `activeTotalRowCount`, `activeFilteredRowCount`, `activeExclusionCounts`를 함께 돌려줍니다.
- 기본 표는 계속 `active` 목록으로 열리지만, 상단 `먼저 확인 / 배송 처리 / 이슈 필터` 카드를 누르면 표가 `mirror` 모드로 전환되어 쿠팡 기준 숫자와 목록 건수가 맞도록 보여줍니다.
- `mirror` 목록에만 있고 `active`에서 제외된 행은 `return_completed / cancel_completed / not_found_in_coupang` 같은 `active 제외 사유`를 함께 들고 오며, 표에서는 읽기 전용으로만 다룹니다.
- `즉시 출고 / 송장 입력 / 재확인 / 보류 / 차단` 행동 큐는 메인 상태 카드가 아니라 `보조 작업 큐`로 남겨 두고, 전체 건수·대표 사유·대표 주문 3건 미리보기 중심으로 보여줍니다.
- 행동 큐 카드를 누르면 하단 원본 테이블은 같은 `decisionStatus` 기준으로 좁혀지지만, 메인 상태 해석과 분모 계산의 기준값으로는 쓰지 않습니다.
- `먼저 확인` 카드는 `출고중지요청 / 당일출고필요 / 출고지연 / 장기미배송` 우선순위로 계산합니다.
- `배송 처리`는 `결제완료 / 상품준비중 / 배송지시 / 배송중 / 배송완료`를 따로 보여주고, `NONE_TRACKING`은 `배송중 + 업체 직접 배송`으로 분리 표시합니다.
- `이슈 필터`는 `취소 / 반품 / 교환 / CS 진행중 / 업체 직접 배송`과 별도 `stale sync` 경고 건수를 함께 보여줍니다.
- 카드, 필터, 목록, 우측 판단 패널은 각각 따로 상태를 다시 계산하지 않고 같은 정규화 projection을 공유합니다.
- 내부 작업 편의용 `decisionCounts`, `primaryDecision`, `secondaryStatus`는 그대로 남아 있지만, 상단 카드와 기본 상태 해석의 기준값으로는 더 이상 쓰지 않습니다.
- 메인 테이블의 상태 셀은 `배송 단계 / 이슈 배지 / 다음 액션 / 원본+동기화 메타` 순서로 축약해, 한 행에서 먼저 봐야 할 값만 남기도록 정리했습니다.
- 우측 판단 패널은 정보 나열보다 `지금 해야 할 일 -> 왜 이 큐에 들어왔는지 -> 다음 이동 -> 현재 상태 비교` 순서로 읽히게 재배치했습니다.
- 우측 판단 패널에서도 `원본값`, `현재 표시값`, `불일치 사유`, `마지막 동기화`를 비교할 수 있지만, 그보다 먼저 현재 판단과 허용 액션을 보여줍니다.
- 우측 판단 패널과 행 강조는 `mirror` 전용 제외 행도 같이 설명합니다. `active`에서 빠진 행을 선택하면 `active 제외 사유`가 별도 정보로 노출되고, grid에는 별도 강조선이 들어갑니다.
- 상세는 오버레이 Drawer가 아니라 우측 판단 패널에서 먼저 확인합니다. Drawer는 보관함 중심 상세 확인 경로로만 남아 있습니다.
- `보류 / 차단 / 재확인` 상태의 다음 이동 경로는 상단 주 구조가 아니라 행 단위 보조 안내와 우측 판단 패널에서 `CS 허브` 또는 `작업센터` 기준으로 함께 안내합니다.

### 출고 coordinator 분해 상태
- 렌더 shell은 `fulfillment-shell.tsx`로 이동했습니다.
- 헤더, 1차 액션, 기본 필터는 `fulfillment-toolbar.tsx`로 이동했습니다.
- 쿠팡 기준 정합 허브와 보관함 메트릭은 `fulfillment-summary-bar.tsx` / `shipment-worksheet-overview.tsx`로 이동했습니다.
- 선택 일괄 작업 bar는 `fulfillment-selection-controller.tsx`로 이동했습니다.
- 작업 화면/보관함/화면 설정 전환과 grid wiring은 `fulfillment-grid-controller.tsx`로 이동했습니다.
- 우측 판단 패널은 `shipment-hub-side-panel.tsx`로 분리됐고, 작업 화면/구매확정 탭에서 메인 grid 옆에 고정 배치됩니다.
- Drawer/상세/dialog lazy mounting은 `fulfillment-drawer-controller.tsx`로 이동했습니다.
- 빠른 수집 집중 보기의 시트 재구성 로직은 `quick-collect-focus-controller.ts`로 이동했습니다.
- 쿠팡형 상태 계산 공용 로직은 `shared/coupang-status.ts`, 화면 라벨/배지 규칙은 `client/src/features/coupang/shipments/coupang-status-view.ts`로 분리됐습니다.
- 따라서 `page.tsx`는 여전히 큰 coordinator이지만, 화면 조립과 빠른 수집 view state 계산이 한 파일에 섞여 있지는 않습니다.

### 출고 컬럼 보기 프리셋
- 워크시트 카드와 화면 설정 패널의 보기 프리셋 노출은 현재 `전체 열 보기`만 유지합니다.
- `작업 보기`, `송장 입력 보기` 프리셋 정의는 코드에 남아 있지만, UI에서는 일시적으로 숨겨 둔 상태입니다.
- `전체 열 보기`
- 기존 사용자 컬럼 설정은 자동으로 덮어쓰지 않습니다.
- 사용자가 프리셋을 직접 적용할 때만 컬럼 집합과 폭이 바뀝니다.
- `컬럼 설정`에서는 각 열의 다운로드 헤더와 source column을 분리해서 볼 수 있습니다.
- source column 선택지는 `productName · 상품명`, `invoiceNumber · 송장번호`처럼 원본 key와 한글명을 함께 보여줍니다.
- source column 드롭다운은 현재 preview 기준 행의 값을 각 선택지에 함께 붙여 보여주므로, raw key를 바꿔 가며 어떤 값이 들어오는지 바로 비교할 수 있습니다.
- 각 열마다 `key명 적용` / `한글명 적용` 버튼으로 다운로드 헤더를 빠르게 맞출 수 있습니다.
- `컬럼 설정` 상단에서 현재 보이는 주문행 중 하나를 골라, 모든 컬럼 preview를 그 행 기준으로 즉시 바꿔 볼 수 있습니다.
- 쿠팡 배송 시트 row는 이제 정규화 필드만 저장하지 않고, `row_data_json.rawFields` 안에 `order.* / detail.* / detailItem.* / product.* / productItem.* / worksheet.*` 평탄화 맵을 함께 유지합니다.
- 메인 그리드, 정렬, 컬럼 미리보기, 상세 패널, 엑셀 다운로드는 같은 `builtin/raw source` resolver를 사용해 값을 읽습니다.
- 기본 builtin 컬럼은 계속 1급 필드로 남아 송장 입력/수정 경로를 유지하고, raw field 컬럼은 읽기 전용으로만 노출합니다.
- 화면 설정의 raw source 선택지는 현재 페이지 행이 아니라 `worksheet/view`, `worksheet`, `archive/view` 응답의 `rawFieldCatalog` 기준으로 구성됩니다.
- archive row는 live API 재호출 없이 기존 row에서 합성한 synthetic `rawFields`를 사용해, active worksheet보다 원본 품질은 낮아도 같은 컬럼 resolver를 공유합니다.

### 빠른 수집 직후 신규 주문 우선 보기
- `빠른 수집(new_only)` 응답은 `insertedSourceKeys`를 반환합니다.
- `빠른 수집(new_only)`는 이제 마지막 수집 시점 기준 최근 24시간 겹침 구간만 다시 조회하고, 신규 row 저장만 먼저 끝낸 뒤 상세/상품/CS 보강은 `pending_after_collect` 백그라운드 refresh로 넘깁니다.
- 같은 `빠른 수집(new_only)`는 상태 배치 종료 또는 신규 100행 누적 시점마다 `source_key` 기준 checkpoint upsert를 수행해, 중간에 작업이 끊겨도 앞에서 받은 신규 주문이 워크시트에 남도록 바뀌었습니다.
- collect 저장 경로는 `delete -> 단일 대량 insert` 대신 200행 단위 청크 쓰기를 사용하고, 같은 스토어에 대한 저장 트랜잭션은 advisory lock으로 직렬화합니다.
- collect 저장 실패 메시지는 이제 `중복 키(23505)`, `필수 컬럼 null(23502)`, 일반 DB 쓰기 실패를 구분해 남기며, 시스템 로그에도 `rowCount / chunkCount / mode / storeId / constraint / column` 메타를 함께 기록합니다.
- 신규 주문이 실제로 추가되면 워크시트는 방금 추가된 주문만 임시로 먼저 보여줍니다.
- 이 임시 집중 보기는 아래 동작에서 자동 해제됩니다.
  - 스토어 변경
  - 기간 변경
  - 검색어 변경
  - 보기 범위 변경
  - 우선 처리/배송/이슈 필터 변경
  - 세부 필터 변경
  - 수동 새로고침
  - `작업 화면` 외 탭 이동
- 페이지 크기 정책 자체는 그대로 유지합니다.

### 선택 일괄 작업
- 선택 행에 `차단`, `보류`, `재확인 필요`가 섞여 있어도 실행 가능한 행은 자동으로 진행합니다.
- 제외된 행은 상태/사유 요약으로 다시 보여줍니다.
- 선택 바는 `즉시 실행`과 `제외 또는 확인 필요`를 분리해서 안내합니다.
- `상품준비중 처리`는 선행 `수집 누락 audit`를 계속 보지만, audit 단계에서 정상 `ACCEPT/INSTRUCT` 행은 먼저 자동 반영하고 현재 worksheet에 있는 처리 가능 주문은 그대로 진행합니다.
- `수집 누락 audit` 자체가 일시 실패해도 `상품준비중 처리`를 전체 차단하지 않고, 현재 worksheet 기준 처리만 계속 진행하면서 경고만 남깁니다.
- `수집 누락 audit`는 live `ACCEPT/INSTRUCT` 주문을 `matched / auto_upsertable / exception / hidden_info`로 나누고, `matched`는 상태 자동 갱신, `auto_upsertable`은 worksheet 자동 추가 또는 보관함 복구로 바로 반영합니다.
- 자동 반영할 수 없는 주문만 `exceptionItems`로 남고, 현재 뷰에 안 보이는 주문은 `hidden_info`로만 접어서 보여 작업을 막지 않습니다.
- 보관함에 있던 정상 행이 live에서 다시 보이면 같은 audit 흐름에서 자동 복구되고, 반대로 기존 worksheet 행이 live에서 사라지면 기존 `쿠팡 미조회` 예외/보관 규칙으로 이어집니다.
- `수집 누락 audit`는 조회 범위가 7일을 넘어도 내부적으로 7일 단위로 나눠 확인합니다.
- `결제완료 -> 상품준비중` 버튼은 조건이 맞지 않아도 바로 비활성화하지 않고, 클릭 시 현재 화면 기준으로 왜 처리 대상이 없는지 경고로 안내합니다.
- `빠른 수집 / 쿠팡 기준 재동기화 / 증분 갱신`은 1차로 `주문 목록 조회 + 클레임 병합 + worksheet 반영`까지만 완료하고 응답합니다.
- 주문 상세, 상품 상세, CS 상태 보강은 `/api/coupang/shipments/worksheet/refresh` 후속 단계로 분리됐고, collect 성공 직후 클라이언트가 non-blocking으로 이어서 호출합니다.
- collect 응답의 `syncSummary.completedPhases / pendingPhases / warningPhases`는 `지금 끝난 단계`와 `이어질 보강 단계`를 함께 기록합니다.
- `빠른 수집(new_only)`에서 일부 주문 상태 조회만 실패해도 수집 작업 전체를 즉시 실패로 돌리지 않고, `syncSummary.degraded / failedStatuses / autoAuditRecommended`로 부분 실패를 남긴 뒤 화면 경고와 누락 audit로 이어집니다.
- `셀픽주문번호`는 이제 현재 워크시트 스냅샷이 아니라 DB의 영구 `counter + registry`에서 예약합니다.
- 유일성 기준은 active worksheet만이 아니라 `쿠팡 출고 row + archive 전체 이력`이고, 보관함으로 이동한 뒤 다시 수집해도 과거 번호를 재사용하지 않습니다.
- suffix는 `0001`처럼 4자리부터 시작하지만, 이제 `10000` 이상도 그대로 허용합니다.
- 기존 중복이 발견되면 `미전송/미출력` 건만 자동 재번호하고, 이미 송장 반영·출력 등 운영 사용 이력이 있는 중복은 자동 변경하지 않고 write 계열 작업을 차단합니다.
- `상품명(productName)` 컬럼은 실제 상품명 우선으로 고정합니다. 우선순위는 `product.sellerProductName -> order.sellerProductName -> detailItem.sellerProductName -> 기존 정상 productName -> detail/order productName(옵션 suffix 제거)`입니다.
- 주문 목록의 `productName`처럼 옵션이 합쳐진 노출 문자열은 더 이상 `상품명`에 그대로 재사용하지 않고, fallback이 필요할 때도 옵션 suffix를 분리한 값으로만 씁니다.
- `옵션명(optionName)` 컬럼은 collect 직후부터 `실제 옵션값` 기준으로 맞추고, `productItem.itemName -> detailItem.optionName -> order.optionName -> 기존 stored optionName -> null` 우선순위로만 채웁니다.
- 실제 옵션값을 collect 시점에 못 가져오면 기존 정상 `optionName`은 유지하고, 기존 값도 없으면 빈값으로 둡니다.
- `노출상품명(exposedProductName)`은 계속 표시용 문자열이며, `상품명`이나 `옵션명`을 대신하지 않습니다.
- synthetic `rawFields`와 refresh fallback도 이 규칙을 따르도록 맞춰, worksheet의 `상품명`을 다시 `sellerProductName`처럼 재주입해 값이 뒤틀리는 경로를 막았습니다.
- 구형 CS summary 문자열만 남아 있는 row도 `shipment_stop_requested`, `shipment_stop_resolved` 같은 이슈 축으로 다시 정규화되며, handled 계열 legacy 표현은 fallback summary 파서로 흡수합니다.
- `결제완료 -> 상품준비중` 성공 후에는 `incremental collect`를 다시 기다리지 않고, 성공한 `shipmentBoxId` 행을 먼저 `INSTRUCT`로 낙관 반영합니다.
- 낙관 반영 뒤에는 성공한 `shipmentBoxId`만 대상으로 `/api/coupang/shipments/worksheet/refresh`를 비동기로 호출해 상세/행 액션을 다시 맞춥니다.
- 후속 보강이 경고 또는 실패로 끝나도 선행 collect / prepare 성공 자체를 되돌리지는 않고, 작업센터 operation과 화면 경고에서 별도로 남깁니다.
- 작업 화면에는 `미조회 정리 + 상태 재조회` 버튼이 따로 있으며, 현재 스토어 + 현재 화면 필터 + 현재 조회 기간 기준으로 대상 worksheet row를 한 번 더 live 상세 확인합니다.
- live 상세가 성공(`source === "live"`)했고 `item === null`인 주문만 `쿠팡 미조회 제외` 사유로 보관함으로 이동합니다.
- fallback 응답이나 API 오류는 `쿠팡 미조회`로 단정하지 않고 워크시트에 남긴 채 경고로만 집계합니다.
- 미조회 정리 뒤에는 남아 있는 대상 행만 `shipment_boxes` refresh로 다시 맞추고, 이 경량 재조회에서도 상품 상세 hydrate는 다시 수행하지 않습니다.
- `구매확정 sync`는 `/api/coupang/shipments/worksheet/refresh`의 `purchase_confirmed` scope를 사용합니다.
- 구매확정 sync 대상은 현재 스토어 + 현재 조회 기간 안의 미보관 worksheet row 중 `DEPARTURE / DELIVERING / FINAL_DELIVERY / NONE_TRACKING` 상태이면서 아직 구매확정되지 않은 행입니다.
- 정산 row는 `saleType === "SALE"`만 구매확정 후보로 인정하고, 기본 매칭 키는 `orderId + vendorItemId`입니다.
- `vendorItemId`가 없을 때만 `orderId + 정규화된 vendorItemName/productName` fallback을 허용하고, 단일 후보가 아니면 경고만 남기고 건너뜁니다.
- 구매확정 sync는 false positive 방지를 위해 이미 확정된 행을 다시 미확정으로 되돌리지는 않습니다.
- `dispatch_active`와 `post_dispatch` 범위에서는 `purchaseConfirmedAt`이 있는 행을 제외하고, 새 `confirmed` 범위에서만 claim 없는 구매확정 행을 보여줍니다.
- claim이 있는 구매확정 행은 구매확정 탭으로 이동하지 않고 계속 `claims` 범위에 남습니다.
- `구매확정` 탭은 기존 worksheet grid와 상세 패널을 재사용하지만 읽기 전용입니다. 송장 입력, 송장 전송, 상품준비중 처리, 저장은 이 탭에서 비활성화됩니다.
- 송장 업로드/수정은 서버가 worksheet 전송 상태를 `pending -> succeeded/failed`로 직접 기록하고, 클라이언트는 로컬 pending 표시 후 재조회만 수행합니다.
- 송장 batch 응답에서 일부 `shipmentBoxId` 결과가 누락되면 서버가 해당 건만 개별 재시도해 결과를 보정합니다.
- `invoice_ready` / `prepare_ready` bulk resolve는 전송·처리 직전에 후보 `shipmentBoxId`를 `shipment_boxes` refresh로 다시 맞춰 stale `orderStatus`/`vendorItemId` 때문에 정상 건이 빠지지 않게 합니다.
- 같은 bulk resolve는 CS 상태 재조회도 전체 worksheet가 아니라 실제 `invoice_ready` / `prepare_ready` / `not_exported_download` 후보 행만 대상으로 좁히고, `shipment_boxes` refresh를 이미 돌린 후보에는 CS 재조회를 중복하지 않아 송장 전송 직전 `worksheet/resolve`가 과하게 무거워지지 않게 했습니다.
- 같은 `worksheet/resolve` 단계의 `shipment_boxes` refresh는 후보 행을 메모리에서만 재수화하고, resolve를 위해 전체 worksheet를 다시 DB에 저장하지 않습니다. 이때 resolve 판단에 필요 없는 상품 상세 재조회도 건너뛰어 대량 송장 전송에서 메모리와 대기 시간을 함께 줄입니다.
- 선택 송장 전송은 계속 클릭 시점에 선택 `shipmentBoxId`만 먼저 refresh한 뒤 최신 행 스냅샷으로 검증/전송하고, 성공 건은 다시 `shipment_boxes` refresh를 붙여 화면 상태를 따라갑니다.
- 상단 `송장 전송하기` 버튼은 이제 기본 화면과 송장 입력 모드 모두에서 현재 필터 범위의 전송 가능 행을 대상으로 동작합니다. 선택 건만 보내는 경로는 선택 action bar에 남겨 둡니다.
- 같은 상단 `송장 전송하기`는 stale `availableActions` 때문에 시작 자체를 막지 않고, 실제 전송 가능 여부는 직전 refresh + bulk resolve에서 다시 판정합니다. `상품준비중(ACCEPT)` 행 중 송장 payload가 이미 입력된 건은 먼저 `상품준비중 처리`로 자동 전환한 뒤 이어서 송장을 전송합니다.
- `CS이관` 같은 placeholder 값이나 스토어명이 택배사 칸에 들어간 행은 송장 전송 대상에서 즉시 제외하고, 서버도 쿠팡 호출 전에 같은 규칙으로 fail-fast 처리합니다.
- 송장 전송 성공 건은 worksheet patch 단계에서 `DEPARTURE` / `updateInvoice` 쪽으로 먼저 낙관 반영해, 쿠팡 반영 직후에도 오래 `INSTRUCT` / `uploadInvoice`로 남아 보이지 않게 했습니다.
- 쿠팡 `updateInvoice`가 `retryRequired=true / UNDEFINED_ERROR_OCCUR`를 반환해도, 직후 live 상세에서 같은 송장번호가 이미 보이면 서버가 이를 멱등 성공으로 승격해 worksheet 실패 상태를 남기지 않습니다.
- Naver 발송은 이미 발송된 주문 응답을 멱등 성공으로 처리해 불필요한 실패 누적을 줄입니다.
- worksheet 읽기 중 `getShipmentWorksheet`와 `worksheet/view`는 저장된 worksheet 스냅샷만 반환하고, 기본 조회에서 live CS 재조회를 수행하지 않습니다.
- live CS 재확인은 `worksheet/refresh`, `shipment_boxes` refresh, `customer_service` refresh, bulk resolve 직전 후보 refresh처럼 explicit 경로에서만 수행합니다.
- 출고 화면의 worksheet query는 짧은 stale window를 두고 mount/focus 때마다 자동 재조회하지 않도록 완화됐습니다.

### 보관함
- `보관함`은 읽기 전용 archive 조회 화면입니다.
- 현재 작업용 워크시트와 분리되어 있고, 메인 작업 흐름은 `작업 화면`에 남아 있습니다.
- `구매확정` 탭은 최근 확정건 운영 메뉴이고, 장기 보관은 계속 `보관함`이 맡습니다.
- `출력 완료 후 30일이 지난 일반 배송 주문`은 기존처럼 수동 archive 정리 대상입니다.
- 구매확정된 행도 기존 30일 archive 정책이 지나면 `보관함`으로 이동합니다.
- `취소완료`, `반품완료`가 플랫폼 응답으로 확인된 주문은 다음 collect 또는 refresh 시점에 active worksheet에서 빠지고 같은 보관함으로 자동 이동합니다.
- `쿠팡 live` 상세에서 더 이상 조회되지 않는 주문은 수동 `미조회 정리 + 상태 재조회`뿐 아니라 `쿠팡 기준 재동기화(full)`에서도 같은 `쿠팡 미조회 제외` 사유로 보관함 이동 대상이 됩니다.
- 보관함의 `쿠팡 미조회 제외` row는 `마지막 쿠팡 상태`, `미조회 감지 시각`, `감지 경로(full_sync / reconcile_live)` 메타를 함께 들고 있습니다.
- 보관함 row는 `일반 보관`, `취소완료 자동보관`, `반품완료 자동보관`, `쿠팡 미조회 제외` 이유를 구분해서 보여줍니다.

### CS / 채널 / 설정
- `CS`는 통합 실행 화면이 아니라 허브입니다.
- 기존 NAVER / COUPANG 문의/클레임 화면으로 deep-link 합니다.
- `/cs`는 `focus / source` query를 읽어 이번 진입 문맥을 안내하고, 다시 `출고` 또는 `작업센터`로 이어지는 복귀 링크를 함께 보여줍니다.
- `채널`은 연결/원본 화면 허브입니다.
- `채널`은 `연결 상태 / 점검`, `원본 화면 진입`, `채널별 주요 도구`, `고급 / 레거시 화면` 순서로 읽히게 정리됐습니다.
- 연결이 전혀 없으면 먼저 연결 설정으로 들어가야 한다는 empty state 문구를 보여줍니다.
- `설정`은 연결 설정과 고급/레거시 도구 진입점입니다.
- `설정`은 `연결 설정`, `운영 고급 도구`, `레거시 / 직접 진입` 순서로 읽히게 정리됐습니다.
- 두 허브의 카드 배치와 레이블은 `client/src/pages/hub-navigation.ts`의 section descriptor로 고정했습니다.

### 작업센터
- 작업센터는 로그 뷰어가 아니라 실패 작업 복구 중심 화면입니다.
- `tab / channel / status / level / q / slowOnly / logId` deep-link를 읽고, 현재 필터 상태를 `/work-center` URL에 다시 반영합니다.
- 메인 목록은 `즉시 재시도 / 원인 확인 / 진행 관찰 / 완료` 순서로 읽히도록 recovery-first 우선순위를 적용합니다.
- 동일 성격 실패는 상단 `복구 묶음`으로 먼저 요약합니다.
- 리스트에서는 재시도 가능 여부와 영향 범위를 제목보다 먼저 판단할 수 있게 정리했습니다.
- 상세 패널은 `지금 할 일`, `영향 범위`, `작업 티켓 상세`, `요청 / 결과 요약`, payload 순서로 읽히게 정리했습니다.
- 쿠팡 operation 상세에서는 payload에서 추출한 주문 식별자와 storeId를 기준으로 `관련 출고 보기`, `CS 허브 열기`로 바로 이어집니다.
- 상세 foldout 렌더는 `operation-center-operation-detail-sections.tsx`로 분리됐습니다.
- 티켓 상세는 최대 5건까지만 기록합니다.
- 우선순위는 `실패 -> 경고 -> 건너뜀 -> 성공`입니다.
- 현재 적용 대상은 다음 작업들입니다.
  - 배송/송장 수집
  - 결제완료 -> 상품준비중
  - 송장 업로드
  - 송장 수정

### 빌드 / 배포 하드닝
- `vite.config.ts`는 `vendor-react`, `vendor-grid`, `vendor-sheet`, `route-coupang`, `route-naver`, `route-engine` chunk 분리를 사용합니다.
- 2026-04-13 기준 production build에서 기존 `index` 메인 청크는 약 `1,333.80kB`에서 `72.05kB`로 줄었고, 500k 초과 chunk warning은 사라졌습니다.
- 남은 빌드 경고는 `node_modules/react-data-grid/lib/styles.css`의 `//# sourceMappingURL=styles.css.map` 코멘트 때문에 발생하는 CSS minify warning입니다.
- GitHub Actions 워크플로우 이름은 `Cloud Run Prod Deploy`, `Cloud Run Dev Deploy`로 정리했습니다.
- Cloud Run 배포 경로에서는 Secret Manager의 `DATABASE_URL`을 통해 Cloud SQL에 연결합니다.
- `server/storage.ts`는 배포 환경에서 `DatabaseStorage`를 사용하므로, 채널 catalog sync 결과, Draft, Execution run/item 이력은 더 이상 메모리 전용이 아닙니다.
- 위 catalog / draft / execution 테이블과 조회 인덱스는 첫 접근 시 런타임에서 `CREATE TABLE IF NOT EXISTS`로 자동 보장됩니다.
- Vitest 실행 또는 `FORCE_MEMORY_STORAGE=true`일 때만 이 저장소는 in-memory fallback을 유지해 테스트가 실DB를 건드리지 않도록 막습니다.
- 배포 후 smoke check와 rollback 포인트는 `docs/deployment/cloud-run-smoke-check.md`에 정리돼 있습니다.
- 작업 상태 패널과 작업센터 주요 레이블은 현재 한국어로 정리돼 있습니다.
- 작업 상태 패널은 진행 중 작업 외에도 쿠팡 API 런타임 카드로 `현재 동시 실행`, `대기열`, `기본 요청 간격`, `backoff 남은 시간`을 함께 보여줍니다.

### 운영 회귀 문서
- 출고 수동 회귀 시나리오는 `docs/qa/manual-fulfillment-regression.md`에 정리돼 있습니다.
- 작업센터 recovery 흐름 시나리오는 `docs/qa/work-center-recovery-scenarios.md`에 정리돼 있습니다.
- 브라우저에서 아직 직접 밟지 못한 기대 결과는 문서에 `추정`으로 표시했습니다.

## 라우트 요약

- `/dashboard`
- `/fulfillment`
- `/cs`
- `/channels`
- `/work-center`
- `/settings`

보조 연결 규칙:
- `/operations` -> `/work-center`
- `/coupang/shipments` -> `/fulfillment`
- `/naver` -> `/channels`
- `/coupang` -> `/channels`
- `/runs` -> `/engine/runs`
- `/drafts/:id` -> `/engine/drafts/:id`

## 이번 스냅샷에서 확인한 파일

- `client/src/App.tsx`
- `client/src/components/operation-toaster.tsx`
- `client/src/lib/workspace-tabs.ts`
- `client/src/lib/coupang-navigation.ts`
- `client/src/pages/dashboard.tsx`
- `client/src/pages/fulfillment.tsx`
- `client/src/pages/cs-hub.tsx`
- `client/src/pages/channels-hub.tsx`
- `client/src/pages/operation-center.tsx`
- `client/src/pages/operation-center-recovery.ts`
- `client/src/pages/operation-center-operation-detail-sections.tsx`
- `client/src/pages/operation-center-recovery.test.ts`
- `client/src/pages/hub-navigation.ts`
- `client/src/pages/hub-navigation.test.ts`
- `client/src/lib/ops-handoff-links.ts`
- `client/src/lib/ops-handoff-links.test.ts`
- `vite.config.ts`
- `.github/workflows/deploy-kikit-price-change.yml`
- `.github/workflows/deploy-kikit-price-change-dev.yml`
- `client/src/pages/settings-hub.tsx`
- `client/src/features/coupang/shipments/page.tsx`
- `client/src/features/coupang/shipments/fulfillment-shell.tsx`
- `client/src/features/coupang/shipments/fulfillment-toolbar.tsx`
- `client/src/features/coupang/shipments/fulfillment-summary-bar.tsx`
- `client/src/features/coupang/shipments/fulfillment-selection-controller.tsx`
- `client/src/features/coupang/shipments/fulfillment-grid-controller.tsx`
- `client/src/features/coupang/shipments/fulfillment-drawer-controller.tsx`
- `client/src/features/coupang/shipments/fulfillment-decision.ts`
- `client/src/features/coupang/shipments/fulfillment-filter-summary.ts`
- `client/src/features/coupang/shipments/coupang-status-view.ts`
- `client/src/features/coupang/shipments/quick-collect-focus.ts`
- `client/src/features/coupang/shipments/quick-collect-focus-controller.ts`
- `client/src/features/coupang/shipments/shipment-column-presets.ts`
- `client/src/features/coupang/shipments/shipment-base-filters.tsx`
- `client/src/features/coupang/shipments/shipment-worksheet-overview.tsx`
- `client/src/features/coupang/shipments/shipment-selection-action-bar.tsx`
- `client/src/features/coupang/shipments/shipment-worksheet-panel.tsx`
- `client/src/features/coupang/shipments/shipment-archive-panel.tsx`
- `client/src/features/coupang/shipments/shipment-decision-drawer.tsx`
- `client/src/features/coupang/shipments/quick-collect-focus.test.ts`
- `client/src/features/coupang/shipments/quick-collect-focus-controller.test.ts`
- `client/src/lib/coupang-order-status.ts`
- `client/src/lib/coupang-order-status.test.ts`
- `server/services/coupang/shipment-worksheet-service.ts`
- `server/services/coupang/shipment-worksheet-view.ts`
- `server/services/coupang/shipment-worksheet-view.test.ts`
- `client/src/features/coupang/shipments/shipment-prepare-flow.ts`
- `client/src/features/coupang/shipments/shipment-prepare-flow.test.ts`
- `server/stores/work-data-coupang-shipment-worksheet-store.ts`
- `server/http/coupang/tracked-actions.ts`
- `server/http/handlers/coupang/orders.ts`
- `server/http/handlers/coupang/shipments.ts`
- `server/http/coupang/parsers.ts`
- `server/routes/coupang/shipments.ts`
- `server/services/coupang/shipment-worksheet-collection.test.ts`
- `shared/coupang.ts`
- `shared/coupang-status.ts`
- `shared/operations.ts`
- `docs/qa/manual-fulfillment-regression.md`
- `docs/qa/work-center-recovery-scenarios.md`
- `docs/deployment/cloud-run-branch-deployments.md`
- `docs/deployment/cloud-run-smoke-check.md`

## 검증

### 통과
- `npm run check`
- `npm test -- server/services/coupang/order-service.test.ts server/services/coupang/shipment-worksheet-collection.test.ts server/services/coupang/shipment-worksheet-service.test.ts server/services/naver-order-service.test.ts`
- `npm exec vitest run --root . server/services/coupang/shipment-worksheet-collection.test.ts`
- `npm test -- server/services/coupang/shipment-worksheet-collection.test.ts`
- `npm exec vitest run --root . client/src/features/coupang/shipments/shipment-prepare-flow.test.ts`
- `npm exec vitest run --root . client/src/lib/ops-handoff-links.test.ts client/src/features/coupang/shipments/quick-collect-focus-controller.test.ts client/src/pages/operation-center-recovery.test.ts`

### 아직 직접 검증하지 못한 것
- 브라우저에서 실제 클릭 기반의 완전한 수동 검증
  - 빠른 수집 후 신규 주문 집중 보기 상호작용
  - 혼합 선택 후 자동 제외 실행
  - 보관함 / 화면 설정 전환 이후 주요 액션 비활성화 흐름
  - Drawer / 전체 상세 dialog 왕복 흐름
  - 작업센터 복구 묶음 카드와 리스트 우선순위 체감
  - 작업센터 상세 패널의 재시도 버튼, 티켓 상세, payload foldout 상호작용

## 남은 이슈

- `client/src/features/coupang/shipments/page.tsx`는 여전히 상태, query, action handler가 많은 coordinator 파일입니다.
- 다만 render 조립, quick collect view state 계산, drawer mounting 책임은 분리됐습니다.
- 기본 작업 보기의 가로 폭은 프리셋으로 1차 완화했지만, 합성 컬럼 기반 압축은 아직 남아 있습니다.
- 작업센터는 recovery-first 구조로 더 선명해졌지만, 브라우저 클릭 기반 체감 검증은 아직 남아 있습니다.
