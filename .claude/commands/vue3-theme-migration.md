---
description: Migrate the visual theme from the legacy frontend/ (Vue 2) into frontend-v3/ (Vue 3) as a clean, global, modular Sass/SCSS theme architecture (CSS variables for runtime switching) that supports future theme switching
---

Act as a senior Vue.js architect working inside `frontend-v3/`, the new Vue 3 frontend being built alongside the existing `frontend/` (legacy Vue 2) app.

**Input**: $ARGUMENTS — optional focus area (e.g. a specific component or theme name). If empty, perform the full theme migration described below.

The goal: make `frontend-v3/` visually consistent with `frontend/` while introducing a clean, global, modular theme architecture — built with Sass/SCSS and CSS variables — that allows additional themes to be added and switched in the future. Vue 3, Composition API, `<script setup>`, JavaScript only — no TypeScript. (Sass/SCSS is a CSS preprocessor, not TypeScript — the JS-only rule governs application code, not stylesheets.)

---

## 0. Project boundary

```text
project/
├── backend/
├── frontend/       # existing/legacy Vue 2 app — reference only, read-only
└── frontend-v3/    # new Vue 3 app — all implementation goes here
```

- `frontend/` is the source of truth for the current visual theme. Inspect it only — never modify it unless explicitly requested.
- All implementation happens inside `frontend-v3/`.
- Do not blindly copy the Vue 2 architecture — rebuild the theme using a clean Vue 3-compatible architecture.
- Do not introduce TypeScript.

## 1. Non-goals

Do not: redesign the existing UI, change business logic, change API behavior, change backend code, migrate the entire Vue 2 application, modify `frontend/`, introduce TypeScript, replace the existing UI framework unless required, create unnecessary abstractions, force all styles into a single file, replace CSS custom properties with Sass variables for values that must change at runtime, or build a theme system more complicated than necessary.

## 2. Analyze the existing theme first

Before writing any code, inspect `frontend/` and identify — do not assume how the theme works:

- Global style entry points, existing CSS/Sass variables.
- Colors and design tokens, typography and fonts, spacing, border radius, borders, shadows, backgrounds.
- Buttons, inputs/selects, tables, modals, dropdowns, navigation, layout styles, component styles.
- Hover, active, focus, disabled, error, success, warning, and loading states.
- Existing theme classes, UI framework styles and overrides, any existing dynamic theme behavior.

Also inspect the current `frontend-v3/` structure so the theme architecture fits what already exists rather than fighting it.

## 3. Theme architecture

Prefer a structure like this, adjusted to what `frontend-v3/` already has — don't create folders it doesn't need:

```text
frontend-v3/
└── src/
    ├── themes/
    │   ├── default/
    │   │   ├── _variables.scss
    │   │   ├── _colors.scss
    │   │   ├── _typography.scss
    │   │   ├── _components.scss
    │   │   └── index.scss
    │   │
    │   ├── dark/
    │   │   ├── _variables.scss
    │   │   ├── _colors.scss
    │   │   ├── _typography.scss
    │   │   ├── _components.scss
    │   │   └── index.scss
    │   │
    │   ├── index.scss
    │   └── index.js
    ├── components/
    ├── features/
    ├── composables/
    ├── services/
    ├── utils/
    └── main.js
```

Underscore-prefixed `.scss` files are Sass partials (not compiled on their own); `index.scss` in each theme folder assembles them, and the top-level `themes/index.scss` assembles the themes. `themes/index.js` is the only JS entry point — it imports the compiled stylesheet and exposes the theme-switching function.

Check `frontend-v3/package.json` for a `sass` devDependency before starting — Vite compiles `.scss` out of the box, but only once the `sass` package is installed (`npm install -D sass`).

## 4. Sass for organization, CSS variables for runtime values

Two tiers, don't blur them:

```text
Sass/SCSS
    ↓
Theme organization
    ↓
CSS Variables
    ↓
Runtime theme switching
    ↓
Vue 3 components
```

- **Sass variables and maps** (`$color-primary`, `$spacing-md`, …) are a *build-time* authoring convenience — organizing tokens per theme, sharing values between partials via `@use`/`@forward`, computing derived values (`darken()`, `map.get()`, …). They don't exist in the compiled output.
- **CSS custom properties** (`--color-primary`, `--spacing-md`, …) are the *runtime* layer. Components consume `var(--color-primary)`, never a Sass variable directly — that's what makes switching themes a matter of swapping an attribute instead of rebuilding stylesheets.
- Each theme's `_colors.scss` / `_typography.scss` partial's only job is translating that theme's Sass variables into CSS custom properties scoped under a theme selector (see §7). Never let a component read a Sass variable for a value that a future theme might override — it would be frozen at build time for whichever theme compiled last.

