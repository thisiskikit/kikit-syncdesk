# Render 분리 배포 가이드

## 목표

현재 프로젝트를 다음 구조로 배포한다.

- 프론트엔드: 정적 사이트
- 백엔드: Node 기반 웹 서비스
- 데이터베이스: 기존 Google Postgres 유지
- 배포 방식: GitHub push 후 자동 배포

이 가이드는 기존 기능과 한국어 UI를 유지하면서, 가장 적은 구조 변경으로 배포하는 경로를 기준으로 정리했다.

## 추천 배포 구조

```text
GitHub
  ├─ main push
  │   ├─ Render Static Site
  │   │   └─ client build 결과 배포
  │   └─ Render Web Service
  │       ├─ Node/Express 서버 실행
  │       ├─ Persistent Disk 사용
  │       └─ Google Postgres 연결
  └─ Google Postgres
```

권장 도메인 예시:

- 프론트엔드: `https://app.example.com`
- 백엔드: `https://api.example.com`

## 이번에 반영한 코드 변경

분리 배포를 위해 아래 진입점을 추가하거나 수정했다.

- 프론트 API base URL helper:
  - [client/src/lib/api-url.ts](/D:/Dev/Archive_3.0/kikit_price_change/client/src/lib/api-url.ts)
- 프론트 fetch 공통화:
  - [client/src/lib/queryClient.ts](/D:/Dev/Archive_3.0/kikit_price_change/client/src/lib/queryClient.ts)
- SSE 절대 URL 대응:
  - [client/src/components/operation-provider.tsx](/D:/Dev/Archive_3.0/kikit_price_change/client/src/components/operation-provider.tsx)
- 첨부 다운로드 URL 대응:
  - [client/src/components/product-library-drawer.tsx](/D:/Dev/Archive_3.0/kikit_price_change/client/src/components/product-library-drawer.tsx)
- CORS 미들웨어:
  - [server/http/cors.ts](/D:/Dev/Archive_3.0/kikit_price_change/server/http/cors.ts)
- 헬스체크 엔드포인트:
  - [server/routes/health.ts](/D:/Dev/Archive_3.0/kikit_price_change/server/routes/health.ts)
- 백엔드 단독 배포 시 정적 서빙 끄기:
  - [server/index.ts](/D:/Dev/Archive_3.0/kikit_price_change/server/index.ts)
- 백엔드 전용 빌드 스크립트:
  - [script/build-server.ts](/D:/Dev/Archive_3.0/kikit_price_change/script/build-server.ts)
- 배포용 환경변수 예시:
  - [.env.example](/D:/Dev/Archive_3.0/kikit_price_change/.env.example)
- Render Blueprint 초안:
  - [render.yaml](/D:/Dev/Archive_3.0/kikit_price_change/render.yaml)

## 사전 확인

배포 전에 로컬에서 아래 명령이 통과해야 한다.

1. `npm run check`
2. `npm run build:server`
3. `npm run build:client`

현재 이 세 단계는 통과한 상태다.

## Render에 올리는 순서

### 1. GitHub 저장소 준비

1. 이 프로젝트를 GitHub 저장소에 올린다.
2. 기본 배포 브랜치를 `main` 또는 원하는 운영 브랜치로 정한다.
3. 이후 Render는 이 브랜치에 push 될 때 자동 배포한다.

### 2. Render Blueprint로 두 서비스를 만든다

1. Render Dashboard에서 `New > Blueprint`를 선택한다.
2. GitHub 저장소를 연결한다.
3. 루트의 [render.yaml](/D:/Dev/Archive_3.0/kikit_price_change/render.yaml)을 사용한다.
4. Blueprint sync를 실행한다.

생성 대상:

- `kikit-price-change-web`
- `kikit-price-change-api`

## 백엔드 설정

### Render Web Service

백엔드는 `Node Web Service`로 올라간다.

- Build Command: `npm ci && npm run build:server`
- Start Command: `npm run start:once`
- Health Check: `/api/health`

### 백엔드 필수 환경변수

아래 값은 Render Dashboard 또는 Blueprint 환경변수에서 반드시 채워야 한다.

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT=10000`
- `SERVE_CLIENT_STATIC=false`
- `DATABASE_URL=...`
- `MASTER_SKU_DATABASE_URL=...`
- `CORS_ALLOWED_ORIGINS=https://app.example.com`

### Persistent Disk

백엔드에는 Persistent Disk를 붙여야 한다.

권장 마운트 경로:

- `/var/data`

권장 파일 경로:

