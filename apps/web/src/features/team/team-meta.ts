import type { Blocker, CheckCell, CheckinType, Pulse } from "@contextos/shared";

/** How check-ins read. Data, not components. */
export const CHECKIN_TYPE_LABEL: Record<CheckinType, string> = {
  weekly: "Weekly 1:1",
  day_30: "30-day review",
  readiness_60: "60-day readiness",
  probation: "Probation recommendation",
};

export const PULSE: Record<Pulse, { label: string; tone: "success" | "warning" | "error" }> = {
  on_track: { label: "On track", tone: "success" },
  concerns: { label: "Some concerns", tone: "warning" },
  off_track: { label: "Off track", tone: "error" },
};

export const BLOCKER_LABEL: Record<Blocker, string> = {
  access: "Access",
  expectations: "Unclear expectations",
  workload: "Workload",
  knowledge: "Missing knowledge",
  mentor: "Needs a mentor",
};

export const READINESS_LEVELS = ["Not yet", "Developing", "Meets", "Exceeds"] as const;

export const TEAM_PATH = "/team";
export const memberPath = (personId: string) => `${TEAM_PATH}/${encodeURIComponent(personId)}`;
export const checkinPath = (personId: string, type?: CheckinType) =>
  `${memberPath(personId)}/check-in${type ? `?type=${type}` : ""}`;

export const CHECK_CELL_LABEL: Record<CheckCell, string> = {
  pass: "Passed",
  fail: "Failed",
  todo: "Not yet",
  na: "Not in plan",
};
