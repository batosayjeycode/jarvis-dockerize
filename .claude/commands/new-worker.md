---
description: Scaffold a new RabbitMQ background worker for the jarvis-api export-data pipeline
---

Create a new RabbitMQ background worker following the `app/workers/export-data-jarvis/` pattern.

**Input**: $ARGUMENTS — worker name and domain, e.g. `export-order-summary b2c`

**Steps to follow:**

1. **Read existing workers** in `backend/app/workers/export-data-jarvis/` to understand the current module structure and queue naming convention before writing anything new.

2. **Worker module** — create `backend/app/workers/export-data-jarvis/<domain>/<worker-name>.js`:
   - Use CommonJS (`require` / `module.exports`)
   - Connect to RabbitMQ via the shared connection from `sociolla-core`
   - `ack` the message on success, `nack` with `requeue: false` on unrecoverable error
   - Use `exceljs` or `json2csv` for file generation (match the pattern of sibling workers)
   - Upload output to S3 via AWS SDK, then send notification via SES or the existing email helper

3. **Register the worker** — add the new module to the worker index/entry file so it subscribes to its queue on startup.

4. **Docker service** (optional) — if this worker needs its own container, add a new service entry in `docker-compose.dev.yml` following the `worker-export-data` service pattern.

5. **Environment variables** — list any new env vars needed (queue name, S3 bucket, etc.) and add them to `backend/app/config/secret.js`.

Show full file contents for each new file and diffs for modified files.
