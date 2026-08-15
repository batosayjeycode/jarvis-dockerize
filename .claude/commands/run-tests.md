---
description: Run tests for the specified service (backend Jest unit tests or frontend Vue unit/e2e tests)
---

Run tests for the specified service.

**Input**: $ARGUMENTS — `backend`, `frontend:unit`, `frontend:e2e`, or `all` (default: `all`)

**Backend** (`backend` or `all`):
- Run: `cd backend && npm test`
- Test files live in `backend/test/unit/**/*.test.js`
- Framework: Jest with `testEnvironment: node`
- For watch mode during development: `cd backend && npm run test:watch`

**Frontend unit** (`frontend:unit` or `all`):
- Run: `cd frontend && npm run test:unit`
- Framework: Vue CLI + Jest

**Frontend e2e** (`frontend:e2e`):
- Run: `cd frontend && npm run test:e2e`
- Note: requires the dev server to be running

After tests complete:
- Report pass/fail counts and total duration
- For any failing tests, show the test name, file path, and the exact error message
- Suggest a fix if the failure is clearly a code issue (not a flaky/environment issue)

If `$ARGUMENTS` is empty, run backend tests and frontend unit tests only (skip e2e).
