---
description: Build, refactor, or migrate Vue 3 code inside frontend-v3/ following feature-based modular architecture, Composition API, and API load-all/pagination optimization rules — including mandatory invocation of the vue3-theme-migration workflow
---

Act as a senior Vue.js architect working inside `frontend-v3/`, the new Vue 3 frontend being built alongside the existing `frontend/` (legacy Vue 2) app.

**Input**: $ARGUMENTS — the feature/domain to build, refactor, or migrate, e.g. `cancel-refund` or `data-review`. If empty, apply these rules to whatever Vue 3 code is currently being discussed.

The goal is code that is modular, maintainable, scalable, easy to test, easy to optimize, non-repetitive, short at the component level, and efficient with large datasets (including client-side pagination when appropriate).

---

## 0. Project boundary: `frontend-v3/`

```text
project/
├── backend/
├── frontend/       # existing/legacy Vue 2 app — functional reference only
└── frontend-v3/    # new Vue 3 app — all new work goes here
```

- All new Vue 3 development happens inside `frontend-v3/`.
- Do **not** modify `frontend/` unless explicitly asked.
- Do **not** copy the Vue 2 architecture from `frontend/` blindly — inspect it only for functional reference (routes, API endpoints, request/response shapes, business rules, permissions, validation, UI behavior).
- Do **not** introduce TypeScript into `frontend-v3/`.

**Migration flow** when porting a feature from `frontend/` to `frontend-v3/` — rebuild it, don't transliterate it:

```text
Existing Vue 2 feature → understand behavior → identify API dependencies →
identify business rules → identify reusable UI → identify pagination/filter/sort behavior →
redesign for Vue 3 → extract composables → extract API modules → extract reusable
components → optimize API calls and data flow → implement inside frontend-v3/
```

---

## 1. Core technology

Vue 3, Composition API, `<script setup>`, **JavaScript only**, Pinia, Vue Router, REST via a centralized HTTP client (Axios-based).

**No TypeScript.** No `*.ts` files, no `interface`, `type`, `<T>`, `defineProps<Type>()`/`defineEmits<Type>()`. Use `*.js`/`*.vue` only. Use JSDoc sparingly, only where genuinely useful:

```js
/**
 * @param {Object} params
 * @returns {Promise<Object>}
 */
export const getCancelRefund = (params) => http.get('/v2/cancel-refund', { params })
```

---

## 2. Core architecture principle: feature-based, not file-type-based

Avoid one giant `components/` / `api/` / `stores/` / `views/` holding every domain's files. Prefer:

```text
features/
├── cancel-refund/
├── data-review/
├── saved-query/
├── scheduler/
├── resources/
└── general-config/
```

Each feature is self-contained.

## 3. Folder structure

```text
src/
├── app/
│   ├── router/index.js
│   ├── store/index.js
│   └── App.vue
├── assets/
├── components/
│   ├── common/
│   └── layout/
├── composables/
│   ├── usePagination.js
│   ├── useModal.js
│   ├── useLoading.js
│   └── useDebounce.js
├── features/
│   └── <feature-name>/
│       ├── api/
│       ├── components/
│       ├── composables/
│       ├── stores/
│       ├── utils/
│       └── views/
├── services/
│   ├── http.js
│   └── auth.js
├── utils/
│   ├── date.js
│   ├── format.js
│   └── validation.js
└── main.js
```

Don't create folders a small feature doesn't need.

## 4. Component responsibility

Components handle UI, interaction, props, emits, rendering — nothing else. Move API logic, business logic, data transformation, complex state, and reusable logic out into composables, API modules, stores, utils, or child components. A component must never become a "God Component."

## 5. Always use `<script setup>`

```vue
<script setup>
const { items, loading, fetchData } = useCancelRefund()
onMounted(fetchData)
</script>
```

Avoid the Options API for new code unless there's a specific compatibility reason.

## 6. Composable architecture

Extract business logic into single-responsibility composables (`features/<name>/composables/use<Name>.js`):