## 5. Design tokens

`_variables.scss` holds the Sass source values for a theme:

```scss
// themes/default/_variables.scss
$color-primary: #5d598d;
$color-primary-hover: #4a4771;
$color-background: #ffffff;
$color-surface: #ffffff;
$color-text: #231f20;
$color-text-muted: #979797;
$color-border: #e5e5e5;
$color-error: #e95555;
$color-success: #93cd60;
$color-warning: #f0ad4e;

$font-family-base: 'Roboto', sans-serif;
$font-size-base: 14px;

$spacing-xs: 4px;
$spacing-sm: 8px;
$spacing-md: 16px;
$spacing-lg: 24px;

$radius-sm: 2px;
$radius-md: 6px;

$shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24);
$shadow-md: 0 2px 6px 0 hsla(0, 0%, 0%, 0.2);
```

`_colors.scss` (and `_typography.scss` for font/size tokens) turn those into the actual runtime tokens:

```scss
// themes/default/_colors.scss
@use './variables' as v;

:root,
[data-theme='default'] {
  --color-primary: #{v.$color-primary};
  --color-primary-hover: #{v.$color-primary-hover};
  --color-background: #{v.$color-background};
  --color-surface: #{v.$color-surface};
  --color-text: #{v.$color-text};
  --color-text-muted: #{v.$color-text-muted};
  --color-border: #{v.$color-border};
  --color-error: #{v.$color-error};
  --color-success: #{v.$color-success};
  --color-warning: #{v.$color-warning};

  --spacing-xs: #{v.$spacing-xs};
  --spacing-sm: #{v.$spacing-sm};
  --spacing-md: #{v.$spacing-md};
  --spacing-lg: #{v.$spacing-lg};

  --radius-sm: #{v.$radius-sm};
  --radius-md: #{v.$radius-md};

  --shadow-sm: #{v.$shadow-sm};
  --shadow-md: #{v.$shadow-md};
}
```

Only create tokens that are useful — don't turn every value into a variable (Sass or CSS) without a reason.

## 6. Global theme loading

The theme must be globally available — individual components should never import a theme partial manually:

```text
main.js → import '@/themes' → compiled CSS variables + component styles → all Vue components
```

```scss
// themes/default/index.scss
@forward './variables';
@use './colors';
@use './typography';
@use './components';
```

```js
// themes/index.js
import './index.scss'

const DEFAULT_THEME = 'default'

export function applyTheme(theme = DEFAULT_THEME) {
  document.documentElement.setAttribute('data-theme', theme)
}

applyTheme()
```

```js
// main.js
import '@/themes'
```

## 7. Future theme switching infrastructure

Build the infrastructure even if no theme-switcher UI is requested yet. Every theme's `_colors.scss` / `_typography.scss` scopes its CSS variables under its own `[data-theme="…"]` selector, and the top-level `themes/index.scss` pulls every theme into **one compiled stylesheet**:

```scss
// themes/index.scss
@use './default';
@use './dark';
```

Because all themes' variable blocks live in the same stylesheet, switching is just flipping the attribute — no re-import, no swapping `<link>` tags:

```html
<html data-theme="default">  →  <html data-theme="dark">
```

Component rules (`_components.scss`) should be theme-agnostic — they consume `var(--color-primary)`, not a Sass variable, so they don't need to be re-authored per theme. Sass only ever emits a given partial's CSS once per compilation no matter how many times it's `@use`d/`@forward`ed, so a non-default theme can safely reuse the default theme's component partial instead of duplicating it:

```scss
// themes/dark/_components.scss
// Component rules already consume CSS variables and are theme-agnostic —
// reuse the default theme's partial instead of duplicating it.
@forward '../default/components';
```

Only give a theme its own `_components.scss` content when it genuinely needs structurally different rules — not just different colors, which belong in `_colors.scss`.

```text
themes/
├── default/{variables,colors,typography,components,index}.scss
├── dark/{variables,colors,typography,components,index}.scss
└── index.scss
```

Do not build a theme-selector UI unless explicitly asked — just the infrastructure so one can be added later.

## 8. Component styling

Shared components consume theme tokens instead of hardcoding theme-specific values:

```scss
// themes/default/_components.scss
.button {
  background: var(--color-primary);
  border-radius: var(--radius-sm);
}
```

Business components should not redefine global design tokens unnecessarily, and should never reference a Sass variable (`v.$color-primary`) directly — only the CSS custom property.

## 9. Avoid duplication

Before adding a style: search existing global partials, component partials, variables, and UI framework overrides, and reuse/consolidate instead of re-adding. Use `@forward` to re-export a shared partial (see §7) rather than copy-pasting Sass or CSS rules between themes. Never blindly copy the entire legacy stylesheet directory into `frontend-v3/`.

