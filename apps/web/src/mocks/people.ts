import type {
  DirectoryPerson,
  KnowledgeSection,
  PersonProfile,
  PersonRef,
  PersonRelation,
  TeamArea,
} from "@contextos/shared";
import { PEOPLE_ENDPOINTS as E } from "@/features/people/api/people.api";
import { mockGet, MockNotFoundError } from "@/mocks/define";
import { people as cast } from "@/mocks/fixtures/people";
import { dateFromToday } from "@/mocks/fixtures/time";

/*
 * The prototype's directory, seen by Maya (an employee on Platform): her manager is Daniel and her
 * buddy is Sana. Read-only, so no session state.
 */

interface MockTeam {
  id: string;
  name: string;
  area: TeamArea;
  size: number;
  focus: string;
  lead: string;
}

const TEAMS: MockTeam[] = [
  { id: "team-platform", name: "Platform", area: "engineering", size: 7, focus: "Ingest gateway, event bus, ledger service, developer tooling", lead: "daniel" },
  { id: "team-billing", name: "Billing", area: "finance", size: 4, focus: "Pricing, invoicing, Project Kestrel", lead: "priya" },
  { id: "team-product", name: "Product", area: "product", size: 12, focus: "Tessellate Track and Insights", lead: "ivy" },
  { id: "team-data", name: "Data", area: "data", size: 9, focus: "ETA models, data warehouse, reporting", lead: "nina" },
  { id: "team-design", name: "Design", area: "design", size: 6, focus: "Product design and the design system", lead: "owen" },
  { id: "team-support", name: "Support", area: "support", size: 22, focus: "Customer support and the help center", lead: "aisha" },
  { id: "team-sales", name: "Sales", area: "sales", size: 31, focus: "New business and renewals", lead: "marcus" },
  { id: "team-people", name: "People Operations", area: "people", size: 6, focus: "Hiring, onboarding, probation, policies", lead: "elena" },
  { id: "team-it", name: "IT", area: "it", size: 4, focus: "Devices, access and workspace tools", lead: "tom" },
];

interface MockPerson {
  ref: PersonRef;
  team: string;
  manager: string | null;
  location: string;
  timeZone: string;
  joinedOn: string;
  skills: string[];
  bio: string;
  expert?: boolean;
  owns?: string[];
}

/** Knowledge Hub items people own, as titled in the prototype's hub. */
const OWNED: Record<string, { title: string; section: KnowledgeSection }> = {
  "shipment-event": { title: "Shipment event", section: "glossary" },
  oncall: { title: "On-call handbook: Platform", section: "process" },
  ingest: { title: "Ingest gateway", section: "system" },
  eventbus: { title: "Event bus", section: "system" },
  adr042: { title: "ADR-042: Billing events on Kafka", section: "decision" },
  adr045: { title: "ADR-045: Idempotency keys for billing consumers", section: "decision" },
  adr047: { title: "ADR-047: Deprecate the v1 ingest API", section: "decision" },
  api: { title: "Public API and webhooks", section: "product" },
  ledger: { title: "Ledger service", section: "system" },
  "dwell-time": { title: "Dwell time", section: "glossary" },
  release: { title: "Release process", section: "process" },
  incident: { title: "Incident reviews", section: "process" },
  kestrel: { title: "Project Kestrel", section: "project" },
  values: { title: "Values in practice", section: "company" },
  track: { title: "Tessellate Track", section: "product" },
  insights: { title: "Tessellate Insights", section: "product" },
  webapp: { title: "Web app", section: "system" },
  atlas: { title: "Project Atlas: ETA model v3", section: "project" },
  eta: { title: "ETA confidence", section: "glossary" },
};

const ref = (id: string, name: string, title: string): PersonRef => ({ id, name, title });
const extra = {
  ivy: ref("p-ivy", "Ivy Chen", "Product Manager · Track"),
  ceo: ref("p-ceo", "Rosa Martín", "Chief Executive Officer"),
};