```js
import { ref, computed } from 'vue'
import { getCancelRefund } from '../api/cancelRefund.api'

export function useCancelRefund() {
  const items = ref([])
  const loading = ref(false)
  const page = ref(1)
  const total = ref(0)

  const fetchData = async () => {
    loading.value = true
    try {
      const response = await getCancelRefund({ page: page.value })
      items.value = response.data
      total.value = response.total
    } finally {
      loading.value = false
    }
  }

  const hasData = computed(() => items.value.length > 0)

  return { items, loading, page, total, hasData, fetchData }
}
```

Avoid one huge composable covering an entire feature.

## 7. API layer

Components must never call Axios directly. Flow:

```text
Component → Composable → Feature API → HTTP Service → Backend
```

```js
// features/<name>/api/cancelRefund.api.js
import http from '@/services/http'

export const getCancelRefund = (params) => http.get('/v2/cancel-refund', { params })
```

## 8. Shared HTTP service

One centralized client at `services/http.js` owns base URL, auth, headers, interceptors, error handling, timeout. Feature API modules use it — don't spin up independent Axios instances.

## 9. Pinia rules

Local state (ref/reactive/composable) for: pagination, sorting, temporary filters, modal state, form state, table loading, temporary UI state.

Pinia only for genuinely shared state: authentication, user, permissions, global config, notifications, shared app state.

---

## 10. IMPORTANT — API load-all optimization

Where the dataset size is safe and practical: **load the dataset once, then paginate/filter/sort/search client-side**, instead of firing a new request per page.

Avoid:

```text
GET /v2/cancel-refund?page=1 → GET ?page=2 → GET ?page=3 (per click)
```

Prefer:

```text
GET /v2/cancel-refund → allItems in memory → client filter → client sort →
client paginate → page changes trigger NO API request
```

## 11. Reusable client-side list composable

```js
const {
  allItems, visibleItems, loading, page, limit, total, filter, sort, fetchAll
} = useClientList({ fetcher: getCancelRefund })
```

Responsible for: fetch-once, keeping the original dataset, filtering, searching, sorting, pagination, total count, loading/error state, resetting pagination on filter change.

## 12. Separate original data from display data

Never mutate the original API dataset. Pipeline:

```js
const allItems = ref([])
const filteredItems = computed(() => allItems.value.filter(...))
const sortedItems = computed(() => [...filteredItems.value].sort(...))
const visibleItems = computed(() => {
  const start = (page.value - 1) * limit.value
  return sortedItems.value.slice(start, start + limit.value)
})
```

## 13. Client-side pagination must not trigger an API call

```js
// correct
const changePage = (newPage) => { page.value = newPage }

// wrong — do not refetch on page change in client mode
const changePage = async (newPage) => {
  page.value = newPage
  await fetchData()
}
```

## 14. Cache the loaded dataset

```js
if (allItems.value.length > 0 && !forceRefresh) return
```

Don't cache blindly forever — account for freshness, manual refresh, expiration, mutation after create/update/delete, and permissions.

## 15. Do NOT load-all huge datasets

Prefer server-side pagination when the dataset is very large, the query is expensive, data changes frequently, filtering needs DB logic, security requires server-side filtering, or browser memory would become significant. Never fake "load all" via hundreds of sequential requests unless explicitly justified.

## 16. Hybrid pagination strategy

Support both modes where practical:

```js
useList({ fetcher: getCancelRefund, mode: 'client' })
useList({ fetcher: getLargeDataset, mode: 'server' })
```

- `client`: `API → load all → client filter → client sort → client paginate`
- `server`: `page → API → server filter → server sort → server paginate`

## 17. Avoid duplicate API requests

Watch for: duplicate calls, calls triggered by pagination, unnecessary watcher-triggered calls, `onMounted()` + route watcher both firing, multiple components calling the same endpoint, repeated reactive dependencies. Before adding a `watch(..., { immediate: true })`, check whether the initial call already happens elsewhere:

```js
onMounted(fetchData)
watch(() => route.query, fetchData, { immediate: true }) // may double-fire
```

## 18. Optimize reactive computation

Use `computed()` for derived data instead of recomputing in templates/methods/watchers/multiple computeds. Avoid `watch(data, handler, { deep: true })` unless genuinely required.

## 19. Avoid reprocessing large arrays

