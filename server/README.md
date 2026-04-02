# Server 구조 안내

## 서버 진입점

- [index.ts](/D:/Dev/Archive_3.0/kikit_price_change/server/index.ts)
  - 서버 시작, recovery, 정적 서빙 연결
- [routes.ts](/D:/Dev/Archive_3.0/kikit_price_change/server/routes.ts)
  - base path mount만 담당

## 요청 흐름

```text
route -> http handler -> application usecase -> domain / infra -> interfaces -> stores
```

## 폴더별 기본 규칙

- `routes`
  - endpoint 등록만 둔다.
- `http/handlers`
  - request validation, usecase 호출, response 반환만 둔다.
- `application`
  - 유스케이스 실행 흐름을 둔다.
- `domain`
  - 순수 규칙, mapper, 계산을 둔다.
- `infra`
  - 외부 API, DB, adapter 조합을 둔다.
- `interfaces`
  - repository/store port를 둔다.
- `stores`
  - file, work-data DB, 이후 Redis/Postgres 구현을 둔다.
- `services`
  - 새 기능의 기본 위치가 아니다.
  - facade, 하위호환 export, 아직 이전 중인 legacy 코드만 둔다.

## 신규 기능 추가 기준

- 새 API 추가:
  - `routes`에 mount
  - `http/handlers`에 handler
  - `application`에 usecase
  - 필요 시 `domain`, `infra`, `interfaces`, `stores` 확장

- 새 저장소 추가:
  - port는 `interfaces`
  - 구현은 `stores`
  - usecase는 concrete class가 아니라 port를 기준으로 호출

- 새 외부 연동 추가:
  - raw client는 `infra` 또는 채널 infra helper
  - 인증, retry, payload build는 application/domain에 흩뿌리지 말고 의미 있는 모듈로 분리

## 금지 규칙

- route에 비즈니스 규칙 추가 금지
- handler에 파일 저장 로직 추가 금지
- application에서 `fs/promises` 직접 호출 금지
- 신규 로직을 `services`에 계속 누적하는 방식 금지

## 참고 문서

- [웹 운영 구조 가이드](/D:/Dev/Archive_3.0/kikit_price_change/docs/architecture/web-operations-structure.md)
