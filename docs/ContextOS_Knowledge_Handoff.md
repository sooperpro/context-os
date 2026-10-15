# ContextOS --- Product Context, Research & Build Handoff

**Document purpose:** A portable source of truth for AI agents, product
designers, engineers, researchers, and founders working on ContextOS.\
**Prepared:** 13 October 2026 (stack suggestions are historical: sign-in is our own Better Auth,
not Clerk; see [decisions.md](decisions.md))\
**Status:** Working brief --- combines prior discussion and proposed
implementation guidance. It is not a final technical specification.

> **How to use this file:** Treat the product vision and differentiation
> in Sections 1--4 as the current product hypothesis. Treat
> architecture, stack, roadmap, and feature suggestions as
> recommendations that must be validated during discovery. Competitor
> names are a research starting point, not a claim that every product
> has identical functionality or that the list is exhaustive.

---

## 1. Executive summary

**ContextOS** is an AI-powered organizational context and
project-onboarding platform. It connects to a company's existing tools
and knowledge sources, reconstructs how a project or product actually
works, and turns scattered organizational information into a structured,
navigable, evidence-backed understanding that a new employee---or an AI
agent---can use.

The problem is not simply that information is hard to search. Important
context is fragmented across documents, conversations, tickets, code,
meeting notes, and the knowledge held by individual employees. New hires
and teammates must piece together what the company is building, why
decisions were made, how the system evolved, who owns what, what is
currently true, and what remains unresolved. Traditional knowledge
transfer (KT) often depends on synchronous meetings and individual
memory, creating delays and repeated explanations.

ContextOS aims to move from **finding documents** to **reconstructing
context**.

### Core product thesis

> **RAG finds relevant information. ContextOS reconstructs the
> relationships, chronology, causality, evidence, decisions, and current
> state that make information understandable and actionable.**

This is the central product distinction discussed so far. ContextOS may
use retrieval-augmented generation (RAG) internally, but RAG alone is
not the product promise.

### Initial target use case

A company brings a new employee onto a project. Instead of asking
several teammates to provide fragmented KT, the company connects the
relevant systems and selects a project. ContextOS produces a structured
project knowledge hub, an onboarding path, an evidence-backed
question-answering experience, and a guided way to explore the project's
history and current state.

### Initial MVP recommendation

Build **one Project Knowledge Hub** first, rather than attempting to
become a universal company knowledge platform immediately.

Recommended first integrations from the prior discussion: - Slack ---
project conversations and discussions - Jira --- issues, delivery
status, dependencies, and project history - Google Drive --- documents,
specifications, plans, and meeting notes - GitHub --- repositories, pull
requests, code history, and technical decisions

The first experience should create a useful project overview from a
limited, explicitly selected set of sources. Expand integrations and
automation only after the product proves that its reconstructed context
is accurate and useful.

---

## 2. Problem definition

### What happens today

When a new employee joins a company or project, they may need to
understand: - The business problem and customer need - The product, its
users, and its workflows - The project's history and major milestones -
Why key decisions were made - What changed and why - System architecture
and technical constraints - Dependencies, integrations, and operational
processes - Who owns which area and who to ask for help - Current
status, known issues, risks, and unresolved questions - Where
authoritative information lives

This information is usually spread across multiple tools and formats. A
document may describe the intended behavior while a newer Slack
conversation explains an exception. A Jira ticket may be closed but a
follow-up discussion reveals that the underlying issue persists. A code
change may implement a decision that was never written into the main
documentation.

### Costs of the current approach

1.  **Slow time-to-productivity:** New joiners spend days or weeks
    collecting context before they can contribute confidently.
2.  **Repeated KT:** Experienced employees repeat the same explanations
    for each new joiner.
3.  **Knowledge silos:** Critical knowledge remains in the heads or
    private conversations of a few people.
4.  **Lost decision rationale:** Teams can find what was built but not
    why it was built that way.
5.  **Conflicting information:** Old documents, current tickets, and
    conversations can disagree.
6.  **Poor continuity:** Employees leaving or changing teams can take
    important context with them.
7.  **Weak AI-agent context:** Coding and work agents may retrieve
    isolated files without understanding project history, constraints,
    ownership, or decisions.
8.  **High interruption cost:** Teammates are interrupted to answer
    questions that could have been answered from existing evidence.

### The job to be done

"When I join a project---or when an AI agent is assigned work---I need
to understand the project's purpose, history, system, decisions, people,
and current state quickly, with evidence I can verify, so I can
contribute without repeatedly asking others to reconstruct the context."

### Primary user groups

**Initial users** - New employees joining a project - Engineers joining
an existing codebase - Product designers and product managers inheriting
a product area - Customer success, operations, and implementation team
members who need product context

**Potential later users** - Team leads preparing KT - Engineering
managers managing knowledge continuity - Product and program managers
coordinating dependencies - Internal support teams - AI coding agents
and other enterprise agents that need project-specific context -
Organizations managing multiple products or complex cross-functional
programs

The first launch should choose a narrow user group and validate its
highest-frequency onboarding tasks rather than trying to serve all
groups equally.

---

## 3. Product vision and differentiation

### Vision

Make organizational context understandable, accessible, and
reusable---so people and AI agents can become effective in a project
without depending entirely on repeated human knowledge transfer.

### What ContextOS is

- A context reconstruction and organizational memory layer over
  existing company tools
- A project-centric knowledge hub
- An onboarding and knowledge-transfer accelerator
- An evidence-backed interface for asking questions about a project
- A system for connecting decisions, events, artifacts, people, and
  current state

### What ContextOS is not (at least in the initial product)

