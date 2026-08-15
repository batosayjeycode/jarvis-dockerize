---
description: Migrate an existing API implementation to V2 — generates V2 route, controller, query, worker (if applicable), and updated Joi validation using postgre.connectNewDwh and the queries/v2 folder
---

Migrate an existing jarvis-api endpoint to V2 following the rules below.

**Input**: $ARGUMENTS — the existing API path or domain to migrate, e.g. `GET /b2c/orders` or `b2c orders`

---

## Migration Rules

### 1. File locations
All V2 output goes under the `v2/` subfolder of each layer:
- `backend/app/routes/v2/<domain>/`
- `backend/app/controllers/v2/<domain>/`
- `backend/app/queries/v2/<domain>/`
- `backend/app/workers/export-data-jarvis/v2/<domain>/` (only when the original has a worker)

### 2. Database connection
Every V2 controller and worker **must** use:
```javascript
postgre.connectNewDwh
```
Never use `postgre.connect`, `postgre.connectDwh`, or any other pool in V2 files.

### 3. SQL queries
- Do **not** modify the SQL provided in `queries/v2/`. Use it exactly.
- Only add/adjust WHERE-clause conditions to wire up payload filters and `data_filters` from the middleware.
- Preserve the original query logic and column output.

### 4. Behaviour parity
The V2 API must behave identically to the original:
- Same request shape (query params / body keys)
- Same response envelope (`{ success: true, data: … }`)
- Same pagination, sorting, and export logic

### 5. Workers
When the original endpoint triggers a background export worker:
- Create a matching V2 worker under `workers/export-data-jarvis/v2/<domain>/`
- Use `this.options.client.connectNewDwh` inside `AbstractBatchTask.processBatch()`
- Register the new worker in `workers/export-data-jarvis/index.js` with a `v2-` prefixed key, e.g. `'v2-b2c-allorder': './v2/b2c/all-orders'`

### 5a. Temporary table for batch workers
For every V2 worker that processes data in batches via `AbstractBatchTask`, the **worker itself** must materialise a temporary table at startup and use it as the sole source during batch iteration. The controller only builds the export query and passes it to the worker — it does not create the table.

**In the controller** (export branch) — pass the raw export query, not a tmp table reference:
```javascript
// Build the full export query (is_export: true strips LIMIT/OFFSET)
const queryExport = Queries.getAll(context, { ...document, is_export: true });

return CommonHelper.addToWorker(
  context,
  queryExport,   // raw SQL — the worker will materialise the tmp table
  '',
  send_to_email,
  fname,
  'v2-<worker-key>',
  document,
);
```

**In the worker** (`module.exports` async function, before constructing `AbstractBatchTask`):
```javascript
const document = (criteria.document && JSON.parse(criteria.document)) || {};
const tmpTable = CommonHelper.generateTmpTable('<entity>', context.user.id);

// 1. Materialise the full result set once into an UNLOGGED table
const createTmpTable = `CREATE UNLOGGED TABLE IF NOT EXISTS ${tmpTable} AS (${criteria.queryRow})`;
const tmpResult = await client.connectNewDwh.query(createTmpTable);
const total = tmpResult.rowCount;

// 2. All batch pages read from the tmp table — source tables are never queried again
const queryRow = `SELECT * FROM ${tmpTable} ${orderBy}`;

const task = new ExportBatchTask({
  ...
  queryRow,
  total,
  document,
  context,
  client,
  ...
});
```

**Worker `processBatch`** — appends `LIMIT/OFFSET` to the tmp table query only:
```javascript
processBatch(limit, offset) {
  return Q.try(() => {
    const query = `${this.options.queryRow} LIMIT ${limit} OFFSET ${offset}`;
    return this.options.client.connectNewDwh.query(query);
  }) ...
}
```

**Cleanup** (after `task.execute()` completes, inside the `module.exports` function):
```javascript
await client.connectNewDwh.query(`DROP TABLE ${tmpTable}`);
logger.info(`${tmpTable} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
```

**Why**: keeping all tmp table logic inside the worker makes the controller lean and keeps the materialisation concern co-located with the code that consumes it. Batch pages hit the tmp table instead of re-running the heavy source query each time.

### 6. Joi validation
- Reuse the existing schema where possible.
- Update it only if the V2 payload adds or renames fields.

---

## Steps to follow

1. **Read the original files** — before writing anything, read:
   - The original route file to find middleware chain, FilterInput keys, and permission key
   - The original controller to understand query calls, Redis caching, and response shaping
   - The original query file to understand SQL construction and data_filters usage
   - The original worker (if one exists) to understand the AbstractBatchTask pattern and fieldName mapping

2. **Read the V2 query** — open the corresponding file in `backend/app/queries/v2/<domain>/` to understand the provided SQL. Do **not** alter this SQL.

3. **Generate V2 route** — mirror the original route but point to the new V2 controller. Place it in `backend/app/routes/v2/<domain>/`. If a domain index already exists (`routes/v2/<domain>/index.js`), add a `require()` line there; otherwise add it to the nearest parent index.

4. **Generate V2 controller** — replicate the original controller logic, replacing:
   - The `require` path for queries → `../../../queries/v2/<domain>/<file>`
   - All `postgre.connect*` calls → `postgre.connectNewDwh`

5. **Generate V2 query** — wrap the provided SQL from `queries/v2/` in a class method. Wire payload parameters as template variables. Inject `data_filters` conditions into the WHERE clause following the same pattern used by sibling V2 queries.

6. **Generate V2 worker** (if applicable) — create the worker file under `workers/export-data-jarvis/v2/<domain>/`. Use `AbstractBatchTask` + `this.options.client.connectNewDwh`. Register it in `workers/export-data-jarvis/index.js`. Apply the **temporary table pattern** (rule 5a): the controller passes the raw export query; the worker creates a `CREATE UNLOGGED TABLE … AS (queryRow)` at startup, then all `processBatch` pages read from that tmp table with `LIMIT/OFFSET`. Drop the tmp table after `task.execute()` completes.

7. **Update Joi schema** (if needed) — only if new payload fields were introduced.

8. **Show all output** — print the full content of every new file and the diff for every modified file (e.g. index.js additions).

---

## Code conventions
- CommonJS throughout (`require` / `module.exports`) — no ESM
- `moment-timezone` for date handling
- `async/await` with `try/catch` that calls `next(err)` in controllers
- Response envelope: `res.status(200).send({ success: true, data: result })`
- Use existing sibling files in the same `v2/<domain>/` folder as style reference before writing
