# 웹 운영 구조 가이드

## 목적

이 문서는 현재 프로젝트를 "웹에서 장기 운영 가능한 구조"로 유지하기 위한 기준 문서다.

- 기존 기능과 API 계약을 유지한 채 구조를 점진 분해한다.
- 신규 기능 추가 시 어디에 무엇을 넣어야 하는지 빠르게 판단할 수 있게 한다.
- 배포 전 체크 항목과 남은 기술부채를 함께 관리한다.

## 현재 구조 트리

```text
client/
  src/
    pages/                  # 라우트 엔트리. 가능한 한 feature page re-export만 유지
    features/
      coupang/
        products/
        shipments/
        bulk-price/
      naver/
        bulk-price/
      shared/
        bulk-price/
    components/             # 여러 feature가 공통으로 쓰는 UI 조립 요소
    lib/                    # React/브라우저 공통 유틸

server/
  index.ts                  # 서버 시작 진입점
  routes.ts                 # API mount 진입점
  routes/                   # Express router 등록 계층
    coupang/
  http/
    handlers/               # request validation + usecase 호출 + response 반환
    parsers/                # 공통 입력 파싱
    responders/             # 공통 응답 shaping
    coupang/                # 채널별 HTTP helper
  application/
    coupang/
      products/
      orders/
      bulk-price/
    naver/
      products/
      bulk-price/
  domain/
    coupang/
    naver/
  infra/
    coupang/
    naver/
  interfaces/              # repository/store port
  stores/                  # file/work-data concrete adapter
  services/                # 레거시 facade 또는 아직 이전 중인 영역
  adapters/                # 채널 adapter
  integrations/            # 외부 내부시스템 연동

shared/
  ...                      # client/server 공통 계약, 스키마, 타입

docs/
  architecture/
    web-operations-structure.md
```

## 폴더 역할 규칙

### client

- `client/src/pages`
  - 라우트 연결만 담당한다.
  - 새 페이지 로직을 직접 넣지 않는다.
  - 권장 형태는 `export { FeaturePage as default } from "../features/...";` 이다.

- `client/src/features/<channel>/<feature>`
  - 실제 화면 기능의 기본 위치다.
  - 최소 단위는 `page.tsx + index.ts`다.
  - 화면이 커지면 `sections`, `hooks`, `grid-config`, `formatters`, `mappers`, `actions`, `api`, `state`로 분리한다.

- `client/src/components`
  - 여러 feature가 같이 쓰는 공용 UI만 둔다.
  - 특정 화면 규칙이 섞이면 feature 내부로 돌린다.

- `client/src/lib`
  - React hook이 아닌 범용 브라우저 유틸, 공통 helper를 둔다.

### server

- `server/index.ts`
  - 프로세스 시작, 미들웨어 부팅, 정적 파일/Vite 연결, startup recovery만 둔다.

- `server/routes.ts`
  - base path mount만 둔다.
  - 비즈니스 판단을 넣지 않는다.

- `server/routes/*`
  - 라우터 등록만 담당한다.
  - parse, summarize, payload build, retry helper를 직접 두지 않는다.

- `server/http/handlers/*`
  - request parsing, validation, usecase 호출, response shaping까지만 담당한다.
  - 도메인 규칙, 외부 API 호출 상세, 파일 저장 로직을 두지 않는다.

- `server/application/*`
  - 유스케이스 실행 흐름의 중심이다.
  - "무엇을 한다" 기준으로 파일을 나눈다.
  - 예: `get-products`, `update-product-price`, `create-run`, `resume-run`

- `server/domain/*`
  - 비즈니스 규칙, 계산, 순수 mapper를 둔다.
  - 가능하면 부수효과 없이 유지한다.

- `server/infra/*`
  - 외부 API client, DB 의존 묶음, adapter 조합을 둔다.
  - application이 바로 세부 구현을 알지 않도록 연결한다.