const P: Record<string, MockPerson> = {
  maya: { ref: cast.maya, team: "team-platform", manager: "daniel", location: "London", timeZone: "Europe/London", joinedOn: dateFromToday(-8), skills: ["TypeScript", "APIs", "Product engineering"], bio: "Product engineer on Platform. Before Tessellate, built checkout flows at a retail marketplace.", owns: ["shipment-event"] },
  daniel: { ref: cast.daniel, team: "team-platform", manager: "ceo", location: "London", timeZone: "Europe/London", joinedOn: "2022-02-07", skills: ["Engineering management", "Incident response", "Hiring"], bio: "Leads the Platform team: ingest, event bus, ledger and developer tooling.", owns: ["oncall"] },
  sana: { ref: cast.sana, team: "team-platform", manager: "daniel", location: "Manchester", timeZone: "Europe/London", joinedOn: "2021-06-14", expert: true, skills: ["Ingest gateway", "Kafka", "Carrier integrations", "Go"], bio: "Staff engineer and tech lead for ingest. Wrote ADR-042 and leads the technical side of Project Kestrel.", owns: ["ingest", "eventbus", "adr042", "adr045", "adr047", "api"] },
  leah: { ref: cast.leah, team: "team-platform", manager: "daniel", location: "Dublin", timeZone: "Europe/Dublin", joinedOn: dateFromToday(-38), skills: ["Postgres", "Billing systems", "Python"], bio: "Backend engineer working on the ledger service during Kestrel.", owns: ["ledger", "dwell-time"] },
  arjun: { ref: cast.arjun, team: "team-platform", manager: "daniel", location: "Bangalore", timeZone: "Asia/Kolkata", joinedOn: dateFromToday(-75), skills: ["Kubernetes", "Observability", "On-call"], bio: "Site reliability engineer. Owns release tooling and incident reviews.", owns: ["release", "incident"] },
  chloe: { ref: cast.chloe, team: "team-platform", manager: "daniel", location: "Paris", timeZone: "Europe/Paris", joinedOn: dateFromToday(-21), skills: ["Data pipelines", "dbt", "Snowflake"], bio: "Data engineer building usage pipelines for the new billing tiers." },
  jonah: { ref: cast.jonah, team: "team-platform", manager: "daniel", location: "Berlin", timeZone: "Europe/Berlin", joinedOn: dateFromToday(5), skills: ["Terraform", "AWS", "SRE"], bio: "Site reliability engineer joining Platform soon." },
  priya: { ref: cast.priya, team: "team-billing", manager: "ivy", location: "London", timeZone: "Europe/London", joinedOn: "2023-03-06", expert: true, skills: ["Pricing", "Billing", "Project Kestrel"], bio: "Product manager for billing and pricing. Leads Project Kestrel and owns the 2026 pricing.", owns: ["kestrel"] },
  elena: { ref: cast.elena, team: "team-people", manager: "ceo", location: "London", timeZone: "Europe/London", joinedOn: "2022-01-10", skills: ["Onboarding", "Probation reviews", "Policies"], bio: "People partner for Engineering and Product. Runs onboarding and probation reviews.", owns: ["values"] },
  tom: { ref: cast.tom, team: "team-it", manager: "ceo", location: "London", timeZone: "Europe/London", joinedOn: "2021-08-02", skills: ["Google Workspace", "Access management", "SSO"], bio: "Runs IT and the ContextOS workspace: access, connectors and security." },
  ivy: { ref: extra.ivy, team: "team-product", manager: "ceo", location: "London", timeZone: "Europe/London", joinedOn: "2020-05-11", expert: true, skills: ["Tessellate Track", "Customer research", "Roadmaps"], bio: "Product manager for Tessellate Track and Insights.", owns: ["track", "insights", "webapp"] },
  nina: { ref: cast.nina, team: "team-data", manager: "ceo", location: "Amsterdam", timeZone: "Europe/Amsterdam", joinedOn: "2021-10-04", expert: true, skills: ["ETA models", "Data warehouse", "Machine learning"], bio: "Leads the Data team and Project Atlas, the next ETA model.", owns: ["atlas", "eta"] },
  ravi: { ref: cast.ravi, team: "team-data", manager: "nina", location: "Amsterdam", timeZone: "Europe/Amsterdam", joinedOn: dateFromToday(-60), skills: ["SQL", "Looker"], bio: "Analyst on carrier performance reporting." },
  owen: { ref: cast.owen, team: "team-design", manager: "ceo", location: "Bristol", timeZone: "Europe/London", joinedOn: "2021-04-12", skills: ["Design systems", "Research ops"], bio: "Leads Design. Owns the product design system." },
  hana: { ref: cast.hana, team: "team-design", manager: "owen", location: "London", timeZone: "Europe/London", joinedOn: dateFromToday(-62), skills: ["Interaction design", "Prototyping"], bio: "Designs Tessellate Track. Owns the product tour module." },
  marcus: { ref: cast.marcus, team: "team-sales", manager: "ceo", location: "New York", timeZone: "America/New_York", joinedOn: "2020-11-02", skills: ["Enterprise sales", "Pricing"], bio: "Runs the North America sales team." },
  sofia: { ref: cast.sofia, team: "team-sales", manager: "marcus", location: "New York", timeZone: "America/New_York", joinedOn: dateFromToday(-80), skills: ["Retail accounts"], bio: "Account executive for retail customers." },
  grace: { ref: cast.grace, team: "team-sales", manager: "marcus", location: "Toronto", timeZone: "America/Toronto", joinedOn: dateFromToday(5), skills: ["3PL accounts"], bio: "Account executive joining soon." },
  aisha: { ref: cast.aisha, team: "team-support", manager: "ceo", location: "Dublin", timeZone: "Europe/Dublin", joinedOn: "2021-01-11", expert: true, skills: ["Customer support", "Zendesk", "Escalations"], bio: "Leads customer support and the help center." },
  ben: { ref: cast.ben, team: "team-support", manager: "aisha", location: "Dublin", timeZone: "Europe/Dublin", joinedOn: dateFromToday(-65), skills: ["Carrier issues"], bio: "Support specialist for carrier-related tickets." },
};

