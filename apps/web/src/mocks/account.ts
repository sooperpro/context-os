import type { AssistantPreferences } from "@contextos/shared";
import { ACCOUNT_ENDPOINTS as E } from "@/features/account/api/account.api";
import { mockGet, mockPatch, mockPost } from "@/mocks/define";

/**
 * Personal settings (prototype Settings): Context Bot preferences and the data export. The API serves
 * them (apps/api/src/modules/platform/employee.routes.ts), so these are fixtures for screen tests only
 * (src/test/employee-mocks.ts). Changes last until the test ends.
 */
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
  mockPost(E.dataExport)(
    () => ({ email: "maya@tessellate.io", readyBy: new Date().toISOString() }),
    202,
  ),
];
