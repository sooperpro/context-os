# ContextOS: Role, Page and Data Access Spec

**What this is:** for each role, which pages they get, what they can do on each page, and which data they can see or change. Use it to implement role-based features and backend permission checks.

**Sources:** the clickable prototype (`Context OS/`, as of Oct 14, 2026), `ContextOS_Dashboard_Information_Architecture.docx`, `Dashboard Pages.docx` and `ContextOS_PRD.md`. Where these disagree, the prototype's behavior is written in the spec and the disagreement is listed in [section 8](#8-decisions-to-confirm).

**Legend for data scope:**

| Scope | Meaning |
|---|---|
| **Own** | Only the signed-in person's own records |
| **Team** | The manager's direct reports only |
| **Org** | Everyone in the workspace |
| **Shared** | Visible to all members, filtered by source permissions |
| **None** | No access. The API must refuse, not just hide the button |

---

## 1. Roles

Each user has exactly one role per workspace (see [decision 9](#8-decisions-to-confirm)).

| Role | Who | Main job in ContextOS |
|---|---|---|
| **Employee** | Any member, including new hires | Follow their onboarding roadmap, learn, find knowledge, ask Context Bot |
| **Manager** | People managers | Track and support their own team's onboarding, run check-ins, recommend probation outcomes |
| **HR** (People Ops) | People partners | Run onboarding across the company, manage templates, record employment status decisions |
| **Admin** | IT / workspace admins | Manage members and roles, connectors, access policies, AI settings, audit |

Rules that apply to every role:

- Context Bot, the Knowledge Hub, People and Settings are available to all roles.
- Every role sees only the knowledge they could open in the original source (Google Drive, Slack, Jira and so on). Admin does not bypass this.
- Users can never give themselves a higher role.

---

## 2. Navigation by role

| Role | Left navigation (in order) | Mobile bottom bar (first 4) |
|---|---|---|
| Employee | Home · My roadmap · Knowledge Hub · People · ~~Contributions~~ (hidden for demo) | Home, Roadmap, Knowledge, People |
| Manager | Home · Team onboarding · Knowledge Hub · Review queue · People · My learning | Home, Team, Knowledge, Reviews |
| HR | Home · Onboarding · Probation reviews · Templates · People · Knowledge Hub | Home, Onboarding, Probation, Templates |
| Admin | Overview · Members & roles · Connectors · Access policies · AI settings · Audit log · Knowledge Hub | Overview, Members, Connectors, Access |

All roles also get: global search, Context Bot (button + `⌘J`), notifications, account menu (profile, notifications, theme, sign out) and Settings.

> The "View as" role switcher in the prototype is a demo tool. Do not build it.

---

## 3. Data access matrix

This is the core of the spec: who can **view** (V) or **change** (C) each kind of data.

| Data | Employee | Manager | HR | Admin |
|---|---|---|---|---|
| Own profile: pronouns, location, bio, skills, avatar | V/C Own | V/C Own | V/C Own | V/C Own |
| Own profile: name, job title, team, manager (from HR system / SCIM) | V Own | V Own | V/C Org | V/C Org |
| Other people's public profile (name, role, team, skills, what they own, reporting line) | V Shared | V Shared | V Shared | V Shared |
| Compensation, private HR records, performance ratings, disciplinary notes | None | None | None in ContextOS | None |
| Learning roadmap, modules, progress % | V Own | V Own + V/C Team (edit roadmap) | V Org | None |
| Knowledge check scores and answers | V Own | V Team | V Org, as a summary on the probation review | None |
| Learning task assignments | V Own | C Team | C Org (via template / roadmap) | None |
| Check-in notes and pulse | None (sees upcoming check-in dates only) | V/C Team | V Org, as a summary on the probation review (milestones, activity, manager recommendation) | None |
| Probation recommendation | V own milestones only | C Team | V Org | None |
| Employment status decision (confirm / extend) | None | None | C Org | None |
| Onboarding record (start date, manager, buddy, template, setup checklist) | V Own (via roadmap and Home) | V Team | V/C Org | None |
| Onboarding templates | None | None (can adjust one person's roadmap) | V/C Org (create, edit, publish) | None |
| Knowledge Hub pages | V Shared | V Shared | V Shared | V Shared |
| Contributions (hidden for demo) | C Own | C Own + review Team domain | C Own | C Own |
| Context Bot conversation history | Own | Own | Own | Own |
| Team analytics (team progress, knowledge gaps, team knowledge) | None | V Team | V Org | None |
| Members and roles | None | None | None (creates new-hire records only) | V/C Org |
| Role requests | Can request | Can request | Can request | Approve / decline |
| Connectors, sync status | None | None | None | V/C Org |
| Access policies | None | None | None | V/C Org |
| AI settings, unanswered-question reports | None | Weekly team digest only | None | V/C Org |
| Audit log | None | None | V HR-relevant events | V Org |
| Personal settings, sessions, connected apps, data export | Own | Own | Own | Own |

The admin rule from the prototype: **"Admins don't see onboarding records or check-in notes."** Admin governs the workspace, not people's onboarding (see [decision 1](#8-decisions-to-confirm)).

---

## 4. Pages and features by role

Route names are the prototype's hash routes, so they can be mapped one to one.

### 4.1 Sign in and first day · all roles

| Page | Features |
|---|---|
| Sign in (`#signin`) | Sign in with Google Workspace (work email). Invite-based activation. No self-chosen role. |
| Welcome (`#welcome`, new hires) | Personal welcome with role, team, manager and start date. What ContextOS does. Profile setup (can skip). First 90 days overview, what's expected, how you're supported. Ends with "Go to my dashboard" or "Open my roadmap". |

### 4.2 Home (`#home`) · different for each role

**Employee Home**

| Section | Data | Actions |
|---|---|---|
| Next up (hero) | Own current module and progress | Resume module, ask Context Bot about the lesson |
| Your onboarding | Own progress %, stage, expected vs actual | View roadmap |
| This week | Own tasks: reading, practical tasks, checks, meetings | Filter To do / Overdue / Done, start or continue a task |
| Milestones | Own check-ins, 30/60/90-day reviews, probation date | |
| Ask band | | Ask Context Bot with suggested questions |
| Knowledge updates for you | Shared updates relevant to their team and projects | Open item |
| Your people | Own manager, buddy, key contacts | Open profile, message |
| ~~Platform team~~ | Team announcements | Hidden for demo |
| ~~Your contributions~~ | Own contributions | Hidden for demo |

**Manager Home**

| Section | Data | Actions |
|---|---|---|
| Header | | **Assign learning** (pick any team member), **Record check-in** |
| Needs your attention | Team: blocked, at risk, overdue | Review, open member, AI "Summarize progress" |
| Upcoming check-ins | Team | Open check-in |
| Team onboarding | Team progress table with expected-today marker | Open team view |
| Knowledge gaps on your team | Questions the team asked that had no good answer | Review sources, request update (Create article hidden for demo) |
| Team knowledge | Pages the team owns, stale pages, review queue count | |

**HR Home**

| Section | Data | Actions |
|---|---|---|
| Header | | New onboarding, Templates |
| Probation reviews · next 30 days | Org | Review, All reviews |
| Onboarding by team | Org: on track / at risk / blocked per team | |
| Starting soon | Org: upcoming joiners and setup status | Open onboarding record |
| Overdue milestones | Org | Follow up |
| Onboarding templates | Templates in use | Manage templates |

**Admin Overview**

| Section | Data | Actions |
|---|---|---|
| Knowledge sources | Connector health | Reconnect a failing connector, Add connector, All connectors |
| Access & security | SSO, SCIM, policies, role requests | Open the relevant page |
| Sync activity | Recent syncs and errors | View errors |
| AI answers | Answer quality and unanswered questions | |
| Audit log | Latest events | Full log |
| Members & roles | Member counts by role | Invite people |

### 4.3 My roadmap / My learning (`#roadmap`, `#module-*`, `#lesson-*`, `#check-*`) · Employee, Manager

| Feature | Employee | Manager |
|---|---|---|
| Roadmap with stages, modules and status | Yes (their onboarding roadmap) | "My learning": assigned courses, suggestions, completed |
| Progress card (% done, checks passed, expected by today) | Yes | No |
| Module page: lessons, outcomes, sources, people, rating | Yes | No |
| Lesson page: read, mark complete, select text and ask Context Bot | Yes | No |
| Knowledge check: answer, submit, see explanations, retake | Yes. Context Bot pauses during a check. | No |
| Request clarification (goes to the module owner) / request a roadmap change (goes to their manager) | Yes | No |
| Request access to a restricted source | Yes | No |
| Completed list | Yes (tile strip under the roadmap) | Yes |
| Add a suggested course | No | Yes |

HR and Admin have no learning pages in the prototype (see [decision 6](#8-decisions-to-confirm)).

### 4.4 Knowledge Hub (`#knowledge`, `#kb-*`) · all roles

Everyone gets the same features. Content is filtered by what they can open in the source.

| Feature | Notes |
|---|---|
| Search with results | "Report a gap" when nothing fits, and "Ask Context Bot" |
| Browse by category | Company, products, projects, systems, processes, decisions, glossary |
| Start here | Picked by role: Employee gets their current stage, Manager gets team and project pages, HR and Admin get company pages |
| Saved, recently updated, most read, indexed sources | |
| Item page | Overview, key facts, owners and experts, connected knowledge, sources (with "Request access"), save, ask about this page |
| Project page (e.g. Project Kestrel) | What and why, how it connects (map), risks and open questions, sources. "Continue learning" shows for Employee only. |
| ~~Contribute~~ / ~~Write it~~ | Hidden for demo |

### 4.5 People (`#people`, `#person-*`) · all roles

| Feature | Employee | Manager | HR | Admin |
|---|---|---|---|---|
| Directory search and filters, teams view, org chart | Yes | Yes | Yes | Yes |
| Ask an expert (via Context Bot) | Yes | Yes | Yes | Yes |
| Profile: about, skills, what they own in the Knowledge Hub, reporting line | Yes | Yes | Yes | Yes |
| Message, book time | Yes | Yes | Yes | Yes |
| **Onboarding card on a profile** | No | Only for their own reports who are onboarding | All people who are onboarding | No |

### 4.6 Manager pages · Manager only (HR can also open member pages)

| Page | Features |
|---|---|
| Team onboarding (`#team`) | Card per team member with stage, progress and status. Knowledge checks by topic across the team. Assign learning, record check-in. |
| Member (`#member-*`) | Progress vs plan. Current roadmap stage with **Edit roadmap** (add, remove modules; save). Knowledge check results. Coming up. Check-in history. Probation section with **Start recommendation**. AI insight with suggested actions (book a session, escalate an IT ticket). **Assign roadmap** for someone who has none yet. |
| Check-in (`#checkin-*`) | Type: Weekly 1:1, 30-day review, 60-day readiness, Probation recommendation. Overall pulse, ratings by area, blockers, next steps, evidence panel, last check-in. Save. A Probation recommendation goes to HR as "Ready for approval". |
| Review queue (`#review`) | Contributions waiting for this manager: side-by-side diff, sources. Approve and publish, or request changes. (Still visible for the demo, see [decision 10](#8-decisions-to-confirm).) |
| Assign learning dialog | Pick any member of the manager's team, pick a task (module, practical task, knowledge check), due date, note. Undo after assigning. |

### 4.7 HR pages · HR only

| Page | Features |
|---|---|
| Onboarding list (`#onboarding`) | Everyone onboarding across the company, filters. **New onboarding**: full name, job title, team, start date, manager, onboarding buddy, template. |
| Onboarding record (`#onboarding-*`) | Assignments (manager, buddy, template, People partner) with Change / Assign. Setup checklist: Google account (SCIM), laptop delivered, roadmap assigned, buddy assigned, welcome message sent, first-week calendar booked. Progress, milestones, message, link to probation review. |
| Probation reviews (`#probation`) | Filters: All, Needs you, Awaiting manager, At risk, Completed. Send reminders to managers. |
| Probation review (`#probation-*`) | Manager recommendation, onboarding milestones, activity. **Employment status (People Ops only):** Confirm employment, Extend probation, or Discuss with manager first. The decision is written to the audit log. Ask Context Bot about the review. |
| Templates (`#templates`, `#templates-*`) | List and new template. Editor: who it's for (roles, teams), modules (add, remove with undo, reorder), save draft, publish a new version, version history. Publishing is written to the audit log. |

### 4.8 Admin pages · Admin only

| Page | Features |
|---|---|
| Members & roles (`#members`) | Search, filter by role. Change a member's role (not their own). Invite people (email + role). Role requests: approve or decline. SCIM "Sync now". "What each role can do" table. |
| Connectors (`#connectors`) | Connected sources with health. Fix / reconnect. Add a source: authorize, choose what to index, sync settings. Manage. Request a connector. |
| Access policies (`#access`) | "Mirror source permissions" (always on, locked). Exclude and Restrict policies by group and source. New / edit policy. Resolve conflicts. Preview what a person can access. |
| AI settings (`#ai`) | Answer rules on/off, answer strictness (Strict / Balanced / Lenient), pause answers, stale-source warning threshold, route a question to its owner after N asks, weekly digest to managers. Lists: never used in answers, why answers were rated unhelpful, top unanswered questions. |
| Audit log (`#audit`) | All admin, HR and template events. Filter by category and date range. Expand for before/after details. |

### 4.9 Settings (`#settings`) · all roles

| Tab | Features |
|---|---|
| Profile | Edit pronouns, location, bio, skills, avatar shape. Name, job title and team are read-only ("From the HR system"). |
| Notifications | Per event and channel (In app, Email, Slack): learning reminders, knowledge check results, contribution reviews, answers to gaps you reported, team updates, mentions. Quiet hours. |
| Preferences | Theme, reduce motion, Context Bot options (open on start, show suggestions). |
| Security | Sign-in method, active sessions (sign out one or all others), connected apps (disconnect), request a copy of your data. |
| Workspace settings | **Admin only:** shortcuts to Members & roles and AI settings. |

### 4.10 Context Bot · all roles, on every page

| Feature | Notes |
|---|---|
| Global panel | Button in the rail, floating button on mobile, `⌘J`. Side panel on wide screens, sheet on tablets, full screen on phones. |
| Page context | Each page scopes the bot (chips like "Project: Kestrel") and shows suggested questions for that page and role. |
| Answers | Cited sources only from what the user can open. Confidence label, inline citations, source cards, related knowledge, follow-ups. |
| Feedback | Helpful / Not helpful with a reason, copy, save to notes. |
| No reliable answer | Honest "no answer" state, suggests a person to ask, **Report a knowledge gap** (notifies knowledge owners). |
| Restricted topics | Compensation, payroll, bonus, performance ratings and disciplinary questions get a "Restricted" answer **for every role**, pointing to the People partner. |
| Explain this | Select text in a lesson and ask about it. |
| Paused during knowledge checks | So answers can't be looked up during a check. |

---

## 5. Workflows that cross roles

| Workflow | Steps |
|---|---|
| New hire onboarding | HR creates the onboarding (manager, buddy, template, start date) → account created by SCIM → employee signs in and sees Welcome → roadmap appears for the employee and on the manager's Team onboarding → HR tracks setup and progress |
| Assign learning | Manager assigns a task to a team member → it appears in the employee's roadmap / This week |
| Check-ins | Manager records a check-in → stored on the member record → visible to HR on the probation review |
| Probation | Manager records a "Probation recommendation" check-in → HR sees "Ready for approval" → HR confirms or extends → audit log entry. The employee sees their own milestones. |
| Knowledge gaps | Context Bot can't answer → user reports a gap → knowledge owners notified → (contributions, hidden for demo) someone writes the answer → manager approves in Review queue → page published → Context Bot cites it |
| Templates | HR publishes a template version → new onboardings use it → audit log entry |
| Workspace changes | Admin changes a role, policy, connector or AI setting → audit log entry |

---

## 6. Implementation rules

1. **Enforce permissions in the API and database**, not only by hiding buttons and nav items. A hidden page must also return 403 for that role.
2. **Mirror source permissions.** Every indexed file, message and chunk keeps the source's access list. Search, Knowledge Hub pages and Context Bot answers filter by it in the database query, never after the fact by the AI.
3. **Admin does not bypass source permissions** and does not see onboarding records or check-in notes.
4. **Manager scope is direct reports** by default (see [decision 8](#8-decisions-to-confirm)).
5. **Restricted topics** (pay, bonus, performance ratings, disciplinary) are never answered by Context Bot, for any role.
6. **Write every privileged action to the audit log:** role changes, invites, policy and connector changes, AI setting changes, template publishes, employment status decisions.
7. **Org-controlled profile fields** (name, job title, team, manager) come from SCIM / HR and can't be edited by the employee.

---

## 7. Demo state (Oct 18)

These are soft-hidden in the prototype and must come back after the demo. They are switched off with `CX.data.hidden` in `Context OS/js/data.js`.

| Hidden | Where |
|---|---|
| Contributions | Employee nav item, Contributions page, editor, Home card, Knowledge Hub "Contribute", "Write it" on project pages, "Create article" on manager Home |
| Platform team updates card | Employee Home |

---

## 8. Decisions to confirm

The source documents disagree on these. The prototype's current behavior is in the middle column.

| # | Question | Prototype today | Other sources say |
|---|---|---|---|
| 1 | Can Admin see onboarding progress? | No. Admin sees no onboarding records or check-in notes. | IA doc: Admin sees org-wide onboarding progress |
| 2 | Who changes probation to full-time? | Manager recommends, HR records the decision | Dashboard Pages: Manager and HR can both "review and change from probation to full time". IA doc: Manager finalizes only if delegated. |
| 3 | Can a Manager edit or remove their team members? | No | Dashboard Pages: yes, own team only. IA doc: only if delegated. |
| 4 | Can HR add, edit and remove people and change roles? | HR creates new-hire onboarding records. Only Admin changes roles and invites. | Dashboard Pages: HR can add, edit and delete people |
| 5 | Does HR get an audit log page? | The role table says HR can view the audit log, but HR has no audit page | IA doc: HR sees HR-relevant records |
| 6 | Do HR and Admin get their own learning roadmap? | No | IA doc: every role has their own dashboard and assigned learning |
| 7 | Can employees publish knowledge directly? | No. Contributions go to review when the policy requires it. | Open question in the IA doc |
| 8 | Manager scope: direct reports or the whole reporting tree? | Direct reports | PRD: direct by default, Admin can turn on indirect reports |
| 9 | One role per user, or several? | One | Open question in the IA doc |
| 10 | Hide the manager Review queue for the demo? | Still visible | Its only input is Contributions, which is hidden |
