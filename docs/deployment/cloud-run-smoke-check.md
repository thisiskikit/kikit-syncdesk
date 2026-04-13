# Cloud Run 스모크 체크 / 롤백

## 대상

- `main` 배포
  - 워크플로우 이름: `Cloud Run Prod Deploy`
  - 서비스: `kikit-price-change`
- `codex/dev` 배포
  - 워크플로우 이름: `Cloud Run Dev Deploy`
  - 서비스: `kikit-price-change-dev`

## 배포 직후 1차 확인

1. GitHub Actions에서 대상 브랜치와 서비스가 맞는지 확인합니다.
2. Cloud Run revision이 새 SHA 이미지로 갱신됐는지 확인합니다.
3. 배포 실패 시 바로 이전 revision을 메모해 둡니다.

## 화면 스모크 체크

1. `/dashboard`
   - 히어로와 핵심 액션 카드가 정상 렌더됩니다.
   - 최근 이슈 또는 빠른 작업 패널이 비정상 empty state로 깨지지 않습니다.
2. `/fulfillment`
   - 기본 스토어와 필터가 로드됩니다.
   - 워크시트 목록이 열리고, 행 클릭 시 Drawer가 열립니다.
   - `보류 / 차단 / 재확인 필요` 상태에서 `CS 허브` 또는 `작업센터` 연결 버튼이 보입니다.
3. `/work-center`
   - 로그 목록이 로드됩니다.
   - 상세 열기 후 `관련 출고 보기`, `CS 허브 열기` 링크가 비정상 없이 보입니다.
4. `/channels`
   - `연결 상태 / 점검`, `원본 화면 진입`, `채널별 주요 도구` 섹션이 보입니다.
5. `/settings`
   - `연결 설정`, `운영 고급 도구`, `레거시 / 직접 진입` 섹션이 보입니다.

## 운영 체크 포인트

- `codex/dev`와 `main`은 서비스만 분리되고 Cloud SQL / 시크릿은 같습니다.
- 따라서 dev에서 실행한 실제 쓰기 작업이 운영 데이터에 영향을 줄 수 있습니다.
- dev smoke check는 조회 위주로 먼저 확인하고, 쓰기 동작은 꼭 필요한 경우에만 최소 범위로 확인합니다.

## 롤백 포인트

### 가장 빠른 롤백
- Cloud Run 콘솔에서 직전 안정 revision으로 트래픽을 되돌립니다.
- 장애가 화면 회귀인지 인프라 문제인지 분리하기 전에는 이 경로가 가장 빠릅니다.

### 코드 기준 롤백
- 문제가 특정 SHA부터 시작됐다면 이전 안정 SHA 기준으로 다시 배포합니다.
- `main`은 prod workflow, `codex/dev`는 dev workflow를 기준으로 같은 서비스에 다시 올립니다.

## 현재 확인된 빌드 리스크

- 2026-04-13 기준 Vite build는 vendor chunk와 route chunk를 분리해 500k 초과 chunk warning을 제거했습니다.
- 남은 경고는 `node_modules/react-data-grid/lib/styles.css`의 `//# sourceMappingURL=styles.css.map` 코멘트 때문에 발생하는 CSS minify warning입니다.
- 이 경고는 현재 빌드를 실패시키지 않으며, upstream dependency 정리 전까지는 알려진 비차단 경고로 관리합니다.
