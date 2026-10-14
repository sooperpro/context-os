import { HOME_ENDPOINTS as E } from "@/features/home/api/home.api";
import { mockGet } from "@/mocks/define";
import { atFromToday } from "@/mocks/fixtures/time";

/**
 * The admin overview's cards with no API yet. Connectors, members and the audit log are live and
 * are not mocked.
 */
export const adminMocks = [
  mockGet(E.security)(() => ({
    items: [
      { id: "sso", value: "Google Workspace · enforced", state: "ok" },
      { id: "scim", value: "On · last run 8:00 AM", state: "ok" },
      { id: "access_policies", value: "14 active · 1 conflict", state: "attention" },
      { id: "role_requests", value: "Admin, Manager · 2 pending", state: "attention" },
    ],
  })),
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
  mockGet(E.ai)(() => ({
    helpfulRate: 0.87,
    ratings: 2413,
    periodDays: 30,
    settings: [
      {
        id: "cite_sources",
        label: "Cite sources in every answer",
        detail: "Answers without a source are shown as “not found”.",
        enabled: true,
        locked: false,
      },
      {
        id: "answer_without_sources",
        label: "Answer only from sources the person can access",
        detail: "Required. Enforced by connector permissions.",
        enabled: true,
        locked: true,
      },
      {
        id: "learning_suggestions",
        label: "Route unanswered questions to knowledge owners",
        detail: "Creates knowledge gaps for team owners.",
        enabled: true,
        locked: false,
      },
      {
        id: "train_on_data",
        label: "Include Slack direct messages",
        detail: "Off by policy.",
        enabled: false,
        locked: true,
      },
    ],
  })),
];
