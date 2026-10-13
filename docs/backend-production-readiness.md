# Backend production readiness and PRD coverage

Updated: 13 October 2026. **Status: not ready for production or complete against the PRD.** The implementation adds real backend workflows and security controls, but a passing local test suite does not demonstrate the PRD's production requirements.

## Confirmed release scope

The owner selected **Phase 1 first, subsequent phases later**. Production Clerk and Google projects do not exist yet and will be configured later. Local development and mocked provider tests can proceed; live authentication/provider acceptance and production deployment remain unverified.

Phase 1 remains **in progress**, including these backend exit requirements:

- `WS`: verified-domain joins, CSV/bulk invitations, source identity linking, complete setup flow and knowledge-continuity/offboarding handling.
- `INT`: complete Drive ingestion/sync/ACL lifecycle plus Slack and Jira connectors. GitHub is optional per workspace, but its connector is absent. Durable backfill, webhooks, cursors, exclusions and permission/deletion sync are not implemented.
- `CTX/HUB/ASK`: atomic temporal claim/edge model, full ten-section hub contract, alternative-evidence permission rendering, complete claim-level Answer Contract, conversation memory/multi-project scope and measured token streaming.
- `KM/LRN/CHK/PRB/MEN`: full maintenance routing/correction workflows, genuine automatic path/quiz generation and supported question types, connector-event checkpoints, primary-mentor lifecycle/credit, scheduled milestones and stuck/sign-off nudges.
- `GAM/NTF/SRCH/ADM/MSC`: badges and full anti-gaming, notification consumers/email/quiet hours, global permission-filtered semantic search, governance/export/deletion/policies, companion producers/escalation and frontend widget.
- Security/operations: production data-store/infrastructure decisions, encrypted storage and key rotation, observability, backup/restore/deletion, provider outage handling, permission/AI evaluation gates and load/SLO verification.

Phase 1.5 rewards/kudos/bounties/leaderboards/billing/extension and analytics; Phase 2 EPM/reviews/SCIM; Phase 3 agent/MCP/media/desktop and extra connectors are **deferred**, not current Phase 1 release requirements. Some backend check-in/outcome/preferences foundations already exist from the initial broader request; they do not mean later phases are complete.

## Implemented in this extension

- Clerk backend session verification and current organization membership checks; explicit application roles, membership lifecycle/guest expiry, supported assignments and organization invitations.
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

## Local verification result

On 13 October 2026, using Node 24:

- Backend: **62 tests passed**, including legacy database upgrade/idempotence, access/provenance regression, workflow state and mocked Google provider contracts.
- Shared contracts: **4 tests passed**. Frontend compatibility: **5 tests passed**; frontend authentication/UI features are not implemented by these changes.
- API/shared lint and type checks, frontend type check, API production build and formatting checks passed.
- Bruno CLI 4.2.1: **117 requests: 82 passed, 35 skipped; 82/82 executed tests passed**, against an isolated in-memory HTTP fixture with fake Gemini, not the user's development database.

Skipped requests require provider configuration, separate user sessions, supplied workflow resources or explicit mutation opt-ins. They are not verified successes. Live Clerk/Google acceptance, real Gemini answer quality and production SLOs remain unverified. Test fixtures ignore real Clerk/Google secrets unless synthetic Google test configuration is explicitly supplied.

## Full-PRD backlog inventory (includes deferred phases)

| PRD area               | Remaining implementation/verification                                                                                                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WS / §6                | Frontend workspace wizard/Clerk login, domain verification/auto-join, CSV invites and org imports, identity-link review, section/topic/team/department assignment scopes, complete role/action matrix, indirect-report policy enforcement, SSO/SCIM phases and offboarding continuity.             |
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

1. Configure a production Clerk application, Organizations, frontend token acquisition and allowed origins. Test genuine signed-in/out, expired tokens, organization switching and membership removal. The frontend auth UI is not added by this backend implementation.
2. Configure and obtain approval for Google OAuth scopes. Test consent denial, partial scopes, refresh/reconnect, separate reader identities, shared-drive permissions, revocation and deletion using real accounts. Validate provider requirements against current official documentation.
3. Migrate the legacy default workspace and its access grants deliberately. New Clerk organizations do not automatically inherit local prototype data. Review the privacy-changing migrations on a backup before deployment.
4. Complete the required modules above and run the PRD acceptance/permission/evaluation suites. Audit triggers protect new writes; old audit entries lack integrity hashes and are not retroactively certified.
5. Supply encrypted database/storage, secret management/rotation, TLS, backup/restore, observability and deployment infrastructure. Exercise rollbacks and worker recovery. Outbox records currently have no dispatch consumer.
6. Benchmark real model/provider behavior and corpus/concurrency targets. Validate streaming, citation support, document parsers and rate limits. No production SLO or vendor data-processing guarantee follows from the local fixture.

Until these gates pass, use the system only for local development and controlled test corpora. Production `AUTH_MODE=development` is rejected, but authenticated startup alone does not mean the complete system is production ready.