Don't repeat the same `map`/`filter`/`sort`/`reduce` pass over the same data:

```js
// bad — three separate passes over items
const total = items.filter(...).length
const rows = items.filter(...).sort(...)
const count = items.filter(...).length
```

Build one reusable computed pipeline instead. Weigh actual dataset size before optimizing prematurely.

## 20. Table optimization

For large client-side datasets: don't render every row at once, paginate displayed rows, consider virtual scrolling, keep `visibleItems` small, avoid expensive template expressions and repeated formatting calls inside large loops. The DOM should only render the current page (e.g. 10,000 `allItems` → 2,000 `filteredItems`/`sortedItems` → 20 `visibleItems` → 20 rendered rows).

## 21. Search/filter optimization

```text
API → allItems → local search → local filter → local sort → local pagination
```

Don't call the API on page change, local sort change, local filter change, or search keystrokes unless the operation needs server-side data. Debounce search input when the dataset is large enough to matter.

## 22. Reset pagination correctly

```js
watch(filters, () => { page.value = 1 })
```

Filter changes reset to page 1 and recompute `visibleItems` — without triggering an API request in client mode.

## 23. Data mutation and cache invalidation

After create/update/delete/cancel/refund on a load-all page, update the local dataset in place or invalidate and refresh it. Never leave stale client-side data without an explicit strategy.

## 24. API load-all parameters

Don't assume `GET /items` returns everything — check default/max limits, pagination behavior, total count, backend limits, response size, timeout, and query cost first. If aggregating "all" data requires many sequential requests, weigh that against just using server-side pagination.

## 25. Performance before architecture

Measure before optimizing: number of API requests, API duration, response size, record count, browser memory, render time, computation time, network waterfall, duplicate requests. The goal is not zero API requests — it's minimizing *unnecessary* ones while keeping memory, rendering, freshness, and backend load acceptable.

## 26. Refactoring existing Vue 2 code

Don't do a mechanical syntax conversion. Analyze responsibilities → identify API logic → identify business logic → identify reusable UI → identify pagination/filter/sort logic → extract composables → extract API module → extract components → convert to `<script setup>` → optimize API calls → optimize client-side data handling. The migration should improve the architecture, not just the syntax.

## 27. Example target architecture (`cancel-refund`)

```text
features/cancel-refund/
├── api/cancelRefund.api.js
├── components/
│   ├── CancelRefundFilter.vue
│   ├── CancelRefundTable.vue
│   └── CancelRefundDetail.vue
├── composables/
│   ├── useCancelRefund.js
│   └── useCancelRefundList.js
├── stores/cancelRefund.store.js
├── utils/cancelRefund.utils.js
└── views/CancelRefundPage.vue
```

Flow: `CancelRefundPage.vue → useCancelRefund() → useClientList() → cancelRefund.api.js → services/http.js → Backend`.

Client-side pagination flow: `Backend → GET /v2/cancel-refund → allItems → filter → sort → paginate → visibleItems → Table`.

---

## 28. Mandatory theme migration integration

Visual theming is part of this skill's workflow, not an optional side reference. Whenever this skill creates or updates the `frontend-v3/` architecture, it **must** invoke the `vue3-theme-migration` skill — via the Skill tool (`skill: "vue3-theme-migration"`) — as a required execution step, not something to summarize or skip.

```text
Analyze frontend/ + existing frontend-v3/ → plan modular architecture → create/update frontend-v3 structure
    ↓
Invoke `vue3-theme-migration` skill (mandatory — not optional, not reference-only)
    ↓
Theme analyzed from frontend/, implemented in frontend-v3/'s themes/ (Sass/SCSS + CSS variables), loaded globally
    ↓
Verify global theme integration + modular theme architecture (per vue3-theme-migration's own checklist)
    ↓
Continue remaining modular architecture work (composables, API layer, Pinia, pagination, etc.)
    ↓
Final architecture + theme review
```

