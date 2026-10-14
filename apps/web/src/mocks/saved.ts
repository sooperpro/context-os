import type { SavedItem } from "@contextos/shared";
import { SAVED_ENDPOINTS as E } from "@/features/knowledge/api/saved.api";
import { mockGet, mockPut } from "@/mocks/define";

/** Saved knowledge for the session. Items and projects themselves are live; only the saves are mocked. */
let saved: SavedItem[] = [];

export function resetSavedMocks(): void {
  saved = [];
}

const param = (value: string | readonly string[] | undefined) =>
  typeof value === "string" ? value : "";

export const savedMocks = [
  mockGet(E.list)(() => ({ items: saved })),
  mockPut(E.save)((input, { params }) => {
    const targetId = param(params.id);
    saved = saved.filter((entry) => entry.targetId !== targetId);
    if (!input.saved) return null;
    const entry: SavedItem = {
      targetType: input.targetType,
      targetId,
      projectId: input.projectId,
      savedAt: new Date().toISOString(),
    };
    saved = [entry, ...saved];
    return entry;
  }),
];
