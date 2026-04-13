# 개편 2차-1 — 출고 화면 coordinator 분해

## 작업 목적
`kikit-syncdesk`의 `codex/dev` 기준으로, 출고 화면의 coordinator 책임을 줄이고 상태 흐름 충돌 위험을 낮춥니다.  
이번 작업은 **새 기능 추가**가 아니라 **구조 분해와 안정화**가 목적입니다.

## 반드시 먼저 읽을 문서
- `2026-04-13-시스템개발-syncdesk-개편2차-00-common-rules.md`
- `docs/current-status.md`
- `docs/decisions/2026-04-12-syncdesk-operation-desk-ia.md`

## 작업 목표
`client/src/features/coupang/shipments/page.tsx`를 중심으로 출고 화면 구조를 분해합니다.

## 반드시 달성할 것
1. coordinator 파일의 책임을 줄입니다.
2. 아래 책임 단위로 모듈을 분리합니다.
   - shell
   - toolbar / filters
   - summary
   - grid controller
   - selection action controller
   - drawer controller
   - quick collect focus controller
3. 아래 기존 동작은 유지합니다.
   - 출고 판단 탭
   - 세부 필터
   - 선택 일괄 작업
   - drawer 상세 확인
   - quick collect 신규 주문 집중 보기
4. 상태 계산 로직을 JSX 렌더 트리 내부에 흩뿌리지 않습니다.
5. 상태 책임과 UI 책임을 함께 분리합니다.
6. 상태 충돌 가능성이 높은 부분에 테스트를 보강합니다.
7. 아래 문서를 함께 갱신합니다.
   - `docs/current-status.md`
   - `docs/change-log.md`
   - `docs/structure-overview.md`

## 권장 분해 방향
아래 예시는 강제 파일명이 아니라 책임 예시입니다.
- `fulfillment-shell.tsx`
- `fulfillment-toolbar.tsx`
- `fulfillment-summary-bar.tsx`
- `fulfillment-grid-controller.tsx`
- `fulfillment-selection-controller.tsx`
- `fulfillment-drawer-controller.tsx`
- `quick-collect-focus-controller.ts`

## 하지 말 것
- 새 출고 기능 추가
- 서버 API shape 변경
- CS / 채널 화면 개편 동시 진행
- 전면 디자인 재작업

## 완료 기준
- `page.tsx`는 조립 역할만 남습니다.
- 출고 화면의 핵심 상태 흐름이 모듈별로 읽힙니다.
- 기존 동작은 유지됩니다.
- 관련 테스트와 docs가 함께 갱신됩니다.

## 최종 보고 형식
1. 변경한 파일 목록
2. 구조를 어떻게 분해했는지
3. 유지된 동작 / 달라진 내부 구조
4. 테스트 결과
5. 직접 검증 못 한 것
6. 남은 위험
7. docs 반영 내용
