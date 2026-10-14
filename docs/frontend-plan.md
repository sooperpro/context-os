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

| Decision        | Choice                                                                                                                              | Why                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Design system   | Material 3 Expressive tokens on top of shadcn/Base UI mechanics                                                                     | Prototype fidelity without rewriting focus management and composition                    |
| Theme mechanism | `data-theme` attribute on `<html>`, resolved by `ThemeProvider`                                                                     | Matches the prototype and the token file; `dark:` utilities key on it                    |
| Fonts           | Google Sans Flex and Google Sans Code from Google Fonts, system fallback                                                            | Not self-hostable; fallback stack must be checked, not assumed                           |
| Icons           | Material Symbols Rounded as per-icon SVG components (`components/ui/icons.ts`, SVGR) everywhere; Lucide removed and blocked by lint | One registry keeps the set visible; filled variants mark active navigation (FILL 1)      |
| Token source    | Hand-maintained CSS, no generator                                                                                                   | One consumer today; a generator pays off at two                                          |
| Roles           | Navigation and visibility from the backend role (Owner/Admin/Manager/Member/Guest)                                                  | The prototype's four fixed roles do not match the API; HR maps to Admin plus assignments |

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
`large` 1600.

**Sign-in (done):** the prototype's split frame (`features/auth/components/sign-in-layout.tsx`: brand
panel with expressive shapes and the pitch, card on the right, single-sign-on note) hosts Clerk's
sign-in and organization list. Clerk's components are themed from the design tokens at runtime
(`features/auth/clerk-appearance.ts`, read from the document so both themes work), which also covers
the organization switcher and account menu in the top bar. The company-domain check belongs to
Clerk's allowed-domain settings, not to the page. The first-day flow after sign-in (welcome, profile,
first 90 days) is part of learning paths and onboarding.

### Phase 4: screens, in order of value

1. [x] Workspace setup wizard (`GET/PATCH /workspaces/current/setup`) at `/setup` for owners and admins:
       stepper, evidence-backed completion, skip and resume, sync counts. Composes the create-project
       dialog, a new invite-member dialog (`features/members`) and Google Drive authorization
       (`features/connectors`). Steps 2 and 5 are honest placeholders until their screens ship.
2. [x] People at `/members`: directory with role and status, owner/admin management menu (role, suspend,
       reactivate, offboard; ownership changes limited to owners, last-owner protection surfaced from the
       API), invite dialog, and departments with nested teams (create, rename, delete, sub-teams to three
       levels). Employment profiles (`/users/:id/organization`) are not edited yet.
3. [x] Google Drive connector flow: authorize from the wizard or the Sources page, browse folders with
       Google page tokens, import one selected file at a time (`features/sources` Drive import dialog on
       top of `features/connectors` queries). Sheets and Slides are listed as not supported, matching the API.
4. [x] Ask as private conversations: thread list per project, create from the first question, delete with
       confirmation, answers streamed over server-sent events (`lib/sse.ts` reads the stream with the
       same base URL and session token as `apiRequest`; the API sends status, then one whole cited
       answer). The Context Bot pane still uses the one-shot Ask endpoint; moving it onto a per-project
       thread is a small follow-up.
5. Learning paths and onboarding

Each screen composes library pieces only. A missing primitive goes into the library first.

### Phase 5: bring the older screens onto the library

- [x] Projects: prototype page head (kicker, headline, actions with Ask Context Bot), search, tonal
      "start here" cards with a shape tile, status chip and stats. Card gained `tone` and `interactive`
      variants; PageHeader gained a kicker.
- [x] Project page from the prototype's Project Kestrel: AI-tinted hero with the spinning mark, type and
      sync chips, facts and actions; one row of pill navigation over the hub sections, Sources and Ask;
      overview with "How it connects" (by kind), the cited overview, risks and open questions, and an aside
      with Ask prompts and sources. Timeline on the prototype's rail. Badges became icon status chips.
      New primitives: PillTabs, MetaChip, TypeChip, Card tone "pane".
- [x] Sources page and answer cards: segmented source rows with kind tiles, provenance and icon status
      chips, confirmed delete; answer card with the prototype's confidence label, AI citation chips and a
      numbered source list.
- [x] One icon language: every screen, layout and primitive uses Material Symbols from the registry;
      `lucide-react` is removed and lint rejects it (shadcn generates Lucide imports, swap them on add).

### Reference audit (2026-10-14)

A pass over every built surface against the prototype's CSS and JS found three gaps, now closed:

- [x] Base components: filled M3 text fields and selects, 16px menus with 44px items, 28px dialogs, inverse
      snackbars, 450ms inverse tooltips, borderless 24px cards (`--cx-card-radius`).
