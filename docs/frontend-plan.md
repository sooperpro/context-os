# Frontend plan: design foundation and UI library

Status: in progress. Owner: frontend. Started 2026-10-14 on branch `feat/design-foundation`.

The design prototype (Material 3 Expressive, delivered as `Context OS/` with `HANDOFF.md`) is the source of
truth for layout, behavior and copy. This plan turns it into a production frontend inside the existing
React 19 / Vite / Tailwind v4 / shadcn (Base UI) / TanStack Query / React Router 8 stack.

## Architecture: three layers, one dependency direction

```
packages/design-tokens      reference → semantic → Tailwind theme   (values live here, nowhere else)
        ↓
apps/web/src/components/ui  primitives: generic, variant-driven, no domain words
        ↓
apps/web/src/features/*     domain compositions, API, queries, pages (existing structure)
```

Nothing reads upward. A feature never defines a color; a primitive never knows what a "source" is.

**The adapter.** shadcn's variable contract (`--primary`, `--card`, `--muted`, `--ring`...) is kept and
fed from Material roles in `semantic.css`. The existing components retheme without edits. Material-only
roles (`primary-container`, the `surface-container` ladder, `tertiary` as `ai`, `success`, `warning`,
`info`) are exposed alongside for new primitives.

## Decisions

| Decision        | Choice                                                                             | Why                                                                                     |
| --------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Design system   | Material 3 Expressive tokens on top of shadcn/Base UI mechanics                    | Prototype fidelity without rewriting focus management and composition                   |
| Theme mechanism | `data-theme` attribute on `<html>`, resolved by `ThemeProvider`                    | Matches the prototype and the token file; `dark:` utilities key on it                   |
| Fonts           | Google Sans Flex and Google Sans Code from Google Fonts, system fallback           | Not self-hostable; fallback stack must be checked, not assumed                          |
| Icons           | Material Symbols (SVG, imported by name) replacing Lucide: separate PR             | Touches every feature file; kept out of the foundation change                           |
| Token source    | Hand-maintained CSS, no generator                                                  | One consumer today; a generator pays off at two                                         |
| Roles           | Navigation and visibility from the backend role (Owner/Admin/Manager/Member/Guest) | The prototype's four fixed roles do not match the API; HR maps to Admin plus assignments |

## Phases

### Phase 1: foundation (this branch)

- [x] `packages/design-tokens` with reference, semantic and Tailwind theme layers
- [x] Font swap: Geist out, Google Sans Flex and Google Sans Code in
- [x] Theme provider and pre-render snippet switched to `data-theme`
- [x] ESLint guardrail: no raw colors, no Tailwind palette classes, no `dark:` in feature code
- [x] Status colors in feature badges moved to semantic tokens
- [x] Component gallery at `/dev/ui` (development builds only, outside the auth gate)
- [x] This plan and a decision-log entry

Exit: every existing screen renders in both themes with the new tokens; typecheck, lint, tests and build pass.

### Phase 2: primitive library (this branch)

- [x] From shadcn, restyled to the tokens: avatar (6 tones, 6 sizes, expressive shapes), switch (M3 52×32),
      progress (wavy indicator, stop dot, 5 tones), dropdown menu, table, breadcrumb, button group
- [x] Hand-built: chip (assist, filter, suggestion, ai, prompt), status chip (icon required), stepper,
      KPI tile and mini tile, logo tile and stack, banner, FAB, option tiles, segmented list,
      connected button group
- [x] Button: filled, tonal (`secondary`), outline, text (`ghost`), elevated, ai, ai-tonal, filled error;
      sizes xs 32 · sm 36 · default 40 · md 56 · lg 96 and icon squares; corner morph on press
- [x] Tests for the new primitives (`components/ui/primitives.test.tsx`)
- [x] Gallery entries for everything, checked in both themes and at phone width

Still to do when a screen needs them: wavy circular progress, morphing-shape loader, expressive
clip-path shapes (cookie, clover, sunny, flower), navigation rail items (Phase 3), search bar (Phase 3).

### Phase 3: app shell (this branch)

- [x] Navigation rail: 248px expanded, 96px collapsed, user preference persisted, forced collapsed below
      1200px and while Context Bot is open between 1200 and 1599px
- [x] Top bar (72px): search that hands its text to Context Bot, organization switcher, account; on compact
      windows the brand moves here and search becomes an icon
- [x] Bottom navigation below 600px (up to four destinations) with the Ask FAB
- [x] Context Bot pane: 420px side pane at 1200px and above, modal side sheet below, full screen on phones
- [x] Context Bot panel (`features/ask`): answers from the current project through the existing Ask API,
      with confidence, uncertainties and citations; outside a project it says so instead of guessing
- [x] Navigation from one config (`components/layout/navigation.ts`) gated by the backend role from
      `GET /workspaces/current`; only shipped screens are listed
- [x] Keyboard: ⌘J / Ctrl+J toggles Context Bot, `/` focuses search; skip link to content
- [x] Existing pages moved inside unchanged; shell tests cover landmarks, FAB and keyboard toggle

Window size classes are Tailwind breakpoints from the token package: `medium` 600, `expanded` 1200,
`large` 1600. Clerk's own components still use Clerk's default styling; theming them through the
appearance API is a Phase 4 polish item.

### Phase 4: screens, in order of value

1. [x] Workspace setup wizard (`GET/PATCH /workspaces/current/setup`) at `/setup` for owners and admins:
       stepper, evidence-backed completion, skip and resume, sync counts. Composes the create-project
       dialog, a new invite-member dialog (`features/members`) and Google Drive authorization
       (`features/connectors`). Steps 2 and 5 are honest placeholders until their screens ship.
2. Members, invites, roles, departments and teams
3. [x] Google Drive connector flow: authorize from the wizard or the Sources page, browse folders with
       Google page tokens, import one selected file at a time (`features/sources` Drive import dialog on
       top of `features/connectors` queries). Sheets and Slides are listed as not supported, matching the API.
4. Ask threads with streaming (`POST /ask/threads/:id/messages`, SSE)
5. Learning paths and onboarding

Each screen composes library pieces only. A missing primitive goes into the library first.

## Guardrails

- **Lint enforces tokens.** `src/components/**` and `src/features/**` may not contain hex, `rgb()`,
  `oklch()`, Tailwind palette classes (`bg-emerald-500`) or, in features, `dark:` variants.
- **Review enforces reuse.** Pull request checklist: typecheck, lint, tests, gallery reviewed in both
  themes and at phone width, and "did this add a component that already existed?"
- **The gallery makes duplication visible.** Check `/dev/ui` before building anything.
- **Feature components do not import from other features.** A feature's `api/` and queries may be reused
  by another feature (the Sources page uses the connectors queries); its components and pages may not,
  except for orchestrating features such as the setup wizard, which compose other features' dialogs.
  Anything two features both render moves down into `components/`.
- **Teal is for AI only.** A convention, not a lint rule; it lives in the component docs and review.

## Risks

- Google Fonts is a network dependency; the fallback stack is `system-ui`.
- Material Symbols is large; import icons by name only.
- The non-admin dead end (API 403 "An organization admin must initialize the workspace") is unhandled in
  the auth gate and will surface when a second user joins an organization.