- `server/interfaces/*`
  - store/repository port를 정의한다.
  - application과 handler는 concrete class 대신 이 port를 기준으로 본다.

- `server/stores/*`
  - 파일 저장, work-data DB, 향후 Redis/Postgres/cloud sink 같은 concrete 구현을 둔다.
  - 현재 file 기반 구현도 이 레이어에만 존재해야 한다.

- `server/services/*`
  - 새 코드의 기본 목적지는 아니다.
  - 현재는 facade, 하위호환 export, 아직 미분해된 legacy 서비스의 임시 위치다.

### shared

- `shared`에는 client/server가 같이 써야 하는 안정 계약만 둔다.
- UI 전용 상태 계산이나 서버 전용 인프라 코드는 넣지 않는다.

## 경계 규칙

### route -> handler -> usecase

- `route`
  - endpoint 등록만 한다.
- `handler`
  - 입력을 읽고 검증하고, usecase를 호출하고, HTTP 응답을 만든다.
- `application/usecase`
  - 실제 시나리오를 실행한다.

### usecase -> domain / infra

- `application`
  - 실행 순서, 트랜잭션 경계, retry/recovery orchestration
- `domain`
  - 순수 규칙, formatter, mapper, 계산
- `infra`
  - 외부 의존 호출과 adapter 조합

### client page -> feature modules

- `page.tsx`
  - query/mutation 연결, section 조립, 화면 흐름 제어
- `sections`
  - 화면 블록 렌더링
- `hooks`
  - 페이지 상태, 쿼리, mutation orchestration
- `grid-config`
  - 컬럼 정의, 정렬 규칙
- `formatters`
  - label, badge, 값 표시 helper
- `mappers`
  - API 응답을 grid/view model로 변환
- `actions`
  - batch payload 생성, clipboard/csv/excel 처리, validation

## 신규 기능 추가 기준

### 클라이언트

- 새 화면을 추가할 때
  - `client/src/features/<channel>/<feature>/page.tsx`
  - `client/src/features/<channel>/<feature>/index.ts`
  - `client/src/pages/<route>.tsx`는 re-export만 둔다.

- 이미 있는 화면에 기능을 추가할 때
  - 화면 섹션이면 `sections/*`
  - query/mutation이면 `hooks/*` 또는 `api.ts`
  - 그리드 컬럼이면 `grid-config.ts`
  - 라벨/표시 규칙이면 `formatters.ts`
  - payload/clipboard/excel이면 `actions.ts`

### 서버

- 새 API를 추가할 때
  - `server/routes/<area>.ts` 또는 하위 router에 mount 추가
  - `server/http/handlers/...`
  - `server/application/...`
  - 필요하면 `server/domain/...`, `server/infra/...`, `server/interfaces/...`, `server/stores/...`

- 새 저장소가 필요할 때
  - port는 `server/interfaces/*`
  - 구현은 `server/stores/*`
  - 기존 호출부가 직접 `fs`, `JSON.parse`, `writeFile`을 호출하면 안 된다.

- 새 외부 API 연동이 필요할 때
  - low-level client는 `server/infra` 또는 `server/services/<channel>/api-client.ts` 성격 위치
  - usecase에서 raw payload를 직접 조립하지 말고 mapper/helper로 분리한다.

## 실행 / 빌드 / 테스트 체크리스트

### 개발 시작 전

1. `.env`와 `DATABASE_URL`을 확인한다.
2. 파일 저장 fallback을 쓰는 기능은 `data/` 경로 권한을 확인한다.
3. DB 스키마 변경이 있으면 `npm run db:push`를 검토한다.

### 로컬 개발

1. `npm run dev`
2. 브라우저에서 핵심 메뉴 진입 확인
3. 변경한 feature의 주요 query/mutation 한 번씩 수동 점검

### 변경 검증

1. `npm run check`
2. 필요한 범위만 `npm test -- <target files>`
3. 배포 전에는 `npm run build`

### 운영 배포 전