- Pass along the same feature focus / `$ARGUMENTS` when it's relevant to the theme work; otherwise invoke it for the full theme migration.
- Do not inline, paraphrase, or duplicate `vue3-theme-migration`'s implementation plan, token examples, or checklist here — delegate to it and rely on its own analysis, `themes/` architecture, and verification steps.
- Its constraints carry over as-is: `frontend/` stays read-only reference, all implementation lands in `frontend-v3/`, JavaScript only (Sass/SCSS is expected and is not an exception), the theme loads globally via `main.js` → `@/themes`, and the architecture supports future theme switching without touching business components.
- Its "Final review checklist" and "Deliverables" are required, not optional — this skill's own final review (below) isn't complete until the theme migration step has actually run and passed its checklist.
- If `frontend-v3/` already has a theme implemented, still invoke the skill so it can verify (not just assume) global integration and modular theme architecture, and fill in any gaps.

---

## Steps to follow

**Before coding:**
1. Confirm the target feature/domain (from `$ARGUMENTS` or the request).
2. Inspect the existing `frontend/` (Vue 2) architecture — as a functional reference only — for routes, API endpoints, request/response shapes, business rules, permissions, validation, UI behavior.
3. Inspect `frontend-v3/` for its existing architecture, if any — reusable components, composables, API services, pagination utilities, and any theme already in place — so new work fits what's there instead of fighting it.
4. Inspect the actual backend API behavior (default/max limits, response size, total count) to decide client-side vs server-side pagination.
5. Check for an existing caching mechanism before adding one.
6. Plan the target Vue 3 modular architecture (folders, features, composables, API modules) before creating files.

**Create/update the `frontend-v3/` structure** for the planned architecture, then immediately run the mandatory theme integration step (§28): invoke the `vue3-theme-migration` skill so the theme is analyzed from `frontend/`, implemented under `themes/` (Sass/SCSS + CSS variables), and loaded globally in `frontend-v3/` — and its own global/modular theme checklist passes — before continuing with the rest of the feature work. This is a required step in the flow, never deferred or treated as optional reference material.

**Continue coding**, applying sections 1–24 above: Vue 3 + Composition API + `<script setup>` + JavaScript only, small focused components, business logic in composables, API logic in API modules, Pinia only for shared state, no duplicate API requests, client-side pagination when safe, server-side when the dataset demands it, no unnecessary watchers, no repeated array transformations, existing behavior preserved.

**Final review**, covering both the modular architecture and the theme integration:
- **Architecture** — Is the feature modular? Are responsibilities separated? Is the folder structure appropriate?
- **Theme** — Was `vue3-theme-migration` actually invoked and did its checklist pass? Is the theme globally available throughout `frontend-v3/`? Does it use the required `themes/` + Sass/SCSS + CSS-variable architecture? Can a future theme be added without touching business components?
- **API** — Are unnecessary/duplicate requests removed? Does pagination avoid triggering requests unnecessarily? Is API logic outside components?
- **Performance** — API calls on initial load vs on page change? Loaded dataset size? Is client-side pagination actually safe here? Does the DOM render only the current page? Any repeated expensive computations?
- **Maintainability** — Is the component shorter? Is logic reusable? Any duplicated patterns? Are existing abstractions reused? Is it simple enough?
- **Safety** — Is `frontend/` unchanged? Is `frontend-v3/` free of TypeScript? Is there no unnecessary duplicate CSS/theme implementation?

Show the full contents of every new file and the diff for every modified file.

---

## Golden rules

1. JavaScript only — never introduce TypeScript.
2. Feature-based architecture.
3. Vue 3 Composition API.
4. `<script setup>`.
5. Small, focused components.
6. Business logic in composables.
7. API logic in API modules.
8. Pinia only for shared application state.
9. Reuse existing components and utilities.
10. Avoid duplicate API calls.
11. Client-side pagination when the dataset is reasonably small.
12. Never load huge datasets just to eliminate API calls.
13. Support server-side pagination when required.
14. Prefer one API request + local pagination when safe.
15. Keep original data separate from transformed/display data.
16. Optimize based on measurements, not assumptions.
17. Don't over-engineer.
18. Theme migration (§28) is a mandatory, non-optional step of this workflow — always invoke the `vue3-theme-migration` skill when creating or updating the `frontend-v3/` architecture, and never treat it as reference-only or defer it indefinitely.