const VIEWER = "maya";
const LEADERSHIP = { ref: extra.ceo };

const keyOfId = (id: string) => Object.keys(P).find((key) => P[key]?.ref.id === id);
const teamOf = (person: MockPerson) => TEAMS.find((team) => team.id === person.team);
const personRef = (key: string): PersonRef => (key === "ceo" ? LEADERSHIP.ref : (P[key]?.ref ?? LEADERSHIP.ref));
const isNew = (person: MockPerson) => person.joinedOn > dateFromToday(-90);

function relations(key: string): PersonRelation[] {
  const viewer = P[VIEWER];
  const person = P[key];
  if (!viewer || !person) return [];
  const out: PersonRelation[] = [];
  if (key === VIEWER) out.push("you");
  if (viewer.manager === key) out.push("manager");
  if (key === "sana") out.push("buddy");
  if (person.manager === VIEWER) out.push("report");
  return out;
}

function summary(key: string): DirectoryPerson {
  const person = P[key];
  if (!person) throw new MockNotFoundError("Person");
  const team = teamOf(person);
  return {
    id: person.ref.id,
    name: person.ref.name,
    title: person.ref.title ?? "",
    team: team ? { id: team.id, name: team.name } : null,
    location: person.location,
    timeZone: person.timeZone,
    joinedOn: person.joinedOn,
    skills: person.skills,
    expert: person.expert ?? false,
    isNew: isNew(person),
    relations: relations(key),
  };
}

function profile(id: string): PersonProfile {
  const key = keyOfId(id);
  if (!key) throw new MockNotFoundError("Person");
  const person = P[key]!;
  return {
    ...summary(key),
    bio: person.bio,
    manager: person.manager ? personRef(person.manager) : null,
    reports: Object.keys(P)
      .filter((other) => P[other]?.manager === key)
      .map(personRef),
    owns: (person.owns ?? []).flatMap((item) => {
      const owned = OWNED[item];
      return owned ? [{ id: item, title: owned.title, section: owned.section, projectId: null }] : [];
    }),
    onboarding: null,
  };
}

function directory(q: string, filter: string) {
  const viewerTeam = P[VIEWER]?.team;
  const needle = q.trim().toLowerCase();
  const items = Object.keys(P)
    .filter((key) => {
      const person = P[key]!;
      if (filter === "team" && person.team !== viewerTeam) return false;
      if (filter === "experts" && !person.expert) return false;
      if (filter === "new" && !isNew(person)) return false;
      if (!needle) return true;
      const team = teamOf(person)?.name ?? "";
      return `${person.ref.name} ${person.ref.title} ${team} ${person.skills.join(" ")}`.toLowerCase().includes(needle);
    })
    .map(summary);
  return { total: 412, teamCount: 18, items };
}

const EXPERTS: Array<{ topic: string; area: TeamArea; person: string }> = [
  { topic: "Billing & pricing", area: "finance", person: "priya" },
  { topic: "Ingest & carrier formats", area: "engineering", person: "sana" },
  { topic: "On-call & releases", area: "support", person: "arjun" },
  { topic: "ETAs & data", area: "data", person: "nina" },
  { topic: "Product: Track", area: "product", person: "ivy" },
  { topic: "Onboarding & HR", area: "people", person: "elena" },
];

function teams() {
  const mine = TEAMS.find((team) => team.id === P[VIEWER]?.team);
  return {
    myTeam: mine
      ? {
          id: mine.id,
          name: mine.name,
          lead: summary(mine.lead),
          members: Object.keys(P)
            .filter((key) => P[key]?.manager === mine.lead)
            .map(summary),
        }
      : null,
    items: TEAMS.map((team) => ({
      id: team.id,
      name: team.name,
      area: team.area,
      size: team.size,
      focus: team.focus,
      lead: personRef(team.lead),
      members: Object.keys(P)
        .filter((key) => P[key]?.team === team.id && key !== team.lead)
        .slice(0, 4)
        .map(personRef),
    })),
  };
}

export const peopleMocks = [
  // Listed before the profile route so "/experts" and "/teams" are not read as person ids.
  mockGet(E.experts)(() => ({
    items: EXPERTS.map((expert) => ({ topic: expert.topic, area: expert.area, person: personRef(expert.person) })),
  })),
  mockGet(E.teams)(() => teams()),
  mockGet(E.directory)(({ request }) => {
    const params = new URL(request.url).searchParams;
    return directory(params.get("q") ?? "", params.get("filter") ?? "all");
  }),
  mockGet(E.profile)(({ params }) => profile(typeof params.id === "string" ? params.id : "")),
];
