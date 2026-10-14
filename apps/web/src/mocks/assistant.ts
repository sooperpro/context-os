import type { AnswerBlock, AssistantAnswer, AssistantSource, PersonRef } from "@contextos/shared";
import { ASSISTANT_ENDPOINTS as E } from "@/features/ask/api/assistant.api";
import { formatPercent } from "@/lib/format";
import { mockPost } from "@/mocks/define";
import { people } from "@/mocks/fixtures/people";
import { profileByFirstName } from "@/mocks/people";
import { probationByFirstName } from "@/mocks/people-ops";

/*
 * Context Bot outside a project, with the prototype's canned answers (bot.js and the answers its
 * pages add). Questions it has no answer for get an honest "no answer"; pay, performance and
 * disciplinary questions are refused, as in the reference.
 */

type Seed = Omit<
  AssistantAnswer,
  "id" | "question" | "outcome" | "createdAt" | "searched" | "people" | "note" | "related"
> & {
  note?: string;
  people?: AssistantAnswer["people"];
  related?: AssistantAnswer["related"];
};

const source = (
  title: string,
  system: string,
  detail: string,
  extra: Partial<Pick<AssistantSource, "provider" | "url" | "to" | "stale">> = {},
): AssistantSource => ({
  title,
  system,
  detail,
  provider: extra.provider ?? null,
  url: extra.url ?? null,
  to: extra.to ?? null,
  stale: extra.stale ?? null,
});

const S = {
  charter: source("Platform team charter", "Google Drive", "Daniel Reyes · updated Sep 22", {
    provider: "google-drive",
  }),
  catalog: source("Service catalog: Platform", "Knowledge Hub", "Verified Oct 1", {
    to: "/knowledge",
  }),
  slackPlatform: source("#platform-team (pinned)", "Slack", "Daniel Reyes · Aug 30", {
    provider: "slack",
  }),
  adr42: source("ADR-042: Billing events on Kafka", "GitHub", "Accepted Mar 18, 2026", {
    provider: "github",
  }),
  kestrelPlan: source("Kestrel rollout plan v3", "Google Drive", "Priya Nair · updated today", {
    provider: "google-drive",
  }),
  kes112: source("KES-112 · Billing event cutover", "Jira", "In progress", {
    provider: "jira",
    stale: "Jira sync is failing: may be out of date",
  }),
  codeowners: source("CODEOWNERS · ingest-gateway", "GitHub", "main branch", {
    provider: "github",
  }),
  glossary: source(
    "Glossary: Shipment event (draft)",
    "Knowledge Hub",
    "Suggested by you · in review",
    { to: "/contributions" },
  ),
  ingestDocs: source("Ingest gateway: overview", "Knowledge Hub", "Sana Iqbal · updated Sep 28", {
    to: "/knowledge",
  }),
  checks: source("Knowledge check results · Platform", "ContextOS", "Last 30 days", {
    to: "/team",
  }),
  leahRoadmap: source(
    "Leah Park · roadmap & check-ins",
    "ContextOS",
    "Visible to you as her manager",
    { to: "/team/p-leah" },
  ),
  mayaRoadmap: source(
    "Maya Okafor · roadmap & tasks",
    "ContextOS",
    "Visible to you as her manager",
    { to: "/team/p-maya" },
  ),
  probation: source("Probation tracker", "ContextOS", "Updated live", { to: "/probation" }),
  checkinLog: source("Check-in records", "ContextOS", "All teams", { to: "/onboarding" }),
  tplDiff: source("Engineering IC template · v3 → v4", "ContextOS", "Elena Brooks · Sep 30", {
    to: "/templates/tpl-eng-ic",
  }),
  jiraLog: source("Connector log · Jira", "ContextOS", "Last run 08:41", { to: "/connectors" }),
  policies: source("Knowledge access policies", "ContextOS", "14 active", { to: "/access" }),
  audit: source("Audit log", "ContextOS", "Last 7 days", { to: "/audit" }),
  roadmap: source("Your roadmap", "ContextOS", "Engineering IC v4", { to: "/roadmap" }),
  template: source("Engineering IC template v4", "ContextOS", "Elena Brooks · Sep 30"),
  pricing: source("Pricing & packaging 2026", "Google Drive", "Priya Nair · Sep 12", {
    provider: "google-drive",
  }),
  lesson: source(
    "Lesson 3: Why billing is moving to events",
    "ContextOS",
    "Reviewed by Priya Nair · Oct 2",
    { to: "/roadmap" },
  ),
  owners: source("Ownership map: Billing", "Knowledge Hub", "Verified Oct 1", { to: "/knowledge" }),
  track: source("Tessellate Track: product overview", "Knowledge Hub", "Hana Sato · Sep 25", {
    to: "/knowledge",
  }),
  kestrel: source("Project Kestrel", "Knowledge Hub", "Verified Oct 1", { to: "/knowledge" }),
  kestrelSlack: source("#kestrel", "Slack", "412 messages", { provider: "slack" }),
  directory: source("People directory", "Google Workspace", "Synced by SCIM at 8:00 AM", {
    provider: "google-drive",
    to: "/people",
  }),
};

