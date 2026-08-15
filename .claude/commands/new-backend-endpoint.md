---
description: Scaffold a new Express API endpoint following the jarvis-api conventions (route → controller → query)
---

Create a new backend API endpoint for the jarvis-api following these strict conventions:

**Input**: $ARGUMENTS (format: `<HTTP_METHOD> <path> <domain>` — e.g. `GET /v2/b2c/orders b2c`)

**Steps to follow:**

1. **Route** — add the route in `backend/app/routes/v2/<domain>/` (URL registration only, no logic). Import the controller and call it.

2. **Controller** — create or extend `backend/app/controllers/<domain>/` file. The controller must:
   - Accept `(req, res, next)`
   - Use `async/await` with a `try/catch` that calls `next(err)` on error
   - Call the query function from `app/queries/`
   - Return JSON via `res.json()`
   - Use CommonJS (`require` / `module.exports`) — no ESM

3. **Query** — create or extend `backend/app/queries/<domain>/` file. The query must:
   - Use CommonJS (`require` / `module.exports`)
   - Separate SQL/Mongo construction from execution
   - Access PostgreSQL DWH via `sociolla-core`, MongoDB via Mongoose models in `app/models/`
   - Use `moment-timezone` for any date handling

4. **Validation** — if the endpoint accepts a request body, add a Joi schema in the schema-validator middleware pattern.

5. **Permissions** — if access is role-gated, add the permission key to `backend/app/config/permission.json`.

Show the full file contents for each new/modified file. Use the existing files in the same domain folder as style reference before writing.