- Merely another document search box
- A generic chatbot that answers without source evidence
- A replacement for Slack, Jira, GitHub, or Google Drive
- A new wiki that requires everyone to manually duplicate all existing
  information
- A video-generation product whose main value is producing attractive
  media
- An autonomous system that silently changes source-of-truth records

### Differentiation: search versus context reconstruction

---

Dimension Traditional search / ContextOS product
basic RAG experience ambition

---

Primary result Relevant documents or A coherent explanation
chunks of the project

Relationships Often left to the user Connects people,
to infer decisions, events,
artifacts, and systems

Chronology May return sources Reconstructs how the
without a reliable project evolved over
sequence time

Decision rationale Searches for Connects the decision
decision-related text to its evidence,
alternatives, owner,
and consequences when
available

Conflicting sources May surface multiple Flags conflicts, dates
snippets sources, and explains
confidence/authority

Current state Can mix old and current Distinguishes current
information status from historical
state

Onboarding User searches and Provides a structured,
assembles their own role-relevant learning
learning plan path

Traceability Citations may be Every important claim
present but fragmented should be traceable to
source artifacts

AI agents General retrieval A structured,
context permission-aware
project context package
for agents
-----------------------------------------------------------------------

These are intended product behaviors, not a claim that every competitor
lacks them. Competitor capabilities must be checked during ongoing
research.

### Product principles

1.  **Evidence before eloquence:** A plausible answer is not good enough
    if it cannot be traced to sources.
2.  **Context before chat:** Build the context model and structured hub
    before making a chatbot the centerpiece.
3.  **Source-aware truth:** Preserve source, author, timestamp, version,
    and permissions.
4.  **Temporal correctness:** Distinguish historical facts from current
    state.
5.  **Make uncertainty visible:** If evidence is missing or conflicting,
    say so.
6.  **Respect existing workflows:** Read from the tools people already
    use before asking them to maintain another knowledge base.
7.  **Human review for consequential synthesis:** Allow users to
    correct, confirm, and flag generated context.
8.  **Permission parity:** Never expose content to a user or agent if
    they could not access the source.
9.  **Useful for people and agents:** Design the underlying context
    model so it can support both human onboarding and machine-readable
    context.
10. **Measure outcomes:** Optimize for reduced time-to-understanding and
    faster contribution, not just query volume.

---

## 4. Core experience and output

### Suggested user journey

1.  **Create workspace** --- an organization sets up a secure workspace.
2.  **Connect sources** --- an administrator authorizes one or more
    supported tools.
3.  **Choose a project** --- the user selects repositories, channels,
    Jira projects, folders, or other scoped sources relevant to that
    project.
4.  **Ingest and index** --- the system synchronizes permitted source
    content and records provenance.
5.  **Extract context** --- the system identifies entities, events,
    decisions, ownership, dependencies, timelines, and status claims.
6.  **Build Project Knowledge Hub** --- the system generates an initial
    structured project profile with citations and confidence/coverage
    indicators.
7.  **Review and correct** --- a user can mark information as accurate,
    stale, incomplete, or disputed.
8.  **Onboard a person** --- the user chooses a role or goal and
    receives a sequenced learning path.
9.  **Ask questions** --- the user asks questions and receives an answer
    grounded in source evidence.
10. **Maintain freshness** --- source changes trigger incremental
    processing and relevant updates to the hub.

### Project Knowledge Hub: proposed sections

The MVP hub should make the following sections easy to scan and explore:

1.  **Project overview**
    - What the project is
    - The business problem it solves
    - Target users/customers
    - Desired outcomes and success measures
2.  **Business and product context**
    - Product capabilities
    - Core workflows and use cases
    - Important terminology
    - Known constraints
3.  **System / architecture overview**
    - Major services and components
    - Integrations and data flows
    - Repositories and technical documentation
    - Architecture decisions and caveats
4.  **Timeline and milestones**
    - Major events, releases, incidents, and changes
    - What changed, when, and why
5.  **Decision log**
    - Decision statement
    - Date and participants/owner, if known
    - Evidence and alternatives, if available
    - Rationale and consequences
    - Status: current, superseded, or disputed
6.  **People and ownership**
    - Team members, roles, and areas of ownership
    - Source-backed ownership rather than unsupported inference
7.  **Current state**
    - Active work
    - Recent changes
    - Known issues, blockers, risks, and open questions
    - Last updated / source freshness
8.  **Dependencies**
    - Internal components and teams
    - External services and integrations
    - Upstream/downstream relationships
9.  **Key resources**
    - Canonical documents, dashboards, tickets, repositories, and
      conversations