1. `npm run check`
2. `npm run test`
3. `npm run build`
4. startup recovery 대상 확인
   - Coupang bulk price recovery
   - Naver bulk price recovery
   - queued execution resume
5. 정적 파일 서빙 또는 reverse proxy 설정 확인
6. 로그 저장 경로 또는 대체 sink 상태 확인

### 운영 배포 후

1. 서버 시작 로그 확인
2. `/api` 핵심 메뉴 smoke test
3. 로그/operation 생성 확인
4. 파일 기반 store가 남아 있는 기능은 실제 쓰기 권한 확인

## 남은 기술부채

- `client/src/features/coupang/shipments/page.tsx`
  - page가 아직 grid/render/worksheet 흐름을 과하게 보유
- `client/src/features/coupang/products/page.tsx`
  - query orchestration, explorer patching, section 렌더링이 함께 있음
- `client/src/features/naver/bulk-price/page.tsx`
  - state helper는 분리됐지만 section/hook 분리가 더 필요
- `client/src/features/coupang/bulk-price/page.tsx`
  - section/hook 분리 추가 필요
- `client/src/pages/naver-products.tsx`
  - 아직 feature page re-export 구조로 옮겨지지 않음
- `server/application/coupang/products/service.ts`
  - explorer/detail/update 흐름이 한 파일에 큼
- `server/application/coupang/orders/service.ts`
  - 주문/반품/교환/정산 액션이 과밀
- `server/application/coupang/bulk-price/service.ts`
  - preview/run/recovery/logging 분리 필요
- `server/application/naver/products/service.ts`
  - 조회/프리뷰/반영/캐시가 함께 있음
- `server/application/naver/bulk-price/service.ts`
  - preview/run/recovery/usecase 재분리 필요
- `server/services/coupang/bulk-price-store.ts`
  - 직접 file 접근이 남은 bulk price store
- `server/services/naver/bulk-price-store.ts`
  - 직접 file 접근이 남은 bulk price store
- `server/services/shared/work-data-db.ts`
  - legacy JSON import helper가 남음
- `server/routes/coupang-support.ts`
  - 아직 handler/usecase 분해가 덜 됨
- `server/services/platform-field-sync-service.ts`
  - 규칙/실행/샘플 매핑이 한 파일에 큼

## 다음 분해 우선 후보

1. `client/src/features/coupang/shipments/page.tsx`
2. `server/application/coupang/products/service.ts`
3. `server/application/coupang/orders/service.ts`
4. `server/application/coupang/bulk-price/service.ts`
5. `server/services/coupang/bulk-price-store.ts`
6. `server/services/naver/bulk-price-store.ts`
7. `client/src/features/coupang/products/page.tsx`
8. `client/src/features/naver/bulk-price/page.tsx`
9. `client/src/features/coupang/bulk-price/page.tsx`
10. `server/routes/coupang-support.ts`

## 웹 배포 준비 상태 평가

### 현재 상태

- 타입체크와 핵심 테스트를 돌릴 수 있는 기본 구조는 갖췄다.
- 라우터, 서비스, 저장소 경계가 이전보다 명확해져서 단일 인스턴스 웹 운영은 가능하다.
- startup recovery와 로그 기록 흐름도 이미 코드에 포함돼 있다.

### 아직 운영 리스크가 큰 부분

- 일부 대형 page / application service가 여전히 과밀하다.
- bulk price store 2개는 아직 file 기반 직접 접근이 남아 있다.
- `work-data-db`의 legacy JSON import는 배포 초기화와 데이터 이관 리스크를 남긴다.
- 명시적인 health/readiness endpoint가 없다.
- 파일 기반 store가 남아 있어서 멀티 인스턴스, 무상태 배포, 수평 확장에는 아직 불리하다.

### 평가

- 단일 인스턴스 내부 운영: 가능
- 정적 빌드 + Express 배포: 가능
- 장기 운영 안정성: 보통
- 멀티 인스턴스 / 완전 무상태 배포 준비: 미완