const p = (text: string): AnswerBlock => ({ type: "paragraph", text });
const ul = (...items: string[]): AnswerBlock => ({ type: "list", ordered: false, items });
const ol = (...items: string[]): AnswerBlock => ({ type: "list", ordered: true, items });
const verified = (label: string) => ({ level: "verified" as const, label });
const partial = (label: string) => ({ level: "partial" as const, label });
const rel = (kind: string, title: string, to = `/knowledge?q=${encodeURIComponent(title)}`) => ({
  kind,
  title,
  to,
});
const who = (person: PersonRef, why: string) => [{ person, why }];

const ANSWERS: Record<string, Seed> = {
  "What does the Platform team own?": {
    confidence: verified("Verified · 3 sources agree"),
    blocks: [
      p("Platform owns the shared infrastructure every product team builds on: [1]"),
      ul(
        "**Ingest gateway**: receives shipment events from ~40 carrier formats",
        "**Event bus**: Kafka clusters and schemas",
        "**Ledger service**: the system of record for billing usage",
        "**Developer tooling**: CI templates and the local dev environment [2]",
      ),
      p(
        "On-call rotates weekly across six engineers. Daniel Reyes manages the team and Sana Iqbal leads ingest. [3]",
      ),
    ],
    sources: [S.charter, S.catalog, S.slackPlatform],
    followups: [
      "How does Platform on-call work?",
      "What is the event bus used for?",
      "Who owns the ingest gateway?",
    ],
    related: [rel("System", "Ingest gateway"), rel("Project", "Kestrel")],
  },
  "Why are we moving billing to Kafka?": {
    confidence: verified("Verified · decision record"),
    blocks: [
      p(
        "In March 2026 the team decided to publish billing events to Kafka instead of exporting the ledger database in a nightly batch. [1]",
      ),
      p(
        "**Why:** invoices lagged usage by up to 24 hours, the batch job failed silently about twice a month, and the new usage-based tiers need near-real-time usage. [1]",
      ),
      p(
        "**Trade-off:** more load on the event bus, and every consumer has to be idempotent. [1] [2]",
      ),
      p(
        "The migration is **Project Kestrel**. It's in milestone 2 (dual-write), and cutover is planned for **Nov 12**. [2] [3]",
      ),
    ],
    note: "Source 3 comes from Jira, which hasn’t synced for 2 hours. Its status may be out of date.",
    sources: [S.adr42, S.kestrelPlan, S.kes112],
    followups: [
      "What does dual-write mean here?",
      "Who made this decision?",
      "What could go wrong at cutover?",
    ],
    related: [
      rel("Decision", "ADR-042"),
      rel("Project", "Kestrel"),
      rel("Module", "How Tessellate makes money", "/roadmap"),
    ],
  },
  "Who owns the ingest gateway?": {
    confidence: verified("Verified · 2 sources agree"),
    blocks: [
      p(
        "**Sana Iqbal** is the technical owner. She's also your onboarding buddy. The service belongs to the Platform team. [1] [2]",
      ),
      p("For incidents, page the Platform on-call rather than Sana directly. [1]"),
    ],
    people: who(people.sana, "Owner · Ingest gateway"),
    sources: [S.catalog, S.codeowners],
    followups: ["How does the ingest gateway work?", "What changed in ADR-047?"],
    related: [rel("System", "Ingest gateway")],
  },
  "What is a shipment event?": {
    confidence: partial("Partly verified · draft source"),
    blocks: [
      p(
        "A **shipment event** is a timestamped status update about a parcel, such as picked up, in transit, out for delivery, delivered, or exception. Events come from carriers or from a customer's warehouse system. [1]",
      ),
      p(
        "Tessellate normalizes about 40 carrier formats into one schema at the ingest gateway before events reach the event bus. [2]",
      ),
    ],
    note: "The glossary entry is your own suggestion and is still in review, so treat the definition as a draft.",
    sources: [S.glossary, S.ingestDocs],
    followups: ["Trace a shipment event end to end", "What is dwell time?"],
    related: [rel("Glossary", "Dwell time"), rel("System", "Ingest gateway")],
  },
  "What is the event bus used for?": {
    confidence: verified("Verified · 2 sources agree"),
    blocks: [
      p(
        "The event bus is Tessellate's Kafka platform. Every normalized shipment event from the ingest gateway is published there, and product services subscribe to the topics they need: tracking, ETAs, alerts, and soon billing. [1]",
      ),
      p(
        "Platform runs three clusters (prod, staging, dev) and owns the schema registry. A new topic needs a short design review in #platform-team. [2]",
      ),
    ],
    sources: [S.catalog, S.slackPlatform],
    followups: ["Why are we moving billing to Kafka?", "Who owns the ingest gateway?"],
    related: [rel("System", "Event bus"), rel("Decision", "ADR-042")],
  },
  "How does Platform on-call work?": {
    confidence: verified("Verified · team handbook"),
    blocks: [
      p(
        "On-call rotates weekly, Monday 10:00 to Monday 10:00, across six engineers. New engineers shadow two rotations in weeks 5–8 before taking a primary shift. [1]",
      ),
      p(
        "Pages go to the primary first, then the secondary after 10 minutes, then Daniel Reyes. [1]",
      ),
    ],
    sources: [S.charter],
    followups: ["What does the Platform team own?"],
    related: [rel("Process", "On-call handbook: Platform")],
  },
  "Which topics is my team struggling with?": {
    confidence: verified("From your team’s activity"),
    blocks: [
      p("Two topics stand out in the last 30 days: [1]"),
      ul(
        "**Billing architecture**: 3 of 5 attempts failed, including Leah's two",
        "**Kestrel rollback**: asked 7 times with no answer, because no article exists yet",
      ),
      p(
        "Writing a rollback article would close the biggest gap. Sana Iqbal or Priya Nair are the likeliest authors. [1]",
      ),
    ],
    sources: [S.checks],
    followups: ["Summarize Leah’s onboarding progress", "How do I roll back a Kestrel deploy?"],
    related: [rel("Module", "Billing architecture", "/team")],
  },
  "Summarize Leah’s onboarding progress": {
    confidence: verified("From roadmap and check-ins"),
    blocks: [
      p("Leah is on day 39 at **34%**, against 45% expected for this point. [1]"),
      ul(
        "Product & systems: 4 of 6 modules, 2 overdue by 5 days",
        "Failed “Billing architecture” twice, both times on idempotency questions",
        "Last check-in noted she is “unsure who to ask about the ledger”",
      ),
      p("Suggestion: pair her with Priya Nair for one session, then retake the check. [1]"),
    ],
    sources: [S.leahRoadmap],
    followups: [
      "Draft an agenda for Maya’s week 2 check-in",
      "Which topics is my team struggling with?",
    ],
    related: [rel("Person", "Leah Park", "/team/p-leah")],
  },
  "Draft an agenda for Maya’s week 2 check-in": {
    confidence: verified("From Maya’s roadmap"),
    blocks: [
      p("Here's a 30-minute agenda based on Maya's roadmap and the topics she added: [1]"),
      ol(
        "**Wins (5 min)**: local setup done, “Our customers” check passed 9/10",
        "**Foundations wrap-up (10 min)**: 3 of 6 modules done, due Friday",
        "**Her topics (10 min)**: on-call expectations, Kestrel context, pairing with Sana",
        "**Next two weeks (5 min)**: preview of Product & systems",
      ),
    ],
    sources: [S.mayaRoadmap],
    followups: ["What should Maya focus on next?"],
    related: [rel("Person", "Maya Okafor", "/team/p-maya")],
  },
  "Which probation reviews need action this week?": {
    confidence: verified("From the probation tracker"),
    blocks: [
      p("Two reviews need you this week: [1]"),
      ul(
        "**Sofia Alvarez** (Sales): manager recommends confirming her. Ready for your approval.",
        "**Ben Carter** (Support): manager recommends a 30-day extension. Needs HR review.",
      ),
      p("Two more are waiting on managers: Arjun Mehta and Hana Sato. [1]"),
    ],
    sources: [S.probation],
    followups: ["Which teams have overdue check-ins?"],
    related: [rel("Tracker", "Probation reviews", "/probation")],
  },
  "Which teams have overdue check-ins?": {
    confidence: verified("From check-in records"),
    blocks: [
      p(
        "Data and Support. Ravi Kumar (Data) has 2 unrecorded check-ins, 9 days overdue. Ben Carter's (Support) 60-day check-in is 5 days overdue. [1]",
      ),
    ],
    sources: [S.checkinLog],
    followups: ["Which probation reviews need action this week?"],
  },
  "What changed in the Engineering template v4?": {
    confidence: verified("From template history"),
    blocks: [
      p("v4 made three changes: [1]"),
      ul(
        "Added a “Trace an event end to end” practical task in week 2",
        "Moved on-call shadowing from week 3 to week 5",
        "Replaced two reading modules with one knowledge check",
      ),
    ],
    sources: [S.tplDiff],
    followups: ["Which teams have overdue check-ins?"],
    related: [rel("Template", "Engineering · IC v4", "/templates/tpl-eng-ic")],
  },
  "Why is the Jira connector failing?": {
    confidence: verified("From connector logs"),
    blocks: [
      p(
        "Since 08:41 the Jira service account has received **403 Forbidden** on 3 projects: KES, ING and BIL. [1]",
      ),
      p(
        "The most likely cause is a permission-scheme change in Jira that removed the contextos-sync account from those projects. The other 8 projects still sync. [1]",
      ),
      p(
        "To fix it, re-add the account to the projects' “Browse projects” permission, or reconnect with a different account. Then run a sync.",
      ),
    ],
    sources: [S.jiraLog],
    followups: ["Which sources are excluded from answers?"],
    related: [rel("Connector", "Jira", "/connectors")],
  },
  "Which sources are excluded from answers?": {
    confidence: verified("From access policies"),
    blocks: [
      p(
        "Three are excluded for everyone: Slack direct messages, the HR shared drive, and the Legal Jira project. Seven more are restricted to specific groups, such as Finance · Restricted. [1]",
      ),
    ],
    sources: [S.policies],
    followups: ["Who changed access policies this week?"],
    related: [rel("Settings", "Access policies", "/access")],
  },
  "Who changed access policies this week?": {
    confidence: verified("From the audit log"),
    blocks: [
      p(
        "Only you. Today at 10:12 you added the finance-leads group to “Finance · Restricted”. [1]",
      ),
    ],
    sources: [S.audit],
    followups: ["Which sources are excluded from answers?"],
    related: [rel("Settings", "Audit log", "/audit")],
  },
  "What should I focus on this week?": {
    confidence: verified("From your roadmap"),
    blocks: [
      p("Three things will finish Foundations on time: [1]"),
      ol(
        "**Finish “How Tessellate makes money”**: lesson 3, then the 5-question check",
        "**Trace a shipment event** with Sana: book 45 minutes before Friday",
        "**Modules 5 and 6**: about 70 minutes together",
      ),
      p("Bring questions to your week 2 check-in with Daniel on Friday. [1]"),
    ],
    sources: [S.roadmap],
    followups: ["What happens in Product & systems?", "How is my progress measured?"],
    related: [rel("Module", "How Tessellate makes money", "/roadmap")],
  },
  "What happens in Product & systems?": {
    confidence: verified("From your roadmap"),
    blocks: [
      p(
        "It opens after Foundations and runs two weeks. You’ll learn the architecture you’ll work in: the ingest gateway, the event bus, billing and Project Kestrel, plus five decision records that shaped the platform. [1] [2]",
      ),
    ],
    sources: [S.roadmap, S.template],
    followups: ["What should I focus on this week?"],
    related: [rel("Stage", "Product & systems", "/roadmap")],
  },
  "How is my progress measured?": {
    confidence: verified("From the onboarding template"),
    blocks: [
      p(
        "Progress counts completed modules, passed knowledge checks and approved practical tasks. “Expected by today” comes from the template’s schedule, so being above it means you’re ahead. [1]",
      ),
      p(
        "Your manager sees the same numbers, plus notes from check-ins. Ratings you give modules are anonymous to them. [1]",
      ),
    ],
    sources: [S.template],
    followups: ["What should I focus on this week?"],
  },
  "Summarize this module in 3 points": {
    confidence: verified("From this module’s sources"),
    blocks: [
      ol(
        "**Pricing:** every tier is a platform fee plus usage, priced per tracked shipment.",
        "**Billing today:** the ledger records usage and a nightly job exports it, so invoices lag by up to a day.",
        "**The change:** ADR-042 moves billing to Kafka events (Project Kestrel), with cutover planned for Nov 12.",
      ),
      p("Sources: pricing deck [1], decision record [2] and rollout plan [3]."),
    ],
    sources: [S.pricing, S.adr42, S.kestrelPlan],
    followups: ["Why are we moving billing to Kafka?", "Who owns pricing decisions?"],
    related: [rel("Decision", "ADR-042")],
  },
  "Who owns pricing decisions?": {
    confidence: verified("Verified · ownership map"),
    blocks: [
      p(
        "Pricing and packaging belong to **Priya Nair** (Product, Billing), with sign-off from Finance. Billing systems belong to Platform. [1]",
      ),
    ],
    people: who(people.priya, "Owner · Pricing and billing product"),
    sources: [S.owners],
    followups: ["Summarize this module in 3 points"],
  },
  "What does dual-write mean here?": {
    confidence: verified("Verified · 2 sources agree"),
    blocks: [
      p(
        "For a few weeks the ledger sends each billable action two ways: the old nightly export and the new billing-events topic. [1]",
      ),
      p(
        "Finance compares both totals every day. Once they match for two weeks in a row, the team cuts over to events only. [2]",
      ),
    ],
    sources: [S.lesson, S.kestrelPlan],
    followups: ["What could go wrong at cutover?", "Explain idempotent consumers simply"],
    related: [rel("Project", "Kestrel")],
  },
  "Explain idempotent consumers simply": {
    confidence: verified("Verified · decision record"),
    blocks: [
      p("Processing the same event twice has the same effect as processing it once. [1]"),
      p(
        "Kafka may deliver an event more than once. Each billing event carries an ID, and consumers record the IDs they’ve handled, so a duplicate is skipped instead of billed twice. [1] [2]",
      ),
    ],
    sources: [S.adr42, S.lesson],
    followups: ["What does dual-write mean here?"],
    related: [rel("Decision", "ADR-042")],
  },
  "Who made this decision?": {
    confidence: verified("Verified · decision record"),
    blocks: [
      p(
        "ADR-042 was decided on Mar 18, 2026 by **Sana Iqbal** (Platform), **Priya Nair** (Billing product) and **Daniel Reyes** (Platform manager). Finance was consulted. [1]",
      ),
    ],
    people: who(people.sana, "Author of ADR-042"),
    sources: [S.adr42],
    followups: ["What could go wrong at cutover?"],
    related: [rel("Decision", "ADR-042")],
  },
  "What could go wrong at cutover?": {
    confidence: partial("Partly answered · plan still changing"),
    blocks: [
      p("The rollout plan lists two main risks: [1]"),
      ul(
        "**Totals don’t match** between the export and the events. Cutover waits until they match for two weeks.",
        "**A consumer double-counts** during a replay. Each consumer is tested against duplicate events first.",
      ),
    ],
    note: "The rollback steps for cutover aren’t documented yet. Your team has flagged this as a knowledge gap.",
    sources: [S.kestrelPlan],
    followups: ["What does dual-write mean here?"],
    related: [rel("Project", "Kestrel")],
  },
  "What does Tessellate Track do?": {
    confidence: verified("From the product overview"),
    blocks: [
      p(
        "Tessellate Track shows logistics teams where every shipment is, predicts arrival times, and alerts them to exceptions like delays or failed deliveries. [1]",
      ),
    ],
    sources: [S.track],
    followups: ["What should I focus on this week?"],
    related: [rel("Product", "Tessellate Track")],
  },
  "Who should I ask about Kestrel?": {
    confidence: verified("Verified · project page"),
    blocks: [
      p(
        "For scope, dates and pricing impact, ask **Priya Nair**, the product lead. For anything technical, ask **Sana Iqbal**, the tech lead. [1]",
      ),
      p("Day-to-day discussion happens in **#kestrel** on Slack. [2]"),
    ],
    people: who(people.priya, "Product lead · Project Kestrel"),
    sources: [S.kestrel, S.kestrelSlack],
    followups: ["Why are we moving billing to Kafka?", "What could go wrong at cutover?"],
    related: [rel("Project", "Kestrel")],
  },
  "Who are the experts on billing?": {
    confidence: verified("From ownership in the Knowledge Hub"),
    blocks: [
      p(
        "**Priya Nair** owns pricing and Project Kestrel. **Sana Iqbal** wrote ADR-042 and knows the billing pipeline. **Leah Park** is working on the ledger service. [1] [2]",
      ),
    ],
    people: who(people.priya, "Product lead · Billing and pricing"),
    sources: [S.owners, S.directory],
    followups: ["Who should I ask about Kestrel?", "Who is on the Platform team?"],
    related: [rel("Project", "Kestrel")],
  },
  "Who is on the Platform team?": {
    confidence: verified("From the directory"),
    blocks: [
      p(
        "Seven people, led by **Daniel Reyes**: Sana Iqbal (tech lead, ingest), Leah Park, Arjun Mehta, Chloe Martin, Maya Okafor, and Jonah Kim, who starts soon. [1]",
      ),
      p("The team owns the ingest gateway, event bus, ledger service and developer tooling. [2]"),
    ],
    sources: [S.directory, S.charter],
    followups: ["What does the Platform team own?", "Who are the experts on billing?"],
  },
};
// Follow-ups that reuse an answer, as in the reference.
ANSWERS["How does the ingest gateway work?"] = ANSWERS["What is a shipment event?"]!;