- [x] Context Bot pane: header actions (new conversation, expand to the Ask page, close), context chips,
      welcome with prompt cards and the trust line, chat bubbles, the morphing loader, answer tools
      (helpful / not helpful with reasons / copy), the no-answer state with "Report a knowledge gap",
      error and retry, the 28px composer. Conversations run on the Ask threads API.
- [x] Settings pinned to the rail bottom and linked from the account menu: profile name and time zone,
      notification channels and quiet hours, theme, and sign-in through Clerk. Only settings the API
      stores are offered (no notification categories, language or reduce-motion toggle).

- [x] Navigation follows the reference: no Projects item. The rail's "Knowledge Hub" (`/knowledge`) has
      the reference's eight filters in its order: All, Company, Products, Projects, Systems, Processes,
      Decisions, Glossary & FAQs. Company, Products, Projects and Processes are projects by category;
      Systems, Decisions and Glossary are each project's context items. Browse ends with the reference's
      "Teams & people" card, which links to People. The hub stays active on project pages, whose breadcrumb
      reads Knowledge Hub › Projects › name. `/` opens the Knowledge Hub until the Home dashboard exists.
      The API does not store a project category yet, so every project counts as "Projects" and the other
      three show an empty state; the change is written up in `docs/api-change-requests.md`, with the
      workspace-wide items endpoint that should replace one request per project.

- [x] Home for each role, from the reference: employee (up next, onboarding ring and stages, this week's
      tasks, milestones, ask band, knowledge updates, team news, your people, contributions), manager
      (attention, check-ins with an AI prep box, roster against plan, knowledge gaps, team knowledge),
      HR (KPIs, probation reviews, team bars, starters, overdue milestones, templates) and the admin
      overview (live connectors with a reconnect banner, members and audit log; security, sync runs and AI
      answers as preview data). `/` opens Home; the rail shows "Home", or "Overview" for admins. In
      development the View-as menu's "Preview as" renders the whole app (rail, Home, role-gated
      controls) as Employee, Manager, People Ops or Admin, from one account; `/?view=employee` starts
      it too. Every role check reads `useViewer()`, never the workspace role directly. The API still
      enforces the real role, so a preview checks layout and navigation, not permissions. Controls whose screen does not
      exist yet call `comingSoon()` instead of linking to a missing page.

- [x] Contributions and New contribution, from the reference: counters, knowledge gaps to fill, your
      contributions with the Draft → Submitted → In review → Published track, reviewer comments and
      resubmit; the editor with type, section, visibility, "Draft from sources", a source picker, the
      suggested reviewer, the readiness checklist, Save draft and Submit for review. "Contributions" is
      in the Employee rail. Home's contribution card, its "Contribute knowledge" button and the
      manager's "Create article" gap action open these screens.
- [x] My roadmap, module, lesson and knowledge check, from the reference: stage tabs with the probation
      review, modules by state, progress, help and history; the module hero, lessons, objectives,
      sources and people; lessons rendered from typed blocks (flow diagrams, decision records,
      milestones, practice questions) with "select text to ask Context Bot"; the graded check with its
      review and what passing changed. Request clarification and Request a roadmap change send to the
      owner and manager. Home's "View roadmap", "Resume module", milestones and task buttons open them.
- [x] People directory and profiles, from the reference: search by name, role, team or skill; Everyone,
      My team, Experts and New joiners filters; badges relative to you; a Teams view with your team's
      org chart and every team; Ask an expert; profiles with what they own and their reporting line.
      Employee, Manager and HR open People; Admin's rail has "Members & roles" (the live member
      management page) instead, as in the reference. This completes the Employee view.
- [x] The Manager view, from the reference: Team onboarding (status strip, member cards against plan,
      knowledge checks by topic), a member page (Context Bot insight with an action, progress, roadmap
      editing, checks, coming up, check-ins, probation), the check-in form (type, agenda, pulse,
      readiness, blockers, notes, next steps, probation recommendation, evidence), the review queue
      (diff, sources, approve or request changes) and My learning. "Assign a learning task" and
      "Assign a roadmap" dialogs open from Home, the team page and the member page. The rail is the
      reference's: Home, Team onboarding, Knowledge Hub, Review queue, People, My learning. Home is
      treated as an orchestrator: it may open other features' dialogs.
