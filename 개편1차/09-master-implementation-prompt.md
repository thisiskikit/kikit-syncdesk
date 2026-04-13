# 09. Master Implementation Prompt

아래 프롬프트는 Codex / Claude / 에이전트형 코딩 도구에 바로 투입할 수 있는 실행 프롬프트입니다.  
필요 시 프로젝트 공통 운영 규칙 블록과 함께 사용하십시오.

---

## 실행 프롬프트 본문

You are working on the `KIKIT SyncDesk` codebase.

Before making any change, read these documents completely and use them as the source of truth for this task:

- `01-product-reframing.md`
- `02-information-architecture.md`
- `03-dashboard-redesign.md`
- `04-fulfillment-redesign.md`
- `05-decision-model.md`
- `06-visual-guidelines.md`
- `07-implementation-plan.md`
- `08-docs-update-requirements.md`

Your task is to redesign the current UI so that `KIKIT SyncDesk` is clearly experienced as an **operation desk** rather than a channel-centric admin console.

### Critical product framing
Treat the product as:
- an operation desk for order collection, fulfillment, invoice handling, claims, inquiries, and work logs
- action-first, not channel-first
- fulfillment/CS/work execution centered
- risk-revealing, not raw-data-first

Do **not** treat the product as:
- a bulk price tool
- a product editing tool
- a channel-wise raw data browser
- a legacy function hub

### Hard constraints
1. Keep the existing codebase stable. Reuse and re-route instead of destroying everything.
2. Preserve working backend/route behavior where possible, but reorganize the UI and navigation around the new IA.
3. Hide or remove legacy live surface exposure for:
   - bulk-price
   - product-edit
   - grouped products
4. Dashboard must become a “today’s operation start screen”.
5. Fulfillment must become a “decision + action + exception handling” screen.
6. Use progressive disclosure:
   - keep lists thin
   - move deep data into drawers / panels / accordions
7. Use the fulfillment decision model from `05-decision-model.md` consistently.
8. Update docs together with code. No docs update means task is incomplete.

---

## Scope for this implementation pass
Focus this pass on:

1. Navigation / IA realignment
2. Dashboard redesign
3. Fulfillment redesign
4. Shared UI patterns for:
   - decision badges
   - reason labels
   - drawer sections
   - empty states
5. Documentation updates

Do not spend this pass deeply redesigning:
- the entire CS module
- all channel detail pages
- advanced analytics
- mobile-first complete redesign
- legacy product/price feature expansion

---

## What to implement

### 1) Navigation / IA
Reorganize the main navigation around:
- 대시보드
- 출고
- CS
- 채널
- 작업센터
- 설정

Channel sections such as Coupang / Naver should move under `채널` as secondary surfaces, not top-level primary workflow drivers.

Keep old routes alive when needed via redirect or wrapper strategy, but expose only the new IA in the live navigation.

---

### 2) Dashboard
Redesign the dashboard into a start screen for daily operations.

It must include:
- page header
- 5 action KPI cards:
  - 오늘 출고
  - 출고 차단
  - 송장 대기
  - 답변 필요
  - 실패 작업
- priority block (`지금 먼저 볼 것`)
- recent issue feed
- quick actions panel
- slim channel status strip

Each card must show:
- count
- short meaning text
- clear CTA that navigates into the proper workspace

Avoid dashboard designs that are only visual KPI summaries without workflow entry value.

---

### 3) Fulfillment
Redesign the fulfillment screen as the main operational workspace.

It must include:
- page header
- status tabs
- filter bar
- result summary bar
- main data table
- row action affordances
- conditional bulk action bar
- right-side detail drawer

The screen must answer:
> “Can I ship this order now?”

The table should prioritize:
- representative status
- order number
- product name
- quantity
- customer name
- channel badge
- order time
- fulfillment decision
- minimal actions

Do not overload the table with:
- raw JSON
- long CS logs
- full address
- internal debug fields
- verbose system responses

These go into the drawer.

---

### 4) Decision model
Implement or align the UI around these fulfillment decisions:
- 출고 가능
- 송장 대기
- 보류
- 차단
- 재확인 필요

Support reason labels using the standard reason groups from `05-decision-model.md`.

In the table:
- show decision first
- optionally show one short reason label underneath

In the drawer:
- show decision badge
- reason label
- one-line explanation
- supporting sections below

Button availability must respect decision state.

Examples:
- blocked rows must not expose active shipping actions
- recheck-needed rows should prioritize recheck/retry actions
- invoice-pending rows should surface invoice actions prominently

---

### 5) Visual design direction
Apply a modern B2B SaaS look with restrained noise:
- quiet background
- restrained borders
- strong spacing hierarchy
- small channel badges only
- scan-friendly numeric alignment
- controlled state colors
- subtle shadows
- no loud channel-color surfaces

The UI should feel operational, calm, and high-signal.

---

### 6) Empty state and copy cleanup
Update labels, helper text, and empty states so they read like operational guidance, not system placeholders.

Examples:
- “지금 바로 처리할 출고 건이 없습니다.”
- “현재 차단된 주문이 없습니다.”
- “재시도 필요한 작업이 없습니다.”

Avoid generic placeholder copy like:
- “데이터 없음”
- “항목 없음”
- “0건”

---

### 7) Documentation updates
You must update:
- `docs/current-status.md`
- `docs/change-log.md`
- `docs/structure-overview.md`

Also add decision or handoff docs if structural choices or remaining follow-up tasks need to be explicitly recorded.

Documentation must clearly state:
- what changed
- why it changed
- what was intentionally deferred
- what still remains risky or incomplete

---

## Implementation strategy
Use this order unless the codebase strongly requires a safer variation:

1. align navigation and live IA
2. implement shared decision / reason UI building blocks
3. redesign dashboard
4. redesign fulfillment
5. align work center / channel naming and positioning
6. update docs

---

## Deliverables
At the end, provide:
1. a short summary of UI/IA changes
2. the list of files changed
3. the docs updated
4. any deferred items
5. any risky legacy areas still left in the codebase
6. testing or validation notes

---

## Important warnings
- Do not re-promote legacy bulk pricing/product editing surfaces.
- Do not keep channel-first navigation as the dominant workflow.
- Do not dump raw state or logs directly into primary tables.
- Do not stop at cosmetic changes only.
- Do not finish without docs updates.

---

## Success criteria
The result should make a first-time reviewer feel:

**Not this:**  
“Looks like a channel admin console with many tools.”

**But this:**  
“Looks like an operation desk for fulfillment, CS impact, and failed task recovery.”

If there is a conflict between old structure and the new operation-desk interpretation, prefer the new operation-desk interpretation unless it would break critical existing functionality.
