---
description: Refactor a monolithic tab-based Vue 2 view into one file per tab, with the index dynamically loading the active tab's component
---

Split a jarvis-web page that renders multiple tabs from a single large file into one component per tab, following the pattern already used in `frontend/src/view/digital-marketing/google-services.vue`.

**Input**: $ARGUMENTS — path to the monolithic view file, e.g. `frontend/src/view/general-config/permission.vue`

**Reference pattern** (`google-services.vue`): `tabs()` carries a `component:` key per tab, each tab component is lazy-registered via `() => import(...)` in `components`, an `activeComponent()` computed resolves the active tab's component name, and the template renders `<component :is="activeComponent" v-if="activeComponent" />`.

**Steps to follow:**

1. Read the target file ($ARGUMENTS) and identify:
   - The `tabs()` computed (or equivalent) — the array of tab definitions (`name`, `section`/query key, `roleKey`, `isActive`)
   - The `viewType` computed — booleans derived from `$route.query.section` (or similar) used to select the active tab
   - Any per-tab branching (`if/else if` chains in methods/computed such as `endpoint()`, `showDownloadCsv()`) and per-tab template blocks (`v-if="viewType.isX"`)

2. Create a sibling folder named after the file, kebab-case, matching the base name (e.g. `permission.vue` → `permission/`), if it doesn't already exist.

3. For each tab, create `<folder>/<tab-name>.vue` (kebab-case) as its own Vue 2 SFC:
   - Move that tab's template block and only the data/computed/methods/watchers it uses into the new file
   - Keep Options API, `scoped` SCSS, and existing component imports (`CommonDatePicker`, `CommonSelect`, `CommonInput`, etc.) as used by that tab
   - If state or a method is shared across tabs (e.g. permission checks, shared filters), keep it in the parent and pass it down via props rather than duplicating it

4. Update the main file ($ARGUMENTS) to become a thin dispatcher:
   - Replace the inline per-tab template blocks with `<component :is="activeComponent" v-if="activeComponent" />`
   - Register each tab component lazily in `components`: `TabName: () => import('./<folder>/<tab-name>.vue')`
   - Add a `component:` key to each entry in `tabs()` pointing at its registered name
   - Add an `activeComponent()` computed that resolves the active tab (via the existing `viewType`/`$route.query.section` logic) and returns its `component` name
   - Keep `onChangeTab(tab)` (the `$router.push` navigation) and any `hasAccess`/`roleKey` permission filtering on `tabs()` unchanged

5. Run the `format-lint` skill on all touched files, then manually verify each tab renders and navigates correctly, confirming no shared state broke when logic moved out.

Show the full contents of every new/modified file.
