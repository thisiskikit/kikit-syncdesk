# Client Feature 구조 안내

## 원칙

- `client/src/pages`는 라우트 엔트리만 둔다.
- 실제 화면 기능은 `client/src/features/<channel>/<feature>` 아래에 둔다.
- 각 `page.tsx`는 조립과 흐름 제어만 담당한다.

## 권장 feature 구조

```text
client/src/features/<channel>/<feature>/
  index.ts
  page.tsx
  sections/
  hooks/
  api.ts
  state.ts
  grid-config.ts
  formatters.ts
  mappers.ts
  actions.ts
```

## 파일 역할

- `page.tsx`
  - query/mutation 연결
  - section 조립
  - 화면 흐름 제어

- `sections/*`
  - 화면 블록 렌더링

- `hooks/*`
  - feature 내부 상태와 비동기 orchestration

- `grid-config.ts`
  - 컬럼 정의와 그리드 표시 규칙

- `formatters.ts`
  - 라벨, badge, 표기용 helper

- `mappers.ts`
  - API 응답을 화면 모델로 변환

- `actions.ts`
  - batch payload 생성
  - clipboard / csv / excel 처리
  - validation

## 신규 기능 추가 기준

- 새 메뉴 페이지를 만들면:
  - `features/<channel>/<feature>/page.tsx`를 만든다.
  - `pages/<route>.tsx`는 re-export만 둔다.

- 기존 페이지가 커지면:
  - 렌더링 블록은 `sections`
  - 데이터 흐름은 `hooks`
  - 표 정의는 `grid-config`
  - 파싱/검증은 `actions`
  - 표시 규칙은 `formatters`

## 금지 규칙

- `pages/*.tsx`에 대형 query/mutation 로직 추가 금지
- `page.tsx`에 csv/excel parsing 누적 금지
- 공용 UI가 아닌 feature 전용 컴포넌트를 `components`로 올리는 것 금지

## 참고 문서

- [웹 운영 구조 가이드](/D:/Dev/Archive_3.0/kikit_price_change/docs/architecture/web-operations-structure.md)
