---
description: Add Redis response caching to an existing backend controller following the jarvis-api cache-data middleware pattern
---

Add Redis caching to an existing backend controller endpoint.

**Input**: $ARGUMENTS — the controller file path and function name, e.g. `app/controllers/b2c/orders.js getSummary`

**Steps to follow:**

1. Read the target controller file to understand the current implementation.

2. Identify the cache key pattern — it should be unique per request parameters (user, filters, date range). Use a descriptive string like `jarvis:<domain>:<endpoint>:<param1>:<param2>`.

3. Apply the `cache-data` middleware from `app/middlewares/auth/` at the route level (preferred), OR add inline cache logic in the controller using the Redis client from `sociolla-core`:
   ```js
   const cached = await redisClient.get(cacheKey);
   if (cached) return res.json(JSON.parse(cached));
   // ... fetch data ...
   await redisClient.setEx(cacheKey, TTL_SECONDS, JSON.stringify(data));
   ```

4. Use the correct TTL based on data type:
   - Dashboard / aggregate metrics: `JARVIS_DASHBOARD_REDIS_EXPIRY` env var (default 3 hrs = 10800s)
   - General data / reference tables: `JARVIS_REDIS_EXPIRY` env var (default 2 days = 172800s)

5. Ensure cache invalidation is handled if there's a write path for the same data.

Show the diff of all modified files. Do not change any existing logic — only add the cache layer around it.
