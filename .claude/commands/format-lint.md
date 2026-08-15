---
description: Run Prettier + ESLint fix on the specified service (backend, frontend, or both)
---

Run format-lint on the specified service.

**Input**: $ARGUMENTS — `backend`, `frontend`, or `all` (default: `all`)

Execute the appropriate command(s) inside the correct directory:

- **backend**: `cd backend && npm run format-lint`
  - Runs: `prettier --write . && eslint --fix .`
  - Targets: `*.js`, `*.cjs`, `*.mjs`

- **frontend**: `cd frontend && npm run format-lint`
  - Runs: `prettier --write . && vue-cli-service lint`
  - Targets: `*.js`, `*.vue`, `*.jsx`

- **all**: run both sequentially

After running, report any remaining lint errors that could not be auto-fixed. If there are ESLint errors that need manual fixes, show the file path, line number, rule name, and a suggested fix.
