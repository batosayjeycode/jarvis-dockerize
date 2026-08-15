---
description: Add a new cron-style scheduled task to the jarvis-api task-trigger-schedule-job system
---

Add a new scheduled/batch task to the `app/tasks/` system in jarvis-api.

**Input**: $ARGUMENTS — task name, cron expression, and domain, e.g. `sync-b2c-inventory "0 2 * * *" b2c`

**Steps to follow:**

1. **Read existing tasks** in `backend/app/tasks/trigger-scheduled-jobs/` to understand the registration pattern and how tasks are invoked before writing anything new.

2. **Task module** — create `backend/app/tasks/<domain>/<task-name>.js`:
   - Use CommonJS (`require` / `module.exports`)
   - Export an async function that performs the work
   - Use `moment-timezone` locked to `Asia/Jakarta` for any date logic
   - Access databases via `sociolla-core` (PostgreSQL) or Mongoose (MongoDB)
   - Log start/end with timestamps for observability

3. **Register the task** — add the task to the scheduler entry file in `app/tasks/trigger-scheduled-jobs/` with the provided cron expression. Use `cron-parser` for validation if needed.

4. **MongoDB schedule record** (if tasks are stored in DB) — check if there is a `ScheduleTask` Mongoose model in `app/models/` and insert the task definition there too.

5. **Environment variables** — document any new env vars in `backend/app/config/secret.js`.

Show full file contents for new files and diffs for modified files. Validate the cron expression is correct before using it.