10. **Ask ContextOS** (working label; earlier discussion also used "Ask
    Atlas")
    - Evidence-backed Q&A with source links
11. **Role-based learning path**
    - Suggested order of topics and artifacts
    - Learning objectives
    - Checkpoints or comprehension questions
    - Links to primary sources

### Potential generated artifacts

The user originally described the system as generating structured KT
material in different formats, including **text, video, images,
visualizations, and mind maps**. These are part of the broader vision,
not all mandatory MVP deliverables.

Recommended order: - **MVP:** structured written project brief,
timeline, decision log, architecture/relationship visualization where
reliable, source-linked learning path, evidence-backed Q&A. - **Later:**
generated walkthroughs, narrated summaries, visual explainers, mind
maps, role-specific onboarding packs, and exportable KT material.

Do not prioritize video generation before the system can reliably
reconstruct the underlying facts.

---

## 5. MVP scope

### MVP objective

Prove that ContextOS can turn a bounded set of project sources into an
accurate, source-grounded, useful onboarding experience that reduces the
time required for a new joiner to understand a project.

### In scope for the first release

- One organization workspace with tenant isolation
- Authentication and basic roles
- A single project hub (with architecture that can support more)
- Initial source integrations: Google Drive, Slack, Jira, GitHub
- Explicit project/source scoping
- Ingestion, parsing, chunking, metadata extraction, and indexing
- Hybrid retrieval (keyword + semantic) as an implementation detail
- Context extraction for decisions, events, people, components,
  dependencies, and status claims
- Structured Project Knowledge Hub
- Source citations/links for generated claims
- Basic Ask ContextOS question-answering interface
- Role- or goal-based onboarding path, even if initially generated
  from templates
- Manual refresh / sync status and basic incremental synchronization
- Feedback controls for incorrect, outdated, or incomplete information
- Basic audit logging and permission enforcement

### Explicitly defer unless pilot evidence requires them

- Ten-plus integrations
- Fully autonomous updates to source systems
- General-purpose enterprise search across every department
- Advanced multi-agent orchestration
- Video generation and editing pipeline
- Complex visual graph exploration UI
- Sophisticated skills testing and employee certification
- Deep HRIS integration and employee lifecycle automation
- Broad analytics dashboards
- Complex billing and enterprise procurement workflows

### MVP success criteria (proposed)

These are suggested targets to validate with pilot customers, not
previously agreed commitments.

**Quality** - High proportion of key claims have working citations - Low
rate of unsupported or temporally incorrect claims in an audited
sample - Users can identify the source of a decision or status
statement - Users can flag and correct errors

**Onboarding outcome** - Reduced time for a new joiner to answer a
predefined set of project-understanding questions - Reduced number of
repeated basic KT questions to teammates - Higher self-reported
confidence in understanding the project - Faster completion of an
initial project task

**Adoption** - New joiners return to the hub after the first session -
Users follow learning paths and open linked source material - Team leads
trust the hub enough to use it in onboarding

A pilot should establish a baseline before setting hard numeric targets.

---

## 6. Context engine: recommended technical model

The context engine is the product's core intellectual and technical
layer. Do not treat it as "chunk documents, embed them, and prompt an
LLM."

### Processing pipeline

1.  **Connector ingestion**
    - Authorize access using official APIs and least-privilege scopes.
    - Fetch source objects and change metadata.
    - Maintain stable source identifiers and sync checkpoints.
2.  **Normalization**
    - Convert source objects into a common internal representation.
    - Preserve source type, author, timestamps, links,
      project/workspace scope, and access controls.
3.  **Content extraction**
    - Extract readable text from documents, tickets, messages, pull
      requests, and relevant metadata.
    - Preserve useful structural boundaries such as headings,
      comments, ticket history, and PR discussions.
4.  **Chunking and indexing**
    - Create retrieval-friendly chunks while preserving links to their
      parent objects.
    - Use keyword search and vector search where appropriate.
5.  **Entity extraction**
    - Identify projects, products, components, people, services,
      decisions, events, issues, milestones, dependencies, and
      terminology.
6.  **Event and decision extraction**
    - Detect statements that describe a change, a decision, an
      incident, a release, a blocker, or a commitment.
    - Store the evidence and extraction confidence; do not treat an
      LLM extraction as ground truth by itself.
7.  **Relationship construction**
    - Connect entities and events using typed relationships and
      evidence.
8.  **Temporal reconciliation**
    - Track when a statement was made, the time period it refers to,
      and whether it is current, superseded, or disputed.
9.  **Context synthesis**
    - Generate hub sections and explanations from retrieved evidence
      and structured relationships.
10. **Evaluation and feedback**
    - Run quality checks, capture user feedback, and reprocess
      corrected or changed source objects.

### Context graph / data model (proposed)

A graph does not necessarily require a graph database in the MVP. Start
with relational tables and typed relationship records in PostgreSQL; add
a graph database only if actual query patterns justify it.

Potential entities: - `Organization` - `Workspace` - `Project` -
`Person` - `Team` - `Product` - `Service` / `Component` - `Repository` -
`Document` - `Conversation` / `Message` - `Ticket` / `Issue` -
`PullRequest` - `Decision` - `Event` - `Milestone` - `Incident` -
`Dependency` - `Question` - `LearningPath` / `LearningItem`

Potential relationship types: - `OWNS` - `CONTRIBUTES_TO` -
`DEPENDS_ON` - `IMPLEMENTS` - `DOCUMENTS` - `DISCUSSED_IN` -
`DECIDED_IN` - `SUPERSEDES` - `BLOCKS` - `RELATED_TO` - `AFFECTS` -
`OCCURRED_BEFORE` - `HAS_EVIDENCE` - `ASSIGNED_TO`

Every derived entity or relationship should preserve: - Source object
IDs and URLs - Evidence spans or references - Source author/actor when
available - Source creation and modification timestamps - Ingestion
timestamp - Extraction method/model version - Confidence or verification
state - Permission/visibility metadata - Temporal validity (when the
fact applies) - Current status: verified, inferred, stale, disputed, or
superseded

### Temporal context is essential

Avoid one undifferentiated "fact" field. Store the distinction
between: - **Source time:** when the source object or message was
created/updated - **Event time:** when the described event happened -
**Valid time:** the period during which a statement is true -
**Ingestion time:** when ContextOS learned about it

Example: an old project plan says a service uses architecture A, but a
later ADR and merged PR establish architecture B. The hub should
identify B as the current state while retaining A as historical context
and explaining the evidence for the transition.

### Handling conflicts

When sources disagree: 1. Retrieve the conflicting claims and their
provenance. 2. Compare recency, source type, explicit authority, and
corroborating evidence. 3. Avoid silently resolving a conflict based
only on the latest timestamp. 4. Label the result as conflicting or
uncertain when the evidence does not support a confident resolution. 5.
Let an authorized user confirm or correct the canonical status. 6.
Preserve the resolution and the sources behind it.

A source hierarchy may be configured per organization/project. For
example, a designated architecture decision record may be authoritative
for architecture decisions, while Jira may be authoritative for delivery
status. This should be configurable, not a universal assumption.

---

## 7. Architecture proposal

### Logical architecture

```text
                    ┌─────────────────────────┐
                    │ Web app / Project Hub   │
                    │ Onboarding + Ask UI      │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │ API / Application Layer │
                    │ Auth, projects, Q&A     │
                    └──────┬──────────┬───────┘
                           │          │
               ┌───────────▼───┐  ┌───▼────────────────┐
               │ Context Engine│  │ Permissions / Audit│
               │ retrieval,    │  │ tenant & source ACLs│
               │ graph, synth. │  └────────────────────┘
               └──────┬────────┘
                      │
          ┌───────────▼────────────────────┐
          │ Storage & Indexing             │
          │ PostgreSQL + pgvector          │
          │ object storage; optional cache │
          └───────────┬────────────────────┘
                      │
             ┌────────▼─────────┐
             │ Ingestion workers│
             │ parse, normalize,│
             │ extract, index   │
             └────────┬─────────┘
                      │
        ┌─────────────┼─────────────────────────┐
        │             │            │            │
      Slack          Jira       Drive         GitHub
```

This is a logical sketch, not a deployment diagram. Use asynchronous
jobs for ingestion and expensive extraction. Keep user-facing APIs
responsive and make sync state visible.

### Suggested stack from the prior discussion

---

Layer Initial recommendation Why

---

Web app Next.js, React, Fast product UI
TypeScript development and mature
ecosystem

API / backend Python + FastAPI Strong AI/data
ecosystem and clear API
contracts

Primary database PostgreSQL Relational data,
tenancy, metadata,
entities, relationships

Vector search pgvector initially Avoid adding a separate
vector service before
scale requires it

Background jobs Redis + Celery (or an Ingestion, extraction,
equivalent queue/worker retries, scheduled sync
setup)

File/object storage S3-compatible object Raw exports or
storage normalized artifacts
where needed

Authentication Clerk was suggested as Fast implementation;
a possible starting reassess enterprise SSO
point and access-control
needs

LLM OpenAI API was Summarization,
suggested extraction, synthesis,
and Q&A; select models
by evaluation and cost

Integrations Official Slack, Jira, Authorized access to
Google Drive, GitHub existing systems
APIs

Observability Add structured logs, Required to debug sync
traces, job metrics, and answer quality
and LLM evaluation
-----------------------------------------------------------------------

This stack is a starting proposal, not a locked decision. Before
implementation, validate API quotas, OAuth/review requirements, hosting
constraints, data residency, cost, and enterprise security requirements.

### Architectural rules

- Multi-tenant isolation must be enforced at the data-access layer,
  not just in the UI.
- Source permissions must be preserved during ingestion, retrieval,
  answer generation, and caching.
- Use official APIs and respect rate limits, scopes, and terms.
- Make ingestion idempotent and retry-safe.
- Store connector cursors/checkpoints and support incremental sync.
- Separate raw source records, normalized records, extracted context,
  and generated presentation content.
- Version prompts, extraction logic, models, and context snapshots to
  support debugging.
- Store citations as structured references, not only as URLs inserted
  into prose.
- Avoid relying on an LLM for authorization decisions.
- Support deletion and re-indexing when a source is removed or access
  is revoked.
- Never send cross-tenant content into a retrieval or generation
  request.
- Build an evaluation set before tuning prompts repeatedly.

---

## 8. Integrations and APIs

### Initial integrations

**Google Drive** - Use the official Google Drive API and OAuth. - Start
with explicitly selected folders or files rather than broad access to
every drive. - Capture file IDs, names, MIME types, owners where
available, timestamps, links, and permission metadata. - Handle Google
Docs exports and file updates/deletions.

**Slack** - Use Slack's official APIs and OAuth app scopes. - Begin with
selected channels or a project-specific scope. - Capture message text,
thread replies, timestamps, users, channel IDs, and links. - Respect
private-channel membership and user access. Do not assume all workspace
messages are visible to every user.

**Jira** - Use Jira Cloud REST APIs (or the appropriate official API for
the customer's deployment). - Capture issue fields, comments, status
history where available, links, projects, assignees, and timestamps. -
Preserve issue keys and canonical URLs. - Treat current status and
historical status transitions as distinct data.

**GitHub** - Use GitHub App or OAuth-based authorization, selected
repositories, and official APIs. - Capture repository metadata,
README/docs, pull requests, review comments, commit metadata, issues,
and relevant file paths. - Begin with metadata and text/code references;
avoid embedding every line of every repository indiscriminately. -
Preserve repository permissions and private-repository access rules.

### API and vendor-cost guidance

No final paid API/vendor purchasing decision has been made. Most source
integrations should begin with official APIs, subject to the customer's
plans, admin approval, scopes, rate limits, and vendor policies. The
likely recurring variable costs are: - LLM calls for extraction,
synthesis, and question answering - Embedding generation - Hosting,
database, queue, and object storage - Observability and evaluation
services if paid products are selected

Use a model-routing strategy only after measuring quality and cost.
Cache safe, permission-scoped results; avoid caching answers in a way
that can leak information between users. Batch processing and
incremental updates should keep costs manageable.

Before building each connector, confirm: - OAuth app registration and
approval requirements - Minimum scopes and admin consent - API rate
limits and pagination - Webhook/event availability - Backfill and
incremental-sync strategy - Deletion and permission-revocation
behavior - Vendor terms and data-processing requirements

---

## 9. Retrieval and answer generation

### Recommended answer pipeline

1.  Authenticate the user and resolve organization/project scope.
2.  Apply permissions before retrieving any source content.
3.  Parse the question into intent and required context (e.g. current
    state, decision history, owner, architecture).
4.  Retrieve candidate evidence using keyword search, semantic search,
    and structured filters.
5.  Expand context through relationships when useful---for example, a
    decision linked to a ticket, PR, discussion, and architecture
    document.
6.  Re-rank evidence for relevance, recency, authority, and diversity.
7.  Reconcile temporal claims and identify conflicts.
8.  Generate an answer that separates confirmed facts, reasonable
    inferences, and unknowns.
9.  Attach citations to the claims they support.
10. If evidence is inadequate, ask a clarifying question or explicitly
    state that the sources do not establish the answer.

### Answer contract

Each response should ideally include: - Direct answer - Why / rationale
when evidence supports it - Relevant timeline or decision context -
Current status, including as-of date when useful - Source
links/citations - Uncertainty or conflicts - Suggested next
source/person only when supported by evidence

### Quality failure modes to test

- Hallucinated decisions or owners
- Confusing a proposal with an approved decision
- Treating an old status as current
- Missing thread replies or comments that reverse the apparent meaning
- Ignoring a source that contradicts the generated summary
- Citation points to a document that does not actually support the
  claim
- Answer leaks information from a private channel or restricted
  repository
- Summary loses critical caveats or exceptions
- Stale cached answer after source permissions change
- Incorrect attribution of a decision to a person

---

## 10. Competitor and adjacent-solution landscape

**Research context:** On 13 October 2026, the competitor discussion
framed ContextOS as an AI organizational-memory/onboarding platform that
ingests tools such as Drive, Slack, Jira, GitHub, and meeting notes;
reconstructs project history, architecture, decisions, dependencies,
people, and current state; then supports personalized learning paths and
evidence-backed Q&A.

The list below records the competitor names surfaced in our discussion.
It is a landscape map, not a fully validated feature-by-feature
competitive audit. Products evolve quickly; verify current features,
pricing, connectors, security, and target segments before making
external claims.

### A. Enterprise search and AI knowledge access

- **Glean** --- enterprise search and AI workplace knowledge access
- **Coveo** --- enterprise search/relevance and AI-powered discovery
- **Dashworks** --- workplace search/AI assistant category
- **Elastic** --- search platform that can be used to build enterprise
  search experiences
- **Microsoft 365 Copilot** --- AI assistance across Microsoft 365
  content and workflows
- **Cohere** --- enterprise AI models/platform capabilities relevant
  to enterprise retrieval and assistants
- **Atlassian Rovo** --- search, AI assistance, and agents across
  Atlassian and connected knowledge

**Competitive question:** Do these tools only retrieve and summarize
relevant sources for a given workflow, or can they reliably produce a
persistent, temporally accurate, project-specific model of how the work
evolved? Validate per product; do not assume a blanket gap.

### B. Team knowledge bases and internal wikis

- **Slite**
- **Guru**
- **Notion**
- **Confluence**
- **Tettra**
- **Slab**
- **Nuclino**
- **Coda**
- **SharePoint**
- **Document360**
- **Bloomfire**
- **Stack Overflow for Teams**

These products are relevant because they organize institutional
knowledge, support internal Q&A, or provide AI-assisted access to
documentation. ContextOS's proposed angle is to synthesize context from
operational traces and existing tools, rather than depending mainly on
manually curated pages.

### C. Engineering knowledge, code understanding, and developer onboarding

- **Unblocked** --- developer context/answers from connected
  engineering tools
- **Swimm** --- code documentation and developer onboarding
- **Cortex** --- internal developer portal / service catalog and
  engineering standards
- **CodeSee** --- codebase mapping and code understanding
- **Sourcegraph** --- code search and code intelligence
- **GitHub Copilot** --- AI coding assistance, with repository/context
  features evolving over time
- **Backstage** --- open platform for building developer portals and
  service catalogs

These are especially relevant to the engineering-onboarding wedge. They
may already solve parts of code discovery, service ownership,
documentation, and developer Q&A. The competitive audit should
investigate how deeply they reconstruct cross-tool project history and
decision rationale, not merely compare feature names.

### D. Training, employee onboarding, and enablement

- **Trainual** --- process documentation and employee
  training/onboarding
- **WorkRamp** --- learning and enablement
- **360Learning** --- learning management and collaborative learning
- **Docebo** --- learning management
- **Rippling** --- HR/IT/employee lifecycle workflows, including
  onboarding-related capabilities

These products may own onboarding workflows, training content,
checklists, or employee lifecycle processes. ContextOS should
investigate whether to integrate with these systems later rather than
rebuilding full LMS/HR functionality in the MVP.

### E. Documentation capture and process explanation

- **Scribe** --- step-by-step process documentation
- **Tango** --- workflow capture and how-to documentation
- **Guidde** --- video-based process documentation and walkthroughs

These are relevant to the broader idea of generating onboarding
artifacts and visual/video explanations, but their primary workflow may
differ from reconstructing organizational context from many source
systems.

### F. Initial competitor shortlist to investigate first

The following were explicitly surfaced as a shortlist in the prior
discussion: 1. Glean 2. Unblocked 3. Slite 4. Guru 5. Atlassian Rovo 6.
Swimm 7. Notion 8. Dashworks 9. Trainual 10. Cortex 11. Confluence 12.
Scribe

### Competitive research framework

For each competitor, assess: - Primary buyer and end user - Main
job-to-be-done - Supported source connectors - Whether it ingests
messages, tickets, code, docs, meetings, and history - Whether it
maintains a persistent knowledge/context model or primarily performs
query-time retrieval - Decision history and rationale reconstruction -
Timeline and event reconstruction - Current-state detection and
stale/conflicting source handling - Source citations and claim-level
traceability - Role-based onboarding or learning paths - Human
correction and knowledge governance - AI-agent / API / MCP support where
relevant - Permission mirroring, auditability, SSO, and enterprise
controls - Pricing and packaging - Deployment and data residency
options - Strengths, weaknesses, and likely switching barriers

**Important research discipline:** Do not claim "no competitor does
this" without testing the product and checking current documentation.
ContextOS can differentiate through a sharper workflow and measurable
outcome even where competitors overlap.

### Working positioning hypothesis

**Category:** AI-powered project context and organizational memory for
onboarding people and agents.

**Possible positioning statement:** "ContextOS turns scattered project
knowledge into a connected, evidence-backed understanding of what a team
is building, why it works the way it does, and what is true now---so
people and AI agents can contribute faster."

This is a hypothesis to test with users, not final marketing copy.

---

## 11. Suggested implementation plan

The earlier discussion recommended a phased path through connector
proofs of concept, context extraction, hybrid retrieval, hub/UI, and a
12-week pilot. The outline below operationalizes that direction. Timing
is indicative and should be adjusted to team size and API constraints.

### Phase 0 --- Product discovery and success definition

**Tasks** - Interview 5--10 people who recently joined an existing
project and 5--10 team leads who onboard others. - Ask them to
reconstruct a recent project decision, system architecture, and current
status using their existing tools. - Identify the most painful and
frequent context questions. - Pick one initial persona (recommended:
engineer joining an existing project, or a cross-functional product team
member). - Define a baseline onboarding task and time-to-understanding
measurement. - Choose a pilot project with reasonably accessible and
representative source data.

**Deliverables** - Problem statement and target persona - Top 20
onboarding questions - Source-system inventory - Baseline evaluation
task - Pilot success metrics - Data/security assumptions

### Phase 1 --- Connector proof of concept

**Tasks** - Register developer apps and validate OAuth scopes for Drive,
Slack, Jira, and GitHub. - Connect to one test workspace/project. -
Fetch a bounded sample of documents, messages, issues, PRs, and
metadata. - Preserve canonical links, timestamps, permissions, and
stable IDs. - Implement pagination, retries, sync cursors, and deletion
handling.

**Exit criterion:** The team can reliably ingest a scoped project corpus
without losing provenance or violating source access boundaries.

### Phase 2 --- Normalized data and context extraction

**Tasks** - Define the normalized source-object schema. - Implement
parsers and chunking. - Create relational tables for projects, source
objects, chunks, people, events, decisions, entities, and
relationships. - Extract initial project summary, key milestones,
decisions, ownership, dependencies, and current-state claims. - Attach
evidence and confidence to each extraction. - Create a human-reviewed
test dataset.

**Exit criterion:** The system can generate a structured context model
from a bounded source set, and reviewers can verify each important
claim.

### Phase 3 --- Retrieval and evidence-backed Q&A

**Tasks** - Add keyword and vector retrieval. - Filter by tenant,
project, and source permissions. - Retrieve connected evidence for
decision-history and current-state questions. - Add citation-aware
answer generation. - Build an evaluation set of representative questions
with expected evidence. - Test conflicting and stale-source cases.

**Exit criterion:** Answers are useful, appropriately cautious, and
traceable to the correct sources.

### Phase 4 --- Project Hub and onboarding UX

**Tasks** - Build the project overview and the proposed hub sections. -
Display last sync, source coverage, and unresolved conflicts. - Add
role/goal-based learning paths. - Add Ask ContextOS and source-linked
answers. - Add feedback controls and lightweight correction workflow. -
Test the experience with users unfamiliar with the project.

**Exit criterion:** A new joiner can complete the pilot's
project-understanding task using the hub with less effort than the
baseline.

### Phase 5 --- Pilot, evaluation, and iteration

**Tasks** - Pilot with one team and one project. - Compare onboarding
time and task accuracy against baseline. - Audit generated claims and
citations. - Record user trust, confusing sections, and missing
context. - Prioritize failure modes by impact. - Decide whether to
deepen the initial integrations or add another connector.

**Exit criterion:** Evidence that ContextOS reduces
time-to-understanding without unacceptable factual, permission, or trust
failures.

### Suggested 12-week sequence

---

Weeks Focus Expected outcome

---

1--2 Discovery, persona, question Validated narrow use
set, security assumptions case

3--4 Connector POCs and source Scoped corpus ingestion
normalization

5--6 Extraction, First context model
entities/events/decisions,  
provenance

7--8 Retrieval, citations, Evidence-backed Q&A
conflict handling,  
evaluation

9--10 Project hub and learning End-to-end MVP
path experience

11--12 Pilot, quality audit, Go/no-go evidence and
iteration next roadmap
----------------------------------------------------------------------------

This schedule is a planning hypothesis; integration approval and data
access can affect timing.

---

## 12. UX and product design considerations

### The product should make context legible

Avoid presenting a wall of AI-generated prose. Organize the hub around
questions new joiners actually ask: - What is this project? - Why does
it exist? - How does it work? - What changed recently? - Why was this
decision made? - What is true now? - What is blocked or uncertain? - Who
owns this area? - What should I read or do first?

### Suggested interface patterns

- **Project overview cards:** purpose, status, team, systems, and last
  updated.
- **Timeline:** milestone/event list with dates and links to the
  underlying evidence.
- **Decision cards:** decision, rationale, date, status, and
  supporting sources.
- **Architecture map:** components and relationships, but only when
  evidence supports the links.
- **Ownership directory:** people and areas, with evidence or explicit
  confirmation.
- **Current-state panel:** active work, blockers, risks, and
  unresolved conflicts.
- **Source drawer:** open the underlying source from any important
  claim.
- **Learning path:** sequenced topics, estimated effort where
  supportable, and completion/checkpoint states.
- **Ask interface:** direct answers plus citations, timeline context,
  and uncertainty.
- **Feedback affordances:** "Correct," "Outdated," "Missing context,"
  and "Conflicting sources."

### Design rules

- Clearly distinguish **confirmed**, **inferred**, **stale**, and
  **disputed** context.
- Show dates and source freshness when they change interpretation.
- Make source links easy to inspect.
- Do not use confidence percentages unless calibrated and meaningful.
- Explain why a learning item is recommended.
- Keep generated media secondary to verifiable content.
- Provide a path from every synthesis to the original evidence.
- Make empty states honest: "Not enough source evidence yet" is better
  than invented content.

---

## 13. Security, privacy, and governance

Because ContextOS connects to internal business systems, security and
permissions are core product requirements, not a later enterprise
add-on.

### Minimum requirements

- Tenant isolation at every layer
- OAuth and least-privilege scopes
- Permission-aware ingestion and retrieval
- Access checks at query time, including cached and generated content
- Secure token storage and rotation
- Audit logs for connector authorization, access, sync, and
  administrative actions
- Data deletion and re-indexing workflows
- Clear data retention and source deletion policies
- Encryption in transit and at rest
- Separation of customer data and model/provider processing
- Clear controls over whether customer content is used for model
  training
- Prompt-injection defenses for untrusted source content
- Protection against cross-tenant retrieval and cache leakage
- Administrative controls for projects, sources, and user access
- Enterprise SSO/SCIM needs assessed with pilot customers

### Important threat scenarios

- A user asks a question about a source they cannot access.
- A public or low-trust document contains instructions that try to
  manipulate the model.
- A user loses access to a Slack channel but previously generated
  summaries remain accessible.
- A connector token is revoked but old indexed data is still
  queryable.
- A cached answer includes restricted evidence.
- A generated relationship attributes a sensitive decision to the
  wrong person.
- Content from one customer appears in another customer's retrieval
  context.

The system should never rely on the language model alone to enforce
access control.

---

## 14. Evaluation plan

Create a repeatable evaluation dataset early. Every iteration should be
tested against it.

### Question categories

1.  **Project purpose:** What problem are we solving and for whom?
2.  **Architecture:** Which components participate in a workflow?
3.  **Decision history:** Why did the team choose a specific approach?
4.  **Timeline:** What changed before/after an event?
5.  **Current state:** What is active, blocked, shipped, or superseded?
6.  **Ownership:** Who is responsible for a component or workflow?
7.  **Dependencies:** What depends on this service or project?
8.  **Conflict:** Two sources disagree---does the system expose the
    conflict?
9.  **Missing evidence:** Does the system admit it cannot answer?
10. **Permissions:** Can it refuse or omit restricted source content
    correctly?

### Metrics to consider

- Claim-level citation precision
- Answer correctness judged against source evidence
- Temporal correctness
- Conflict detection rate
- Unsupported-claim rate
- Permission violation rate (target: zero)
- Retrieval recall for known relevant evidence
- Source freshness and sync lag
- Time to generate/refresh a hub
- User task completion time
- New-joiner confidence and perceived trust
- Number of repeated basic KT questions

Do not optimize only for a generic LLM "answer quality" score. A
polished answer with wrong chronology or missing permissions is a
serious failure.

---

## 15. Risks and mitigations

---

Risk Why it matters Mitigation

---

Context extraction is The product's core Evidence-linked
inaccurate promise is undermined extraction, human
review, evaluation set

Sources contradict each Users may lose trust if Temporal model,
other the system invents conflict labels,
certainty configurable source
authority

Integrations take OAuth/admin approval Validate APIs in Phase
longer than expected can block progress 1; start with a narrow
source scope

Too much scope in MVP Many connectors and One project hub;
media outputs can delay prioritize text,
validation evidence, timeline,
decisions, Q&A

Source permissions leak Potentially severe Permission-aware
customer/security architecture, tests,
incident audit logs, cache
isolation

LLM costs grow quickly Frequent reprocessing Incremental sync, batch
can be expensive extraction, caching,
model
evaluation/routing

Competitors overlap Weak differentiation Test workflows
more than expected directly; focus on
context quality and
onboarding outcomes

Users do not trust Adoption stalls Visible provenance,
generated context uncertainty, correction
flow, human
confirmation

Knowledge is stale Hub becomes misleading Sync indicators,
freshness timestamps,
incremental processing

Context graph becomes Delays product learning Start with relational
overengineered entities and
relationships; add
graph infrastructure
only if needed
-----------------------------------------------------------------------

---

## 16. Open questions requiring decisions

These were not conclusively resolved in the prior discussion and should
be handled deliberately:

### Product

- Which first persona is the beachhead: software engineer, product
  designer/PM, or cross-functional new joiner?
- Is the first paid buyer an engineering manager, Head of Product,
  People/HR, or CTO?
- Is the primary wedge engineering onboarding, general project
  onboarding, or AI-agent context?
- Is the initial output a persistent knowledge hub, an onboarding
  pack, or both?
- What measurable onboarding task will prove value?

### Scope

- Which connector is most valuable and easiest to authorize for the
  first pilot?
- Should all four suggested connectors be included in the first pilot,
  or should the team start with two?
- Should source content be ingested only for explicitly selected
  projects/folders/channels?
- Which generated artifacts are essential at launch?

### Technical

- Which hosting and deployment environment is required?
- What are the data residency and retention requirements?
- Is PostgreSQL + pgvector sufficient for the expected pilot?
- Which model(s) pass the evaluation set at an acceptable cost?
- What source-of-truth hierarchy can customers configure?
- How should permissions be represented across systems with different
  ACL models?

### Business

- What is the first customer segment and company size?
- What is the strongest willingness-to-pay driver: shorter onboarding,
  reduced interruptions, lower knowledge-loss risk, or agent
  productivity?
- Should pricing be per seat, per workspace, per indexed
  source/volume, or a hybrid?
- What integrations are table stakes for the target segment?

### Competitive research

- Which competitors have persistent context/graph features versus
  query-time retrieval?
- How good are competitors at decision history, temporal correctness,
  and conflicting-source reconciliation?
- What onboarding workflows do they support natively?
- What APIs, agent interfaces, and permission controls do they expose?
- What are current pricing and enterprise requirements?

---

## 17. Recommended next actions

Prioritize these in order:

1.  **Lock a narrow pilot persona and workflow.** Avoid building for
    every employee type.
2.  **Define 20--30 real onboarding questions** and the source evidence
    required to answer them.
3.  **Create a source-of-truth map** for the pilot project: which tools
    contain decisions, status, architecture, ownership, and historical
    discussion.
4.  **Build a connector spike** for the easiest two sources, then
    validate the remaining connectors.
5.  **Design the normalized schema and provenance model** before
    building a large RAG pipeline.
6.  **Create an evaluation dataset** that includes conflicts, stale
    content, and restricted sources.
7.  **Generate the first structured project hub** with citations and
    clear unknowns.
8.  **Add Ask ContextOS** once retrieval and evidence links work
    reliably.
9.  **Run a before/after onboarding pilot** and measure actual task
    performance.
10. **Complete a feature-level competitor matrix** with current vendor
    documentation and hands-on testing.

### Definition of "first useful demo"

A credible demo should be able to: - Connect a bounded project corpus
from at least two source systems. - Explain what the project does and
why it exists. - Show a short timeline of key events. - Identify several
important decisions and link to evidence. - Describe current work and
clearly indicate uncertainty where status is ambiguous. - Answer a
handful of real onboarding questions with citations. - Demonstrate that
the current user's permissions constrain the answer. - Produce a short,
role-relevant learning path.

This is a stronger demo than a chatbot that answers a few generic
questions from uploaded documents.

---

## 18. Instructions for AI agents working on ContextOS

Use these rules when continuing the project in another AI agent or
coding environment:

1.  **Read this document first** and summarize the current product
    thesis before proposing a build.
2.  **Separate facts from hypotheses.** Do not turn a suggestion in this
    document into a confirmed product decision without explicit
    approval.
3.  **Preserve the central differentiation:** ContextOS reconstructs
    connected, temporal, evidence-backed project context; it is not
    merely another RAG chatbot.
4.  **Do not expand MVP scope casually.** Default to one project hub,
    scoped integrations, citations, timeline, decisions, current state,
    and basic Q&A.
5.  **Do not fabricate research.** Verify current vendor features, APIs,
    limits, prices, and claims with primary sources.
6.  **Use official APIs** and validate OAuth scopes, rate limits, access
    control, and deletion behavior before committing to connector
    architecture.
7.  **Make every important generated claim traceable** to source
    evidence.
8.  **Treat permission enforcement as a hard requirement.**
9.  **Design for temporal context and conflicting sources** from the
    beginning.
10. **Evaluate before optimizing.** Build test questions and expected
    evidence before tuning prompts or choosing models.
11. **Prefer the simplest architecture that supports the product
    thesis.** Start with PostgreSQL and pgvector unless evidence
    justifies additional infrastructure.
12. **Record decisions.** For every material decision, document options,
    rationale, trade-offs, owner, date, and what would trigger
    revisiting it.
13. **When information is missing, state the gap and ask a focused
    question** rather than inventing an answer.
14. **Keep a living changelog** of validated assumptions, rejected
    ideas, architecture decisions, pilot findings, and next steps.

### Suggested first prompt for a new agent

> You are helping build ContextOS, an AI-powered project context and
> onboarding platform. Read the full ContextOS handoff document before
> acting. First return: (1) your understanding of the problem and core
> differentiation, (2) the MVP scope you believe is justified, (3) the
> key assumptions and unresolved decisions, (4) a proposed technical
> architecture with explicit trade-offs, and (5) the first two-week
> implementation backlog. Do not start coding or expand scope until you
> identify the riskiest assumptions. Keep every recommendation
> consistent with source provenance, temporal correctness, permission
> enforcement, and evidence-backed answers. Distinguish confirmed
> context from hypotheses and validate external vendor/API claims with
> current primary sources.

---

## 19. Provenance and document limitations

This handoff consolidates the ContextOS concept and earlier discussion
available in the conversation context, including: - The original concept
discussion dated 1 October 2026 - The product distinction between
document retrieval and context reconstruction - The proposed Project
Knowledge Hub MVP, integrations, stack, context graph, and phased
pilot - The competitor landscape discussed on 13 October 2026

It does **not** contain a verbatim transcript of every prior message.
Some technical details are reconstructed into a cohesive plan for reuse.
Competitor descriptions are intentionally high-level and need current
verification before they are used in investor materials, sales claims,
or product positioning. The 12-week plan, success measures, schema, and
security checklist are recommendations, not commitments previously
approved by the user.

**Core idea to preserve:** ContextOS should help a person or AI agent
understand not only _what information exists_, but **how the project got
here, why decisions were made, how its parts connect, what is true now,
and where the evidence lives**.