/** Matches typed questions to canned ones: case, curly quotes and a trailing "?" don't matter. */
const normalize = (question: string) =>
  question
    .trim()
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[?.!\s]+$/, "");
const BY_KEY = new Map(
  Object.entries(ANSWERS).map(([question, seed]) => [normalize(question), seed]),
);

/** Questions ContextOS never answers: pay, performance ratings and disciplinary matters. */
const RESTRICTED =
  /\b(salar(y|ies)|compensation|payroll|pay ?rise|bonus|performance rating|disciplinary)\b/i;

/** Answers built from live mock data: a probation review's evidence, what someone works on. */
function resolve(question: string): Seed | null {
  const evidence = /^summarize (\w+)['’]s probation evidence\??$/i.exec(question.trim());
  if (evidence?.[1]) {
    const review = probationByFirstName(evidence[1]);
    if (!review) return null;
    const first = review.person.name.split(" ")[0];
    const done = review.milestones
      .filter((milestone) => milestone.state === "done")
      .map((milestone) => milestone.title.toLowerCase());
    const open = review.milestones.filter((milestone) => milestone.state !== "done");
    return {
      confidence: verified("From onboarding records and check-ins"),
      blocks: [
        p(
          `${first} is at **${formatPercent(review.readiness)}** readiness with ${review.checkinSummary.split(" · ")[0]}. Completed: ${done.join(", ") || "none yet"}. [1]`,
        ),
        p(
          open.length
            ? `Still open: ${open.map((milestone) => `${milestone.title.toLowerCase()} (${milestone.detail})`).join("; ")}. [1]`
            : "Every milestone is complete.",
        ),
        p(
          review.managerNote
            ? `${review.manager.name} recommends **${review.recommendation === "confirm" ? "confirming" : "an extension"}**: “${review.managerNote.split(". ")[0]}.” [2]`
            : `${review.manager.name} hasn’t submitted a recommendation yet.`,
        ),
      ],
      sources: [
        source(`${review.person.name} · onboarding record`, "ContextOS", "Visible to People Ops", {
          to: `/onboarding/${review.person.id}`,
        }),
        ...(review.managerNote
          ? [
              source("Manager recommendation", "ContextOS", review.manager.name, {
                to: `/probation/${review.id}`,
              }),
            ]
          : []),
      ],
      followups: ["Which probation reviews need action this week?"],
    };
  }
  const works = /^what does (\w+) work on\??$/i.exec(question.trim());
  if (works?.[1]) {
    const profile = profileByFirstName(works[1]);
    if (!profile) return null;
    const first = profile.person.name.split(" ")[0];
    return {
      confidence: verified("From the directory and owned pages"),
      blocks: [
        p(`${profile.bio} [1]`),
        p(
          profile.owns.length
            ? `${first} owns ${profile.owns.length === 1 ? "1 page" : `${profile.owns.length} pages`} in the Knowledge Hub, including ${profile.owns
                .slice(0, 3)
                .map((title) => `**${title}**`)
                .join(", ")}. [2]`
            : `${first} doesn’t own any Knowledge Hub pages yet.`,
        ),
      ],
      people: who(profile.person, profile.person.title ?? "Colleague"),
      sources: [
        S.directory,
        ...(profile.owns.length
          ? [
              source(
                `Pages owned by ${profile.person.name}`,
                "Knowledge Hub",
                `${profile.owns.length} pages`,
                { to: "/knowledge" },
              ),
            ]
          : []),
      ],
      followups: ["Who are the experts on billing?"],
      related: profile.owns.slice(0, 3).map((title) => rel("Page", title)),
    };
  }
  return null;
}

/** Who is likely to know, by the area of the page the question came from. */
function likelyExpert(page: string) {
  if (/^\/(probation|onboarding|templates)/.test(page)) return who(people.elena, "People partner");
  if (/^\/(connectors|access|ai|audit|members|setup)/.test(page))
    return who(people.tom, "IT & Workspace Admin");
  return who(people.sana, "Owns related systems");
}

let answered = 0;

export function resetAssistantMocks(): void {
  answered = 0;
}

export const assistantMocks = [
  mockPost(E.ask)((input) => {
    answered += 1;
    const base = {
      id: `wa-${answered}`,
      question: input.question,
      createdAt: new Date().toISOString(),
    };
    if (RESTRICTED.test(input.question)) {
      return {
        ...base,
        outcome: "restricted",
        confidence: null,
        blocks: [
          p(
            "Compensation and performance records aren’t available in ContextOS, and I can’t answer from them.",
          ),
          p("For questions about your own pay or benefits, contact your People partner."),
        ],
        note: null,
        people: who(people.elena, "People partner"),
        sources: [],
        searched: [],
        followups: [],
        related: [],
      };
    }
    const seed = BY_KEY.get(normalize(input.question)) ?? resolve(input.question);
    if (!seed) {
      return {
        ...base,
        outcome: "no_answer",
        confidence: null,
        blocks: [
          p(
            "I couldn’t find anything that answers this in sources you can access, so I won’t guess.",
          ),
        ],
        note: null,
        people: likelyExpert(input.page),
        sources: [],
        searched: ["Knowledge Hub", "Google Drive", "GitHub", "Slack (public channels)", "Jira"],
        followups: [],
        related: [],
      };
    }
    return {
      ...base,
      outcome: "answered",
      searched: [],
      note: null,
      people: [],
      related: [],
      ...seed,
    };
  }),
  mockPost(E.feedback)(() => ({ ok: true })),
  mockPost(E.gap)(
    (input) => ({
      id: `gap-${answered}`,
      notified: /kestrel|platform|ingest|ledger/i.test(input.question)
        ? "Platform knowledge owners"
        : "Knowledge owners",
    }),
    201,
  ),
];