## 10. Visual compatibility checklist

Verify the result matches `frontend/` as closely as practical: page background, text colors, primary/secondary colors, typography, font sizes/weights, buttons, form controls, tables, borders, border radius, shadows, modals, dropdowns, navigation, hover/focus/disabled states, error/success/warning states, spacing, layout behavior. If exact reproduction is impossible due to Vue 3 or dependency differences, document the limitation rather than silently changing the design.

## 11. Performance

Sass compiles to static CSS at build time — there's no runtime preprocessing cost, so prefer it over any CSS-in-JS or inline-style approach for theme values. Prefer CSS variables, statically compiled CSS, centralized theme loading, and minimal JS for theme switching (an attribute toggle). Avoid unnecessary watchers, repeated DOM manipulation, duplicated `@use`/`@forward` output, and dynamically generating large amounts of CSS at runtime.

## 12. Vue 3 / JS-only requirements

Vue 3, Composition API, `<script setup>`, JavaScript only for application code. No `*.ts` files, no `interface`/`type`/`<T>`/`defineProps<Type>()`/`defineEmits<Type>()`. Use JSDoc only when genuinely useful. Sass/SCSS (`.scss`) is expected and encouraged for styling — it is not TypeScript and this rule does not apply to it.

---

## Implementation plan

1. **Repository analysis** — inspect `frontend/` and `frontend-v3/`: Vue version, style architecture, global style entry points, UI framework, existing theme files/variables/classes, existing `frontend-v3` architecture, and whether `sass` is already a dependency.
2. **Theme mapping** — map legacy styles → color tokens → typography tokens → spacing tokens → component styles → global styles. Identify what's global vs. theme-specific vs. component-specific vs. layout-specific vs. framework overrides.
3. **Theme foundation** — create `frontend-v3/src/themes/default/` with `_variables.scss`, `_colors.scss`, `_typography.scss`, `_components.scss`, and `index.scss`; install `sass` if missing.
4. **Global integration** — wire `themes/index.js` (which imports the compiled `themes/index.scss`) into the Vue 3 app entry point so it loads automatically on startup.
5. **Future theme infrastructure** — implement the minimum architecture needed to add another theme (e.g. `dark`), scoped via `[data-theme="…"]` and forwarding shared component partials, without touching business components.
6. **Component verification** — check representative components: button, input, select, table, modal, dropdown, navigation, card, form, loading state, empty state, error state.
7. **Final review** — see checklist below.

## Final review checklist

- **Architecture**: Is the theme centralized? Is the structure easy to understand? Can another theme be added easily? Are business components independent from theme implementation?
- **Sass/CSS**: Are styles duplicated? Are theme values centralized? Are hardcoded theme values unnecessarily repeated? Are global styles actually global? Do components reference CSS variables only — never a Sass variable directly? Is `@use`/`@forward` used to share partials instead of copy-pasting?
- **Vue**: Is Vue 3 used correctly? Is `<script setup>` used? Is JavaScript-only maintained for application code (Sass/SCSS is expected for styling)?
- **Performance**: Is theme loading efficient? Any unnecessary watchers? Is runtime CSS generation avoided (styles compiled ahead of time)?
- **Safety**: Was `frontend/` left unchanged? Are all modifications contained within `frontend-v3/`?

## Deliverables

Report back with: the modular Sass/SCSS theme architecture created in `frontend-v3/`, the migrated default theme based on `frontend/`, how the theme is globally integrated, the centralized design tokens (Sass source + emitted CSS variables), the future theme-switching infrastructure, confirmation that `frontend/` is unchanged, the full list of created/modified files, and any known limitations or unavoidable visual differences.

---

## Golden rules

1. `frontend/` is read-only reference material — never modify it.
2. All implementation lives inside `frontend-v3/`.
3. JavaScript only for application code — never introduce TypeScript. Sass/SCSS is expected and is not an exception to work around.
4. Vue 3, Composition API, `<script setup>`.
5. Inspect the actual codebase before assuming how the legacy theme works.
6. Use Sass variables/maps to organize and author tokens; emit them as CSS custom properties for anything that must be switchable at runtime.
7. Never have a component or business style reference a Sass variable directly for a themeable value — only the CSS custom property.
8. The default theme loads globally — components never import a theme partial manually.
9. Build theme-switching infrastructure now (all themes compiled into one stylesheet, scoped by `[data-theme]`); build the switcher UI only if asked.
10. Consume tokens in shared components instead of hardcoding theme values.
11. Reuse and consolidate existing styles before adding more — use `@forward` to share partials across themes instead of duplicating them.
12. Document any visual differences that can't be reproduced exactly.
13. Don't over-engineer — no unnecessary folders, tokens, partials, or abstractions.
