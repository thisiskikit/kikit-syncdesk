# Decision: Bulk-Price Preset Draft UI State Persistence

- Date: 2026-04-03
- Status: applied in code
- Verification status:
  - passed: `npm run check`
  - not run: `npm run test`
  - not run: `npm run build`
  - `추정`: no browser-level end-to-end verification was run in this task

## Context

- NAVER and COUPANG bulk-price preset lists were already stored durably in work-data tables.
- The active preset selection and preset name/memo editor values were kept only in page-local React state.
- After refresh or page remount, users saw those template fields cleared and experienced it as preset reset even though the saved preset records still existed.

## Decision

- Persist bulk-price preset editor UI state through the existing `/api/ui-state` mechanism.
- Store the following fields in `naver.bulk-price.ui` and `coupang.bulk-price.ui`:
  - selected source preset ID
  - source preset name
  - source preset memo
  - selected rule preset ID
  - rule preset name
  - rule preset memo
- Keep using existing bulk-price preset tables for the actual saved preset records.
- Clear a stored preset selection only after the preset list query has loaded successfully and the referenced preset is confirmed missing.

## Reason

- This reuses an existing persistence path backed by `ui_state_entries`, so it avoids adding new tables or a second draft persistence mechanism.
- It fixes the user-facing reset symptom without changing preset CRUD APIs.
- Waiting for preset list query success prevents false clears during the initial loading window.

## Impact Scope

- `client/src/features/naver/bulk-price/page.tsx`
- `client/src/features/naver/bulk-price/state.ts`
- `client/src/features/coupang/bulk-price/page.tsx`
- `client/src/features/coupang/bulk-price/state.ts`
- `server/routes/ui-state.ts`
- `server/stores/work-data-ui-state-store.ts`

## Alternatives Considered

- Add dedicated preset-draft database tables:
  - rejected for now because the project already has a generic UI-state persistence path that fits this need
- Keep local React state and only persist selected preset IDs:
  - rejected because users also need name/memo draft fields to survive refresh
- Rehydrate name/memo from the preset table only:
  - rejected because it would not preserve in-progress edits to the template metadata fields

## Remaining Issues

- `추정`: if future requirements need multi-user or audit-friendly draft history, `ui_state_entries` may be too coarse and dedicated draft tables may be preferable.
- This decision does not address preview cache expiration or run recovery durability.

## Next Work

- Verify refresh persistence on both bulk-price screens in a live browser session.
- Reuse the same pattern for other draft-only operation screens only if the UX requires refresh durability without versioned history.
