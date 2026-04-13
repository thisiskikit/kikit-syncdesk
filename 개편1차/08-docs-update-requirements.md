# 08. Docs Update Requirements

## 문서 목적
이 문서는 UI 개편 코드 수정과 함께 반드시 업데이트되어야 하는 프로젝트 문서와 그 업데이트 기준을 정의합니다.  
`KIKIT SyncDesk`에서는 **코드 수정과 문서 수정이 하나의 작업 세트**입니다.

---

## 1) 반드시 업데이트할 문서
아래 문서는 이번 작업과 함께 반드시 업데이트합니다.

1. `docs/current-status.md`
2. `docs/change-log.md`
3. `docs/structure-overview.md`

필요 시 추가:
4. `docs/decisions/...`
5. `docs/handoffs/...`

---

## 2) docs/current-status.md 업데이트 기준
### 반드시 반영할 내용
- 제품 정체성 변화: 운영 데스크 중심
- 상위 IA 변경
- Dashboard 역할 재정의
- Fulfillment 역할 재정의
- 상태/사유 체계 도입
- 메인 동선에서 제거된 레거시 노출
- 작업센터/채널 포지셔닝 변경
- 아직 미완료인 항목

### 기록 스타일
- 현재 실제 동작 상태를 기준으로 씁니다.
- 확인하지 못한 내용은 `추정`으로 표기합니다.
- “완료”는 실제 코드/화면/테스트로 확인된 경우에만 사용합니다.

---

## 3) docs/change-log.md 업데이트 기준
### 반드시 반영할 항목
- Navigation / IA 변경
- Dashboard UI 변경
- Fulfillment UI 변경
- shared badge/drawer/decision model 추가 또는 수정
- 레거시 기능 메인 노출 제거
- 문구/empty state 변경
- 라우트 redirect 또는 wrapper 도입

### 형식
- 날짜
- 변경 요약
- 영향 범위
- 주의점 / 후속 과제

---

## 4) docs/structure-overview.md 업데이트 기준
### 반드시 반영할 내용
- 새 상위 메뉴 구조
- 라우트 재귀속
- Dashboard / Fulfillment / Channel / Work Center 간 관계
- 상태/사유 체계가 어느 컴포넌트에서 재사용되는지
- Drawer 중심 상세 확인 패턴
- 레거시 제거/은닉 정책

### 목표
구조 문서를 읽는 사람이 코드 없이도
“왜 이 제품이 운영 데스크로 재구성되었는지” 이해할 수 있어야 합니다.

---

## 5) docs/decisions 사용 기준
아래 수준의 구조적 변화가 발생하면 decision 문서를 추가합니다.

### decision 문서로 남길 가치가 있는 항목
- 채널 중심 IA에서 액션 중심 IA로 전환한 이유
- 출고 판단 상태 모델을 별도로 둔 이유
- Drawer 중심 상세 패턴을 채택한 이유
- 레거시 기능을 메인 동선에서 제거한 이유

### 추천 파일명 예시
- `docs/decisions/2026-04-12-operation-desk-ia.md`
- `docs/decisions/2026-04-12-fulfillment-decision-model.md`

---

## 6) docs/handoffs 사용 기준
다음 작업자에게 이어줘야 할 내용이 있으면 handoff 문서를 남깁니다.

### 포함할 내용
- 이번 차수에 실제 반영한 범위
- 의도적으로 미룬 범위
- 코드상 남아 있는 레거시 흔적
- QA에서 발견한 애매한 포인트
- 다음 차수 추천 작업

---

## 7) 문서 품질 기준
### 해야 할 것
- 코드 변경 이유를 적기
- 사용자 행동 흐름이 어떻게 바뀌는지 적기
- 남은 리스크를 정직하게 남기기
- 미적용 범위를 명확히 분리하기

### 하지 말 것
- 구현되지 않은 내용을 완료로 적기
- 추측을 사실처럼 쓰기
- UI만 바뀐 것처럼 쓰기
- 문서 없이 코드만 바꾸고 끝내기

---

## 8) 체크리스트
커밋 또는 작업 마무리 전에 아래를 확인합니다.

- [ ] `docs/current-status.md` 업데이트 완료
- [ ] `docs/change-log.md` 업데이트 완료
- [ ] `docs/structure-overview.md` 업데이트 완료
- [ ] 필요 시 decision 문서 작성
- [ ] 필요 시 handoff 문서 작성
- [ ] 미적용 범위 명시
- [ ] 테스트 및 확인 범위 기록

---

## 9) 최종 원칙
이번 UI 개편은 **화면만 예쁘게 바꾸는 작업이 아니라 제품 해석을 바꾸는 작업**입니다.  
따라서 문서도 “스타일이 바뀌었다”가 아니라,  
**제품이 어떤 구조와 운영 언어로 재정의되었는가**를 함께 남겨야 합니다.
