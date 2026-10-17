import type { Welcome } from "@contextos/shared";
import { WELCOME_ENDPOINTS as E } from "@/features/welcome/api/welcome.api";
import { formatDayDate } from "@/lib/format";
import { mockGet, mockPost } from "@/mocks/define";
import { people } from "@/mocks/fixtures/people";
import { dateFromToday } from "@/mocks/fixtures/time";

/**
 * Maya's first-day welcome (prototype `#welcome`). The API serves `/v1/me/welcome`
 * (apps/api/src/modules/platform/employee.routes.ts), so this is a fixture for screen tests only
 * (src/test/employee-mocks.ts). Finishing it lasts until the test ends.
 */
const seed = (): Welcome => ({
  firstDay: dateFromToday(-8),
  title: "Product Engineer",
  team: "Platform",
  people: [
    { person: people.daniel, relation: "manager", detail: "Weekly check-ins on Fridays" },
    { person: people.sana, relation: "buddy", detail: "Pairing on your first practical task" },
    {
      person: people.elena,
      relation: "people_partner",
      detail: "Questions about policies and probation",
    },
  ],
  profile: {
    preferredName: "Maya",
    pronouns: "",
    location: "London",
    known: ["TypeScript", "APIs"],
    reminders: "slack",
  },
  knownOptions: [
    "TypeScript",
    "APIs",
    "React",
    "Postgres",
    "Kafka",
    "Kubernetes",
    "Logistics",
    "Billing systems",
  ],
  expectations: [
    `Finish Foundations by ${formatDayDate(dateFromToday(3))}`,
    "Meet Daniel every Friday for a check-in",
    "Pass each knowledge check (4 of 5 or better, retakes allowed)",
    "Ship your first change by the end of week 6",
  ],
  support: [
    "Sana pairs with you on practical tasks",
    "Context Bot answers questions with sources, any time",
    "Elena is your contact for policies and probation",
    "Your rating of each module goes to its owner",
  ],
  completedAt: null,
  // The mock app doesn't send the previewer to the welcome on load; open it from Home.
  due: false,
});

let welcome = seed();

export function resetWelcomeMocks(): void {
  welcome = seed();
}

export const welcomeMocks = [
  mockGet(E.welcome)(() => welcome),
  mockPost(E.complete)((input) => {
    welcome = { ...welcome, profile: input, completedAt: new Date().toISOString(), due: false };
    return welcome;
  }),
];
