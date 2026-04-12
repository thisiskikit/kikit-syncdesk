# Structure Overview

- 스냅샷 날짜: 2026-04-12
- 목적: 현재 KIKIT SyncDesk가 어떤 top-level 구조와 화면 책임을 가지는지 설명합니다.

## 1. 최상위 구조

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
  coupang.ts
  operations.ts
  schema.ts
  ...공유 계약

docs/
  current-status.md
  change-log.md
  structure-overview.md
  decisions/
  handoffs/
```

## 2. 앱 셸

- 진입점: `client/src/App.tsx`
- 주요 책임:
  - 브랜드 및 상단 주요 메뉴
  - 멀티탭 workspace strip
  - top-level route 전환
  - 작업 상태 패널

### 현재 상단 주요 메뉴
- `대시보드`
- `출고`
- `CS`
- `채널`
- `작업센터`
- `설정`

핵심 원칙:
- NAVER / COUPANG 같은 채널명은 더 이상 top-level 주인공이 아닙니다.
- top-level은 운영 목적 중심입니다.

## 3. 라우트 소유권

| Route | 역할 | 주 구현 파일 |
| --- | --- | --- |
| `/dashboard` | 오늘의 운영 시작점 | `client/src/pages/dashboard.tsx` |
| `/fulfillment` | 출고 판단 + 송장 작업 + 예외 확인 | `client/src/pages/fulfillment.tsx` -> `client/src/features/coupang/shipments/page.tsx` |
| `/cs` | CS 허브 / deep-link 진입 | `client/src/pages/cs-hub.tsx` |
| `/channels` | 채널 연결 및 원본 화면 허브 | `client/src/pages/channels-hub.tsx` |
| `/work-center` | 실패 작업 복구 중심 로그 화면 | `client/src/pages/operation-center.tsx` |
| `/settings` | 설정 및 고급/레거시 도구 허브 | `client/src/pages/settings-hub.tsx` |

### 연결 규칙
- `/operations` -> `/work-center`
- `/coupang/shipments` -> `/fulfillment`
- `/naver` -> `/channels`
- `/coupang` -> `/channels`
- `/runs` -> `/engine/runs`
- `/drafts/:id` -> `/engine/drafts/:id`

## 4. 출고 화면 구조

출고 화면의 구현 중심은 여전히 쿠팡 배송/송장 feature이지만, 화면 위계는 운영 데스크 기준으로 다시 짰습니다.

### 현재 출고 화면 계층
1. 페이지 헤더
2. 1차 액션
   - `빠른 수집`
   - `결제완료 -> 상품준비중`
   - `송장 입력`
   - `송장 전송`
3. 2차 액션
   - `누락 검수`
   - `보관함`
   - `화면 설정`
4. 기본 필터
   - 스토어
   - 기간
   - 검색
   - 보기 범위
5. 출고 판단 탭
6. 결과 요약
7. 현재 적용 조건
8. 세부 필터
9. 메인 워크시트 테이블
10. 선택 일괄 작업 바
11. 우측 Drawer
12. 깊은 상세 다이얼로그

### 출고 필터 위계
- 메인 축:
  - `출고 판단`
- 보조 범위:
  - `작업 대상`
  - `배송 이후`
  - `예외·클레임`
  - `전체`
- 세부 축:
  - `송장 상태`
  - `출력 상태`
  - `주문 상태`

의도:
- 운영자는 먼저 `지금 무엇을 처리해야 하는가`를 본 뒤,
- 그 다음에 `어느 업무 구역인가`,
- 마지막으로 `세부 상태`를 좁히게 합니다.

### 출고 판단 모델
`client/src/features/coupang/shipments/fulfillment-decision.ts`

- `출고 가능`
- `송장 대기`
- `보류`
- `차단`
- `재확인 필요`

대표 사유는 테이블, 요약, Drawer에서 같은 언어로 보여줍니다.

### 빠른 수집 직후 신규 주문 집중 보기
`client/src/features/coupang/shipments/quick-collect-focus.ts`

- `new_only` 빠른 수집 후 실제로 추가된 주문이 있으면 그 주문만 임시로 먼저 보여줍니다.
- 현재 스토어와 출고 판단 탭은 유지합니다.
- 검색, 범위, 세부 필터는 집중 보기 중에는 우선 적용하지 않습니다.
- 필터 변경, 새로고침, 탭 이동 시 자동 해제됩니다.

### 컬럼 보기 프리셋
`client/src/features/coupang/shipments/shipment-column-presets.ts`

- `작업 보기`
- `송장 입력 보기`
- `전체 열 보기`

의도:
- 기본 작업 흐름의 가로 스크롤을 줄입니다.
- 기존 persisted 사용자 컬럼 설정은 강제로 바꾸지 않습니다.
- 사용자가 프리셋을 직접 적용할 때만 컬럼 집합/폭이 바뀝니다.

### 출고 supporting modules
- `shipment-base-filters.tsx`
  - 스토어 / 기간 / 검색 / 보기 범위
- `shipment-worksheet-overview.tsx`
  - 출고 판단 탭, 요약, 현재 적용 조건, 세부 필터
- `shipment-selection-action-bar.tsx`
  - 혼합 선택 요약과 실행 CTA
- `shipment-worksheet-panel.tsx`
  - 작업 화면 카드 shell, 빈 상태, 페이지네이션
- `shipment-archive-panel.tsx`
  - 보관함 카드 shell, 빈 상태, 페이지네이션
- `shipment-decision-drawer.tsx`
  - 출고 판단 우선의 얇은 상세 패널

## 5. 작업센터 구조

- 구현 파일: `client/src/pages/operation-center.tsx`
- 역할:
  - 실패 작업 복구 우선의 작업 로그 화면

### 현재 동작
- 경고 / 오류 / 재시도 가능 / 진행 중 / 느린 요청을 우선 정렬합니다.
- 메인 목록은 얇게 유지합니다.
- 재시도는 목록과 상세 모두에서 접근할 수 있습니다.
- 원본 요청 payload, 정규화 payload, 에러 JSON은 상세 패널의 접힘 섹션에 둡니다.

### 작업 티켓 상세
- 메인 목록에는 보이지 않습니다.
- 상세 패널에서만 `작업 티켓 상세` 섹션을 보여줍니다.
- 최대 5건까지만 기록합니다.
- 우선순위는 `실패 -> 경고 -> 건너뜀 -> 성공`입니다.
- 현재 적용 대상:
  - 배송/송장 수집
  - 상품준비중 처리
  - 송장 업로드
  - 송장 수정

## 6. CS / 채널 / 설정 구조

### CS
- 구현 파일: `client/src/pages/cs-hub.tsx`
- 역할:
  - 채널별 문의/클레임 화면으로 보내는 허브
  - 출고 판단에 영향을 주는 이슈로 이어지는 진입점

### 채널
- 구현 파일: `client/src/pages/channels-hub.tsx`
- 역할:
  - 채널 연결 화면
  - 원본 채널 작업 화면 진입
  - 고급/레거시 도구 노출

### 설정
- 구현 파일: `client/src/pages/settings-hub.tsx`
- 역할:
  - 연결 설정
  - 초안 / 실행 이력 / 고급 도구 진입

## 7. 레거시 노출 정책

메인 동선에서 아래 항목은 숨기거나 낮췄습니다.
- `bulk-price`
- `product-edit`
- `grouped products`
- `Draft / Runs` 상위 노출

정책:
- direct URL은 즉시 삭제하지 않습니다.
- 필요 시 `채널` 또는 `설정` 아래에서 접근합니다.
- 메인 top-level 동선에서는 운영 목적 화면이 우선입니다.

## 8. 백엔드 관계

이번 개편은 주로 화면 구조와 operator-facing 정보 위계 변경입니다.

- 대시보드 전용 신규 백엔드는 만들지 않았습니다.
- 기존 API를 재사용합니다.
  - `/api/settings/stores`
  - `/api/coupang/stores`
  - `/api/ui-state`
  - `/api/coupang/shipments/worksheet/view`
  - `/api/logs`
- 빠른 수집 집중 보기와 작업센터 티켓 상세처럼, 기존 계약에 필요한 필드만 최소 확장했습니다.
  - `shared/coupang.ts`
  - `shared/operations.ts`

## 9. 현재 구조에서 아직 남아 있는 일

- `client/src/features/coupang/shipments/page.tsx`는 여전히 큰 coordinator 파일입니다.
- 출고 그리드는 프리셋으로 1차 완화했지만, 합성 컬럼 기반의 2차 압축은 아직 남아 있습니다.
- 작업센터 상세 helper 분리는 아직 하지 않았습니다.
- 빌드 경고 2건이 남아 있습니다.
  - CSS minify `sourceMappingURL`
  - 메인 청크 크기
