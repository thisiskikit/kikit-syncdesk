# Change Log

This file records repository changes that are considered complete only when the related code and documentation stay aligned.

## 2026-04-03

- Change type:
  - documentation baseline
- Changed files:
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
  - `docs/decisions/README.md`
  - `docs/handoffs/README.md`
- Code change:
  - none
- Change content:
  - added baseline project documentation derived from the current code layout and inspected runtime entry points
- Reason:
  - future tasks in this repository must update code and docs together, so a starting point was needed
- Impact scope:
  - documentation only
  - no API, DB, UI, or runtime behavior changed by this task
- Remaining issues:
  - this entry is based on code inspection only
  - no runtime validation was performed in this task
  - shared engine persistence and NAVER preview cache behavior remain operational risks documented in `docs/current-status.md`
- Next work:
  - append a new dated entry for every code change
  - include verification notes and clearly mark anything not tested
- Verification:
  - not run: `npm run check`
  - not run: `npm run test`
  - not run: `npm run build`

## 2026-04-03 / Bulk-Price Preset Persistence

- Change type:
  - code and documentation
- Changed files:
  - `client/src/features/naver/bulk-price/page.tsx`
  - `client/src/features/naver/bulk-price/state.ts`
  - `client/src/features/coupang/bulk-price/page.tsx`
  - `client/src/features/coupang/bulk-price/state.ts`
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
  - `docs/decisions/2026-04-03-bulk-price-preset-ui-state.md`
- Code change:
  - persisted NAVER and COUPANG bulk-price preset editor state through the existing `/api/ui-state` store
- Change content:
  - moved selected source/rule preset IDs and preset name/memo draft inputs from page-local React state into server-backed UI state
  - added a guard so preset selection is cleared only after the preset list query successfully confirms the preset is gone
- Reason:
  - users experienced bulk-price template values as "reset" after refresh because only the preset list itself was durable; the active selection and draft fields were not
- Impact scope:
  - NAVER bulk-price UI
  - COUPANG bulk-price UI
  - `ui_state_entries` payload shape for `naver.bulk-price.ui` and `coupang.bulk-price.ui`
- Remaining issues:
  - browser-level end-to-end verification was not run in this task
  - preview caches and run recovery behavior were not changed
- Next work:
  - manually verify refresh persistence on both channel pages
  - decide whether other draft-only bulk operations should follow the same `ui_state_entries` persistence pattern
- Verification:
  - passed: `npm run check`
  - not run: `npm run test`
  - not run: `npm run build`
