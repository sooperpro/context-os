import type { AssistantPreferences } from "@contextos/shared";
import { ACCOUNT_ENDPOINTS as E } from "@/features/account/api/account.api";
import { mockGet, mockPatch, mockPost } from "@/mocks/define";

/** Personal settings with no API yet (prototype Settings). Changes last for the session. */
let preferences: AssistantPreferences = { openBesideLessons: true, showSuggestions: true };

export function resetAccountMocks(): void {
  preferences = { openBesideLessons: true, showSuggestions: true };
}

export const accountMocks = [
  mockGet(E.assistantPreferences)(() => preferences),
  mockPatch(E.updateAssistantPreferences)((input) => {
    preferences = { ...preferences, ...input };
    return preferences;
  }),
  mockPost(E.dataExport)(() => ({
    email: "you@your-company",
    readyBy: new Date(Date.now() + 86_400_000).toISOString(),
  })),
];
