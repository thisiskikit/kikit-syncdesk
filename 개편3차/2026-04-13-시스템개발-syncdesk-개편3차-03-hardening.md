# 개편 3차-3 — 성능 / 배포 / 운영 하드닝

## 작업 목적
`kikit-syncdesk`의 `codex/dev` 기준으로, 운영 도구로서 실제 배포와 사용에 더 안전하도록
성능/배포/운영 검증 체계를 정리합니다.

## 반드시 먼저 읽을 문서
- `2026-04-13-시스템개발-syncdesk-개편3차-00-common-rules.md`
- `docs/current-status.md`
- `docs/deployment/cloud-run-branch-deployments.md`

## 작업 목표
개편 1차와 2차로 바뀐 구조를 운영 환경에 더 안전하게 올릴 수 있도록,
chunk / workflow naming / smoke check / 운영 검증 문서를 정리합니다.

## 반드시 달성할 것
1. 남아 있는 빌드/청크 관련 경고를 줄이거나 원인을 문서화합니다.
2. 배포 workflow naming 또는 설명 혼선을 줄입니다.
3. branch deployment / smoke check / rollback 포인트를 더 명확히 문서화합니다.
4. 운영자가 배포 후 무엇을 확인해야 하는지 짧은 체크리스트를 정리합니다.
5. 꼭 필요한 범위에서만 코드 분할 또는 lazy loading 개선을 검토합니다.
6. 관련 docs를 함께 갱신합니다.

## 권장 구현 방향
- 너무 큰 메인 청크가 있으면 안전한 범위에서 분리 검토
- workflow 파일 이름/설명/문서 사이 명칭 일관성 정리
- `docs/deployment` 아래 운영 체크 문서 추가 가능
- smoke check 는 dashboard / fulfillment / work-center / channels 정도 핵심 축으로 정리

## 하지 말 것
- 대규모 번들 구조 재작성
- 인프라 전체 재설계
- unrelated performance micro-optimization
- 실제 운영을 모르는 상태에서 과한 추상화 도입

## 완료 기준
- 배포/운영 문서가 더 명확해집니다.
- 이름 혼선이 줄어듭니다.
- 최소한의 smoke check 체계가 생깁니다.
- 필요 시 성능 개선 근거가 남습니다.

## 최종 보고 형식
1. 변경한 파일 목록
2. 하드닝 포인트 요약
3. 실제 줄인 위험 / 문서화한 위험
4. 테스트 및 검증 결과
5. 직접 검증 못 한 것
6. 남은 위험
7. docs 반영 내용
