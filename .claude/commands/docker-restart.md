---
description: Restart specific Docker Compose services without a full rebuild, useful after branch switches or config changes
---

Restart the specified Docker Compose service(s) without a full rebuild.

**Input**: $ARGUMENTS — service name(s) or `all`. Valid services: `backend`, `worker-export-data`, `task-trigger-schedule-job`, `frontend`, `redis`, `rabbitmq`

**Rules:**
- Use `docker compose` (new CLI) by default; fall back to `docker-compose` (old CLI) if the new one is not available
- Config file is always `docker-compose.dev.yml` at the repo root

**Actions based on input:**

- **Single service** (e.g. `backend`):
  ```bash
  docker compose -f docker-compose.dev.yml restart <service>
  ```

- **After a git branch switch in `backend/`** — always restart both workers and tasks so they pick up new code:
  ```bash
  docker compose -f docker-compose.dev.yml restart worker-export-data task-trigger-schedule-job
  ```

- **Full restart** (`all`): restart all services (does not rebuild images):
  ```bash
  docker compose -f docker-compose.dev.yml restart
  ```

- **Rebuild + restart** (use when `package.json` changed or a new Dockerfile layer is needed):
  ```bash
  docker compose -f docker-compose.dev.yml up --build -d <service>
  ```

After restarting, tail the logs for 10 seconds to confirm the service started cleanly:
```bash
docker compose -f docker-compose.dev.yml logs --tail=50 -f <service>
```

Report any startup errors found in the logs.
