---
description: Scaffold a new Vue 2 page for the jarvis-web dashboard following project conventions
---

Create a new Vue 2 page for the jarvis-web admin dashboard following these conventions:

**Input**: $ARGUMENTS (format: `<page-name> <domain>` — e.g. `OrderSummary b2c-sociolla`)

**Steps to follow:**

1. **View component** — create `frontend/src/view/<domain>/<PageName>.vue` as a Vue 2 SFC:
   - Use `<template>`, `<script>`, `<style scoped lang="scss">` blocks
   - Use Options API (not Composition API — this is Vue 2)
   - Import and use `CommonDatePicker`, `CommonSelect`, or `CommonInput` from `src/component/` where appropriate
   - Use `this.$store` for Vuex state; use `this.$toasted` for notifications
   - Use `moment().tz('Asia/Jakarta')` for any date display

2. **Route entry** — add a lazy-loaded route entry to `frontend/src/router/<domain>/index.js`:
   ```js
   {
     path: '/<domain>/<page-path>',
     name: '<PageName>',
     component: loadPage('<domain>/<PageName>'),
     meta: { permission: '<PERMISSION_KEY>', breadcrumb: [...] }
   }
   ```

3. **Vuex module** (if the page has its own state) — create `frontend/src/store/<domain>/<pageName>.js` with `state`, `getters`, `mutations`, `actions`. Register it in the store index.

4. **API call** — add the Axios call in `frontend/src/util/interceptor.js` pattern or in a dedicated service file under `src/util/`. Use `CancelableRequest` to avoid stale responses on route change.

Show the full file contents for each new/modified file. Check existing pages in the same domain for style reference before writing.