- `LOG_DIR=/var/data/logs`
- `OPERATION_LOG_FILE=/var/data/operation-logs.json`
- `UI_STATE_FILE=/var/data/ui-state.json`
- `CHANNEL_SETTINGS_FILE=/var/data/channel-settings.json`
- `COUPANG_SETTINGS_FILE=/var/data/coupang-settings.json`
- `COUPANG_PRODUCT_CACHE_FILE=/var/data/coupang-product-cache.json`
- `NAVER_PRODUCT_CACHE_FILE=/var/data/naver-product-cache.json`
- `NAVER_PRODUCT_SELLER_BARCODE_CACHE_FILE=/var/data/naver-product-seller-barcode-cache.json`
- `NAVER_PRODUCT_MEMO_FILE=/var/data/naver-product-memos.json`
- `COUPANG_SHIPMENT_WORKSHEET_FILE=/var/data/coupang-shipment-worksheet.json`
- `COUPANG_BULK_PRICE_FILE=/var/data/coupang-bulk-price.json`
- `NAVER_BULK_PRICE_FILE=/var/data/naver-bulk-price.json`

디스크 크기는 우선 `20GB`부터 시작하는 편이 안전하다. 현재 쿠팡 상품 캐시 파일이 큰 편이라 너무 작게 잡으면 운영 중 금방 부족해질 수 있다.

## 프론트엔드 설정

### Render Static Site

프론트는 정적 사이트로 배포한다.

- Build Command: `npm ci && npm run build:client`
- Publish Directory: `dist/public`

### 프론트 필수 환경변수

- `VITE_API_BASE_URL=https://api.example.com`

프론트는 모든 API 요청과 SSE 연결을 이 값을 기준으로 백엔드에 붙는다.

## 도메인 연결

1. 프론트 서비스에 `app.example.com` 연결
2. 백엔드 서비스에 `api.example.com` 연결
3. 백엔드의 `CORS_ALLOWED_ORIGINS`를 프론트 도메인으로 맞춤
4. 프론트의 `VITE_API_BASE_URL`을 백엔드 도메인으로 맞춤

두 값이 서로 맞지 않으면 화면은 떠도 데이터 조회가 실패한다.

## GitHub push 후 자동 배포

초기 연결 이후에는 아래 흐름으로 운영한다.

1. 로컬에서 수정
2. `npm run check`
3. 필요하면 `npm run test`
4. 커밋 후 GitHub에 push
5. Render가 자동으로 frontend/backend를 각각 재배포
6. `/api/health`와 주요 메뉴를 스모크 테스트

## Google Postgres 연결 주의사항

현재 코드는 `DATABASE_URL`로 직접 Postgres에 연결한다. 따라서 기존 Google Postgres가 어떤 네트워크 방식으로 열려 있는지 먼저 확인해야 한다.

### 가장 단순한 경우

기존 Google Postgres가 public IP 접속을 허용하고, Render 쪽에서 접근 가능한 상태면 지금 구조 그대로 쓸 수 있다.

### 막힐 수 있는 경우

- DB가 private IP 전용인 경우
- DB가 authorized networks 또는 SSL 조건이 엄격한 경우

이 경우 선택지는 두 가지다.

1. Google Postgres의 public IP + 허용 IP + SSL 기준으로 Render 백엔드가 접속 가능하게 만든다.
2. 백엔드를 GCP 내부로 옮기거나, 이후 Docker 기반 배포로 Cloud SQL Auth Proxy를 붙이는 방향으로 간다.

지금 프로젝트는 최소 변경이 목표이므로, 가장 먼저 확인할 것은 "기존 Google Postgres에 Render에서 직접 붙을 수 있는가"다.

## 운영 체크리스트

배포 직후 아래를 확인한다.

1. 백엔드 `/api/health`가 200을 반환하는지 확인
2. 프론트 첫 화면 진입 시 메뉴가 정상 표시되는지 확인
3. 설정 메뉴에서 스토어 목록이 읽히는지 확인
4. SSE가 붙는 기능에서 실시간 상태가 들어오는지 확인
5. 로그 파일과 캐시 파일이 `/var/data` 아래에 실제 생성되는지 확인
6. 백엔드 재배포 후에도 `ui-state`, `logs`, `cache`가 유지되는지 확인

## 현재 운영 한계

아직 아래 제약은 남아 있다.

- 백엔드는 단일 인스턴스 운영이 안전하다.
- Persistent Disk를 붙였기 때문에 무중단 배포가 깨진다.
- 일부 저장소는 아직 파일 기반이다.
- 다음 파일들은 추후 DB/Redis 쪽으로 더 옮길 후보이다.
  - [server/services/coupang/bulk-price-store.ts](/D:/Dev/Archive_3.0/kikit_price_change/server/services/coupang/bulk-price-store.ts)
  - [server/services/naver/bulk-price-store.ts](/D:/Dev/Archive_3.0/kikit_price_change/server/services/naver/bulk-price-store.ts)
  - [server/services/shared/work-data-db.ts](/D:/Dev/Archive_3.0/kikit_price_change/server/services/shared/work-data-db.ts)

## 추천 운영 결론

지금 구조에서 가장 무난한 운영 방법은 아래다.

- 프론트: Render Static Site
- 백엔드: Render Web Service
- 파일 저장: Render Persistent Disk
- DB: 기존 Google Postgres
- 배포: GitHub push 기반 자동 배포

이 방식은 현재 구조를 크게 흔들지 않으면서도, frontend/backend 분리 배포와 자동 배포를 가장 빠르게 달성할 수 있다.
