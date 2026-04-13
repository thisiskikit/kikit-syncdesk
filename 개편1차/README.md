# 2026-04-12-시스템 개발-운영데스크UI-KIKITSyncDeskUI개편1차

이 패키지는 `KIKIT SyncDesk`를 **채널 중심 관리자 콘솔**에서 **액션 중심 운영 데스크**로 재정의하고, 그 해석을 실제 UI/IA/공통 상태 모델/구현 순서/문서 업데이트 요구사항까지 연결한 실행 문서 세트입니다.

## 포함 파일
1. `01-product-reframing.md`
2. `02-information-architecture.md`
3. `03-dashboard-redesign.md`
4. `04-fulfillment-redesign.md`
5. `05-decision-model.md`
6. `06-visual-guidelines.md`
7. `07-implementation-plan.md`
8. `08-docs-update-requirements.md`
9. `09-master-implementation-prompt.md`

## 사용 순서
1. `01~08` 문서를 모두 읽어 제품 해석과 구현 기준을 고정합니다.
2. 현재 코드와 문서를 비교해 충돌 지점을 식별합니다.
3. `09-master-implementation-prompt.md`를 실행 프롬프트로 사용해 UI 개편을 진행합니다.
4. 코드 수정과 동시에 지정된 docs를 반드시 함께 업데이트합니다.

## 이 패키지의 목표
- `KIKIT SyncDesk`의 제품 정체성을 **운영 데스크**로 고정
- Dashboard / Fulfillment를 1차 핵심 화면으로 재설계
- 출고 판단 상태와 사유 체계를 UI의 공통 언어로 통일
- 레거시 상품/가격 툴 흔적을 메인 동선에서 제거
- 코드 수정과 문서 수정을 하나의 작업 세트로 강제