- [x] The HR view, from the reference: Onboarding (search, team, filter chips with counts, the records
      table, New onboarding), an onboarding record (assignments with change dialogs, the setup checklist,
      progress, milestones), Probation reviews (the pipeline with a review track per person, Remind
      managers, recently completed), a review (the manager's ratings and note, milestones, activity, and
      the Employment status decision with a confirmation) and Templates (cards, a stage and module
      editor with Add module, Save draft and Publish with a note, version history, New template). HR
      Home's buttons, review rows, follow-ups and template cards open them. A manager's probation
      recommendation from a check-in lands in the HR pipeline. The rail is the reference's: Home,
      Onboarding, Probation reviews, Templates, People, Knowledge Hub. Shared pieces moved down into
      `components/`: `ProfileHero` (profiles, member page, HR records), `PersonCell`, `AskCard`,
      `SearchField`, `EmptyMini`, `ChipCount` and a compact `ProgressSteps`.
- [x] The Admin view, from the reference: Members & roles (seats, role counts, role requests with an
      admin confirmation, the members table with roles changed in place and a confirmation for admin
      or owner, what each role can do; departments and teams stay in their tab), Connectors (summary,
      connected sources with sync progress and Fix, the catalog with categories and search, the
      three-step connect wizard, Request a connector), Access policies (conflict banner and
      resolution, policies with sources and groups, new and edit, preview access per person), AI
      settings (quality tiles, answer rules, strictness, staleness and routing, never used in answers,
      why answers were rated unhelpful, top unanswered questions, weekly digest) and the Audit log
      (search, date range, categories, expandable entries; live). The admin Home's buttons and cards
      open them. Brand logos for connectors (CC0, gilbarbara/logos) live in `src/assets/logos` behind
      `ConnectorLogo`. The rail is the reference's: Overview, Members & roles, Connectors, Access
      policies, AI settings, Audit log, Knowledge Hub, then Workspace setup.
- [x] Knowledge item pages, from the reference: every extracted item (decision, system, person,
      term, status, event, dependency) has a page with its chips, summary, key facts, where it comes
      from (evidence quotes that open the source), connected knowledge, owners and experts,
      verification and feedback, Save, Ask and Open in the source. The Knowledge Hub lists saved
      items, and the project overview's "How it connects" is the reference's relationship map.
- [x] Context Bot follows the page, as in the reference: each screen declares its chips, intro and
      suggested questions (`useBotContext`), personas get their own defaults, and the bot pauses
      while a knowledge check is open. Outside a project it answers about the workspace, with
      citations, sources, people to ask, feedback with reasons, copy, related knowledge and
      follow-ups, plus the honest "no answer" (report a knowledge gap) and "restricted" states.
- [x] The rail is gated by persona as well as role, so each "Prototype · view as" persona (Employee,
      Manager, HR, Admin) gets the reference's items as their screens ship.

Not built because nothing backs them yet: rail badges (no unread counts per area), the prototype's
"Save" on answers and knowledge items, notification categories.

## Building screens before the API exists

The UI is built from the reference first; the backend follows. Fake data never lives in components.

1. **Contract first.** Write the response schema in `packages/shared` and name its endpoint in a comment.
   That file is what the backend implements.
2. **Register the endpoint** in the feature's API module (path plus schema, as in
   `features/home/api/home.api.ts`). Screens call it like any live endpoint.
3. **Mock it** in `apps/web/src/mocks/` with `mockGet(endpoint)(() => fixture)` and add it to
   `mocks/endpoints.ts`. The fixture is type-checked against the schema and parsed at runtime, so a mock
   cannot drift from the contract. Use the shared cast in `mocks/fixtures/people.ts` and dates relative
   to today from `mocks/fixtures/time.ts`.
4. **Mark it.** Pass the path as `endpoint` to `SectionCard` (or render `PreviewDataChip`); the card shows
   "Preview data" while the endpoint is mocked and nothing once it is live or in production.
5. **Test with the same mocks.** `setupMockApi()` from `src/test/msw.ts` serves them under Node;
   `src/mocks/endpoints.test.ts` checks every mock against its schema.
6. **When the endpoint ships,** delete its mock and update the table in `docs/api-change-requests.md`.

The mock layer runs only in development with `VITE_MOCK_API=true` (in `apps/web/.env`). Requests to
endpoints without a mock go to the real API. Production builds contain neither the mocks nor MSW, and
the worker script is served by the dev server only (`apps/web/dev-server/`, see `vite.config.ts`).

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
- **Lint enforces one icon set.** `lucide-react` imports are errors; add missing icons to the registry.
- **Teal is for AI only.** A convention, not a lint rule; it lives in the component docs and review.

## Risks

- Google Fonts is a network dependency; the fallback stack is `system-ui`.
- Material Symbols is large; import icons by name only.
- The non-admin dead end (API 403 "An organization admin must initialize the workspace") is unhandled in
  the auth gate and will surface when a second user joins an organization.
