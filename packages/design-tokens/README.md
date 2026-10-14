# @contextos/design-tokens

The single source of truth for how ContextOS looks. Ported from the Material 3 Expressive
prototype (`tokens.css`) and layered so that components never contain a raw value.

## Layers

| File              | Contains                                                                                  | Who reads it                        |
| ----------------- | ----------------------------------------------------------------------------------------- | ----------------------------------- |
| `reference.css`   | Raw Material 3 values: color roles (light and dark), type scale, shape, spacing, elevation, state layers, motion springs, layout sizes | Only `semantic.css` and `theme.css` |
| `semantic.css`    | App roles built on the reference layer: the shadcn variable contract (`--primary`, `--card`...), `--cx-*` surfaces, status roles (success, warning, info, AI) | Tailwind, via `theme.css`            |
| `theme.css`       | The Tailwind `@theme` block that turns semantic tokens into utilities (`bg-primary-container`, `rounded-xl`, `shadow-elevation-2`, `ease-spring-fast-spatial`) | Every component                      |
| `index.css`       | Imports the three files in order                                                          | `apps/web/src/index.css`            |

Rules:

- Raw colors, radii and font names live in `reference.css` only. `pnpm --filter @contextos/design-tokens lint` enforces it.
- Components use semantic utilities (`bg-card`, `text-on-primary-container`, `bg-success/10`), never reference tokens and never Tailwind's built-in palette (`bg-emerald-500`). The web app's ESLint config enforces that side.
- Teal (`tertiary`, exposed as `ai`) is reserved for Context Bot and AI-generated content.
- Status is never color alone: pair every status color with an icon or a label.

## Theming

Dark mode is driven by `data-theme="dark"` on `<html>`, matching the prototype. The reference layer also
follows `prefers-color-scheme` when no explicit `data-theme` is set, so server-rendered or static pages
pick the right scheme before JavaScript runs. Tailwind's `dark:` variant keys on the same attribute.

## Fonts

Google Sans Flex and Google Sans Code are loaded from Google Fonts. Add these to the host page `<head>`
(the web app does this in `index.html`); the font stacks fall back to system fonts when offline:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght,ROND@6..144,1..1000,0..100&family=Google+Sans+Code:wght@400..600&display=swap" />
```

## Using it

```css
/* apps/web/src/index.css */
@import "tailwindcss";
@import "@contextos/design-tokens";
```

Change a value in `reference.css` and every component follows. Add a new role in `semantic.css` and
expose it in `theme.css` before any component uses it.
