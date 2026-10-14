import { HOME_ENDPOINTS as E } from "@/features/home/api/home.api";
import { mockGet } from "@/mocks/define";
import { atFromToday } from "@/mocks/fixtures/time";

/**
 * The admin overview's sync activity, which has no API yet. Security and AI answers come from the
 * admin store (mocks/admin.ts); connectors, members and the audit log are live and are not mocked.
 */
export const adminMocks = [
  mockGet(E.syncRuns)(() => ({
    items: [
      {
        id: "sr1",
        connector: "Google Drive",
        startedAt: atFromToday(0, 10, 42),
        ok: true,
        detail: "214 files updated",
        durationMs: 72_000,
      },
      {
        id: "sr2",
        connector: "Slack",
        startedAt: atFromToday(0, 10, 40),
        ok: true,
        detail: "1,032 messages",
        durationMs: 48_000,
      },
      {
        id: "sr3",
        connector: "GitHub",
        startedAt: atFromToday(0, 10, 30),
        ok: true,
        detail: "57 files updated",
        durationMs: 125_000,
      },
      {
        id: "sr4",
        connector: "Jira",
        startedAt: atFromToday(0, 8, 41),
        ok: false,
        detail: "403 Forbidden on KES, ING, BIL",
        durationMs: 0,
      },
      {
        id: "sr5",
        connector: "SCIM · Google Workspace",
        startedAt: atFromToday(0, 8, 0),
        ok: true,
        detail: "3 users provisioned",
        durationMs: 9_000,
      },
    ],
  })),
];
