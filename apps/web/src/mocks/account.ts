import type { AssistantPreferences, ConnectedApp } from "@contextos/shared";
import { ACCOUNT_ENDPOINTS as E } from "@/features/account/api/account.api";
import { MockNotFoundError, mockGet, mockPatch, mockPost } from "@/mocks/define";
import { atFromToday } from "@/mocks/fixtures/time";

/** Personal settings with no API yet (prototype Settings). Changes last for the session. */
const seedApps = (): ConnectedApp[] => [
  {
    id: "slack",
    name: "ContextOS for Slack",
    provider: "slack",
    description: "Sends your notifications and answers /context questions",
    connectedAt: atFromToday(-8, 9),
  },
];

let preferences: AssistantPreferences = { openBesideLessons: true, showSuggestions: true };
let apps = seedApps();

export function resetAccountMocks(): void {
  preferences = { openBesideLessons: true, showSuggestions: true };
  apps = seedApps();
}

const param = (value: string | readonly string[] | undefined) =>
  typeof value === "string" ? value : "";

export const accountMocks = [
  mockGet(E.assistantPreferences)(() => preferences),
  mockPatch(E.updateAssistantPreferences)((input) => {
    preferences = { ...preferences, ...input };
    return preferences;
  }),
  mockGet(E.connectedApps)(() => ({ items: apps })),
  mockPost(E.disconnectApp)((_input, { params }) => {
    const id = param(params.id);
    if (!apps.some((app) => app.id === id)) throw new MockNotFoundError("Connected app");
    apps = apps.filter((app) => app.id !== id);
    return { items: apps };
  }),
  mockPost(E.dataExport)(() => ({
    email: "you@your-company",
    readyBy: new Date(Date.now() + 86_400_000).toISOString(),
  })),
];
