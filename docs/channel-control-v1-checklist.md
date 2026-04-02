# Channel Control v1 Checklist

## 1. Bootstrap

- [x] Create folder structure
- [x] Write design summary
- [x] Install npm dependencies
- [x] Verify typecheck and build scripts

## 2. Shared Model

- [x] Define shared types
- [x] Define Drizzle schema
- [x] Add mock data and memory fallback

## 3. Backend

- [x] Implement storage facade
- [x] Implement channel adapter contract and mock adapters
- [x] Implement catalog sync service
- [x] Implement draft validation service
- [x] Implement execution and retry service
- [x] Wire API routes

## 4. Frontend

- [x] Implement app layout and routing
- [x] Implement unified catalog page
- [x] Implement draft edit and preview page
- [x] Implement CSV upload UI
- [x] Implement execution runs and retry page

## 5. Verification

- [x] Pass `npm run check`
- [x] Pass `npm run build`
- [ ] Manually smoke test `sync -> draft -> validate -> execute`
- [ ] Manually smoke test partial failure and retry
