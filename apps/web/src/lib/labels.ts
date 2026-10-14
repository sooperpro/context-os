import type {
  SystemRole,
  AnswerConfidence,
  Confidence,
  ContextItemKind,
  DecisionData,
  JobStatus,
  SourceKind,
  SourceStatus,
  StatusState,
  Verification,
} from "@contextos/shared";

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  document: "Document",
  conversation: "Conversation",
  ticket: "Ticket",
  pull_request: "Pull request",
  note: "Note",
};

export const SOURCE_KIND_OPTIONS = (Object.keys(SOURCE_KIND_LABEL) as SourceKind[]).map(
  (value) => ({
    value,
    label: SOURCE_KIND_LABEL[value],
  }),
);

export const SOURCE_STATUS_LABEL: Record<SourceStatus, string> = {
  pending: "Queued",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

export const KIND_LABEL: Record<ContextItemKind, string> = {
  decision: "Decision",
  event: "Event",
  status_claim: "Status",
  person: "Person",
  component: "Component",
  dependency: "Dependency",
  term: "Term",
};

export const VERIFICATION_LABEL: Record<Verification, string> = {
  inferred: "Inferred",
  confirmed: "Confirmed",
  stale: "Stale",
  disputed: "Disputed",
  superseded: "Superseded",
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

export const STATE_LABEL: Record<StatusState, string> = {
  active: "Active",
  blocked: "Blocked",
  done: "Done",
  planned: "Planned",
  risk: "At risk",
  open_question: "Open question",
};

export const DECISION_STATUS_LABEL: Record<DecisionData["decisionStatus"], string> = {
  proposed: "Proposed",
  decided: "Decided",
  superseded: "Superseded",
  disputed: "Disputed",
};

export const ANSWER_CONFIDENCE_LABEL: Record<AnswerConfidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
  insufficient: "Insufficient evidence",
};

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Queued",
  running: "Running",
  done: "Done",
  failed: "Failed",
};

export const ROLE_LABEL: Record<SystemRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  member: "Member",
  guest: "Guest",
};
