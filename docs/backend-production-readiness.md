# Backend production readiness and PRD coverage

Updated: 16 October 2026 (sign-in and roles). **Status: every PRD §20 endpoint group is implemented and tested locally; the system is still not certified for production** (infrastructure, live providers and SLOs remain unverified). The implementation adds real backend workflows and security controls, but a passing local test suite does not demonstrate the PRD's production requirements.

## Confirmed release scope

The owner selected **Phase 1 first, subsequent phases later**. Sign-in no longer uses Clerk: since 15 October it is Better Auth inside the API (`AUTH_MODE=accounts`; see [decisions.md](decisions.md)). The production sign-in setup (an SMTP account, Google and Microsoft OAuth clients, any customer's SSO) and the Google Drive project do not exist yet and will be configured later. Local development and mocked provider tests can proceed; live authentication/provider acceptance and production deployment remain unverified.

Phase 1 remains **in progress**, including these backend exit requirements:

- `WS`: verified-domain joins, CSV/bulk invitations, source identity linking, complete setup flow and knowledge-continuity/offboarding handling.
- `INT`: complete Drive ingestion/sync/ACL lifecycle plus Slack and Jira connectors. GitHub is optional per workspace, but its connector is absent. Durable backfill, webhooks, cursors, exclusions and permission/deletion sync are not implemented.
- `CTX/HUB/ASK`: atomic temporal claim/edge model, full ten-section hub contract, alternative-evidence permission rendering, complete claim-level Answer Contract, conversation memory/multi-project scope and measured token streaming.
- `KM/LRN/CHK/PRB/MEN`: full maintenance routing/correction workflows, genuine automatic path/quiz generation and supported question types, connector-event checkpoints, primary-mentor lifecycle/credit, scheduled milestones and stuck/sign-off nudges.
- `GAM/NTF/SRCH/ADM/MSC`: badges and full anti-gaming, notification consumers/email/quiet hours, global permission-filtered semantic search, governance/export/deletion/policies, companion producers/escalation and frontend widget.
- Security/operations: production data-store/infrastructure decisions, encrypted storage and key rotation, observability, backup/restore/deletion, provider outage handling, permission/AI evaluation gates and load/SLO verification.

Phase 1.5 rewards/kudos/bounties/leaderboards/billing/extension and analytics; Phase 2 EPM/reviews/SCIM; Phase 3 agent/MCP/media/desktop and extra connectors are **deferred**, not current Phase 1 release requirements. Some backend check-in/outcome/preferences foundations already exist from the initial broader request; they do not mean later phases are complete.

## Sign-in and roles (15 and 16 October 2026)

- Our own sign-in replaced Clerk: Better Auth inside the API with email and password, emailed sign-in links, Google, Microsoft, and company SSO (OIDC or SAML) once a workspace verifies its email domain. Sessions are stored in SQLite behind an HttpOnly cookie, with sign-out per device; workspaces, memberships, roles and invitations stay in the application tables. Invitations are emailed with a sign-in link. A workspace can require SSO.
- A sixth system role, `hr` (People Ops), reads company-wide onboarding, probation and template records; admins no longer see people data. Server-side route guards follow the [role access spec](../ContextOS_Role_Access_Spec.md).

## Implemented on 14 October 2026 (PRD §20 completion)

- Every endpoint listed in PRD §20 now exists, with the deviations table in [api-reference.md](api-reference.md#28-prd-20-mapping-and-deviations). 86 backend tests pass (24 new) covering settings, directory and invitations, identity links, slugs, hub sections and KHS, evidence, conflicts (open, auto-resolved, disputed, resolved), flags with co-reporters and bounty conversion, bounty rules, Ask feedback and promotion, leaderboards, kudos, clawbacks, rewards redemption, EPM footprints/brag docs/review cycles, learning credit and completion, quiz awards, onboarding health and mentor capacity, companion caps, maintenance sweeps, connector scopes/sync/disconnect modes and webhook signature/trigger matching.
- Business rules now enforced server-side: §8.1 state machines for flags, bounties, conflicts, plans and review cycles; §8.2 formula with staleness, impact, quality and self-loop multipliers and Appendix C caps; §8.3 AG-1, AG-2, AG-3, AG-4, AG-5 (holds), AG-6 (clawbacks), AG-7, AG-9, AG-10, AG-11; §8.4 tiers with upgrade events; §8.5 leaderboard rules; §8.6 authority-based auto-resolution with canonical sources and dispute; §8.8 transparent health; §8.9 mentor and curator credit; §8.11 continuity checklists and ownership bounties; §8.13 KHS; §8.14 companion caps; §13 in-app notification producers with batching, quiet hours and nudge caps.
- Still outside this backend: live token streaming, Slack/Jira/GitHub ingestion, email/Slack delivery, semantic reranking, SAML/SCIM, billing, seasonal badge awarding, PostgreSQL/pgvector scale targets and the frontend surfaces for the new areas.

## Implemented in the previous extension (13 October 2026)

- Clerk backend session verification and current organization membership checks (replaced by Better Auth on 15 October); explicit application roles, membership lifecycle/guest expiry, supported assignments and organization invitations.
- Workspace creation/settings, resumable setup progress, departments and three-level nested teams, tenant-checked employment profiles, reporting-cycle rejection and transactional local offboarding/revocation.
- Private-by-default manual sources; source grants; SQL candidate restrictions for keyword/vector retrieval; private Ask history and threads; stored answer source dependencies and revocation checks.
- Exact quote rejection and citation regeneration/fallback; conservative protection of merged context and global overview prose.
- Retained provenance through source deletion, filtered conflict IDs and complete-source dependency checks for generated learning items and flag comments. Old hub/flag records without dependency metadata are withheld; alternative-evidence rebuilding remains outstanding.
- Flags/corrections with optimistic locking, independent approval and partial workflow state rules.
- Learning drafts, evidence-template drafting, independent publication, immutable assignment snapshots, prerequisites, engagement heartbeats, manual multiple-choice quizzes, cooldowns, mentor sign-offs and eligible self-attestation.
- Manager-scoped onboarding plans, check-ins, employee responses, manually verified milestones and human-recorded outcomes.
- Companion preference/context/help APIs; notification storage/preferences; initial reputation accounting and database-enforced append-only ledgers.
- Google OAuth/state binding, verified provider identity, AES-GCM token storage, file discovery, selected-file Docs/text/PDF/DOCX import, deduplication, reader access checks and disconnect/purge.
- Additive database migrations and isolated API/Bruno test fixtures. Legacy sources with no access grants are restricted by migration; content is retained. Legacy answers lacking source-dependency metadata are not exposed.

The detailed endpoints and usage are in [backend-api-use-cases.md](backend-api-use-cases.md). Only implemented routes are included in the extended Bruno collection; absent PRD routes are not represented as successful placeholders.

## Local verification result (14 October 2026)

Using Node 24 (the shell default of Node 20 segfaults the native SQLite binding; run `nvm use`):

- Backend: **86 tests passed** across 23 files, including the 24 new PRD §20 tests. Shared contracts: 4 passed. Web: typecheck and tests pass with the extended shared schemas.
- `pnpm check` (lint, typecheck, test, build for every package) and `pnpm format:check` pass.
- Bruno CLI 4.2.1 against the isolated fixture (`RATE_LIMIT_MAX=0` so a 173-request run is not throttled): **173 requests: 114 passed, 59 skipped; 114/114 assertions passed.** Skipped requests need a second user session, provider configuration or an opt-in flag (`enableRewards`, `enableEpm`, `githubWebhookSecret`); they are not verified successes.

## Local verification result (13 October 2026, superseded)

On 13 October 2026, using Node 24:

- Backend: **62 tests passed**, including legacy database upgrade/idempotence, access/provenance regression, workflow state and mocked Google provider contracts.
- Shared contracts: **4 tests passed**. Frontend compatibility: **5 tests passed**; frontend authentication/UI features are not implemented by these changes.
- API/shared lint and type checks, frontend type check, API production build and formatting checks passed.
- Bruno CLI 4.2.1: **117 requests: 82 passed, 35 skipped; 82/82 executed tests passed**, against an isolated in-memory HTTP fixture with fake Gemini, not the user's development database.

Skipped requests require provider configuration, separate user sessions, supplied workflow resources or explicit mutation opt-ins. They are not verified successes. Live sign-in and Google acceptance, real Gemini answer quality and production SLOs remain unverified. Test fixtures ignore real sign-in and Google secrets unless synthetic Google test configuration is explicitly supplied.

## Full-PRD backlog inventory (includes deferred phases)

| PRD area               | Remaining implementation/verification                                                                                                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WS / §6                | Live verification of sign-in and SSO domain verification/auto-join, CSV invites and org imports, identity-link review, section/topic/team/department assignment scopes, complete role/action matrix, indirect-report policy enforcement, SSO/SCIM phases and offboarding continuity.               |
| INT                    | Slack, Jira and GitHub connectors; Drive Sheets/Slides/comments/revisions, selected folder/shared-drive backfill, provider exclusion rules, durable cursors, signed webhooks, scheduler/quota controls and tombstone lifecycle.                                                                    |
| CTX                    | Atomic subject/predicate/object claims, full entity/edge model, aliases and identity-based resolution, valid-from/to windows, automatic supersession, authority hierarchy, full conflict objects/resolution, staleness scheduler and incremental graph updates.                                    |
| HUB                    | Full ten-section contract and metadata, Domain Owners per section, permission-fingerprint generation/cache, alternative accessible evidence handling, filters/pagination, canonical sources, pinned/versioned notes, graph map and export phases.                                                  |
| ASK                    | Full PRD Answer Contract, deterministic claim-level dropping, conversation memory, multi-project scope, live token deltas and TTFT benchmarks, feedback reasons/privacy aggregates, k-anonymous gaps, suggestions and promotion/escalation phases.                                                 |
| KM                     | Complete flag routing, duplicate/co-reporter merging, appeal/escalation rules, correction source diffs, full supersession links, peer-verifier eligibility and maintenance notifications.                                                                                                          |
| LRN / CHK              | LLM path/quiz generation, full question types/rubrics, template library, connector-event completion, reliable anti-spoofed engagement, inaccessible-item prerequisite handling, version-update pushing, ratings/analytics and living-path maintenance.                                             |
| PRB / MEN              | Scheduled plan transitions, complete mentor lifecycle/capacity rules, business-day health computation, pauses/leave, stuck detection, event-based first wins, automatic escalations and nudge delivery.                                                                                            |
| GAM / RWD              | Full multiplier/cap policies, reciprocal/collusion detection, clawbacks and anomaly review; badge engine, curator/mentor attribution, kudos, spendable credits, bounties/budgets and redemption fulfillment.                                                                                       |
| NTF / SRCH / ANL / ADM | Event consumers, email/Slack delivery/digests, quiet-hours enforcement, global semantic search, analytics/KHS/k-anonymity, policy administration, data export/deletion and retention jobs.                                                                                                         |
| EPM / BIL / AGT        | Contribution footprints/brag docs/reviews and privacy/sharing; subscriptions/seat limits; scoped service principals and agent/MCP interfaces. These later PRD phases are not implemented by this extension.                                                                                        |
| MSC                    | Proactive trigger/cap rules, escalation and milestone producers, URL/checkpoint resolution, widget/extension/desktop clients and measured overhead/latency.                                                                                                                                        |
| Security / §23         | Complete tenant/ACL regression permutations, PostgreSQL RLS or approved equivalent, KMS envelope encryption/key rotation, encryption at rest, signatures/webhook replay defenses, IP/user-agent audit evidence, full hash verification/export, support access and deletion/anonymization policies. |
| Operations / §24–26    | Tracing/metrics/alerts, deployment manifests and rollback verification, encrypted backups/restore drills, provider outage fallback, token budgets, golden AI evaluation gates and production load/availability benchmarks.                                                                         |

The existing SQLite/FTS5 and brute-force vector implementation differs from the PRD's PostgreSQL/pgvector HNSW and scalable worker architecture. It has not demonstrated the specified 500 concurrent users, 500,000-chunk hubs, million-chunk retrieval latency or horizontal ingestion throughput. Migrating infrastructure or obtaining a scoped production exception is necessary before claiming those targets.

## External configuration and release gates

1. Configure production sign-in: `AUTH_SECRET`, `AUTH_URL`, `SMTP_URL` and `EMAIL_FROM`, the Google and Microsoft OAuth clients, and allowed origins. Test genuine sign-in and sign-out with each method, expired sessions, workspace switching, SSO-required workspaces and membership removal.
2. Configure and obtain approval for Google OAuth scopes. Test consent denial, partial scopes, refresh/reconnect, separate reader identities, shared-drive permissions, revocation and deletion using real accounts. Validate provider requirements against current official documentation.
3. Migrate the legacy default workspace and its access grants deliberately. New workspaces do not automatically inherit local prototype data. Review the privacy-changing migrations on a backup before deployment.
4. Complete the required modules above and run the PRD acceptance/permission/evaluation suites. Audit triggers protect new writes; old audit entries lack integrity hashes and are not retroactively certified.
5. Supply encrypted database/storage, secret management/rotation, TLS, backup/restore, observability and deployment infrastructure. Exercise rollbacks and worker recovery. Outbox records currently have no dispatch consumer.
6. Benchmark real model/provider behavior and corpus/concurrency targets. Validate streaming, citation support, document parsers and rate limits. No production SLO or vendor data-processing guarantee follows from the local fixture.

Until these gates pass, use the system only for local development and controlled test corpora. Production `AUTH_MODE=development` is rejected, but authenticated startup alone does not mean the complete system is production ready.
