# Decision: SyncDesk IA를 운영 데스크 중심으로 재배치

- Date: 2026-04-12
- Status: applied in code
- Verification status:
  - passed: `npm run check`
  - passed: `npx vitest run client/src/lib/workspace-tabs.test.ts client/src/lib/coupang-navigation.test.ts client/src/features/coupang/shipments/fulfillment-decision.test.ts`
  - not run: `npm run test`
  - not run: `npm run build`
  - `추정`: browser-level visual verification was not run in this task

## Context

- The previous shell emphasized channel sections such as NAVER and COUPANG as the first thing a user saw.
- The product, however, is used primarily for fulfillment operations, customer-service-aware exception handling, and recovery of failed work.
- The Coupang shipment worksheet had already become the most mature operator screen, but it was still presented as one channel page among many.
- Legacy product-oriented surfaces such as bulk-price, product-edit, grouped products, and Draft / Runs were still too visible in the main user path.

## Decision

- Reframe the app shell as `KIKIT SyncDesk`, an operations desk centered on:
  - `대시보드`
  - `출고`
  - `CS`
  - `채널`
  - `작업센터`
  - `설정`
- Promote the existing Coupang shipment worksheet flow into the new top-level `출고` route.
- Keep channel-native screens, but demote them into a `채널` hub and channel sub-routes instead of exposing NAVER and COUPANG as top-level shell sections.
- Frame `CS` as a dedicated top-level hub that deep-links into existing inquiry and claim screens.
- Frame `작업센터` as a recovery-first view over the existing operation/event log system.
- Hide legacy product-oriented tools from the main top-level flow while preserving direct routes or advanced-entry wrappers where needed.
- Introduce a UI-level fulfillment decision model with five operator-facing states:
  - `출고 가능`
  - `송장 대기`
  - `보류`
  - `차단`
  - `재확인 필요`

## Reason

- This keeps the first 10 seconds of the product focused on what operators actually do each day: collect orders, decide whether they can ship, check CS impact, and recover failed work.
- It preserves existing business logic and existing deep channel screens, which lowers migration risk.
- It reduces the need for users to mentally translate a channel menu into an operations workflow.
- It gives the fulfillment screen a clearer decision-first language without requiring a backend rewrite.

## Impact Scope

- `client/src/App.tsx`
- `client/src/lib/workspace-tabs.ts`
- `client/src/pages/dashboard.tsx`
- `client/src/pages/fulfillment.tsx`
- `client/src/pages/cs-hub.tsx`
- `client/src/pages/channels-hub.tsx`
- `client/src/pages/operation-center.tsx`
- `client/src/pages/settings-hub.tsx`
- `client/src/features/coupang/shipments/page.tsx`
- `client/src/features/coupang/shipments/fulfillment-decision.ts`
- `client/src/features/coupang/shipments/shipment-decision-drawer.tsx`
- `client/src/lib/coupang-navigation.ts`

## Alternatives Considered

- Keep the existing channel-first shell and only polish styles:
  - rejected because the structural problem was not primarily visual; the navigation still taught the wrong product identity
- Build a completely new fulfillment page from scratch:
  - rejected for 1차 because the existing Coupang shipment page already held most of the working logic and could be safely reframed with lower migration cost
- Unify all CS execution into a single new backend-driven screen:
  - rejected for 1차 because it would require a larger backend and workflow redesign than the scope allowed

## Remaining Issues

- `추정`: the new IA should feel clearer in the browser, but this task did not run full visual/manual verification.
- The fulfillment page still contains a large amount of coordinating logic and should be split further in a later phase.
- CS is still a hub, not a cross-channel unified execution workflow.
- Some deep legacy pages still keep older wording and layout conventions.

## Next Work

- Run a browser-level walkthrough for:
  - dashboard -> fulfillment
  - fulfillment table -> decision drawer -> full detail
  - CS hub -> deep-linked channel screens
  - work-center recovery flow
- Consider splitting the fulfillment page into smaller shell / toolbar / grid / drawer modules once the new IA is stable.
- Continue replacing older deep-screen copy with the new operations language where it is safe.
