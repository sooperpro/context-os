import type {
  SystemRole,
  AnswerConfidence,
  Confidence,
  ContextItemKind,
  ContributionKind,
  ContributionVisibility,
  DecisionData,
  JobStatus,
  KnowledgeOrigin,
  KnowledgeSection,
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
  company: "Company",
  product: "Product",
  initiative: "Project",
  process: "Process",
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
  hr: "HR",
  member: "Member",
  guest: "Guest",
};

/**
 * Audit log actions as sentences (the API records dotted verbs). Unknown actions fall back to the
 * raw verb, so a new backend action still shows up.
 */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "assignment.create": "Assigned a role",
  "assignment.delete": "Removed a role assignment",
  "checkpoint.signoff": "Signed off a learning checkpoint",
  "connector.connect": "Connected a knowledge source",
  "connector.disconnect": "Disconnected a knowledge source",
  "connector.import": "Imported files from a connector",
  "context_item.verify": "Verified a knowledge item",
  "correction.verify": "Verified a correction",
  "department.create": "Created a department",
  "department.delete": "Deleted a department",
  "department.update": "Renamed a department",
  "feedback.create": "Rated an answer",
  "flag.create": "Flagged knowledge as outdated",
  "flag.update": "Updated a flag",
  "hub.refresh": "Refreshed a project hub",
  "job.retry": "Retried a processing job",
  "milestone.verify": "Verified a milestone",
  "onboarding.create": "Started an onboarding plan",
  "onboarding.escalate": "Escalated an onboarding issue",
  "onboarding.outcome": "Recorded a probation outcome",
  "onboarding.pause": "Paused an onboarding plan",
  "onboarding.record.assign": "Changed an onboarding assignment",
  "onboarding.record.create": "Started an onboarding",
  "onboarding.setup.complete": "Completed an onboarding setup step",
  "onboarding.template.archive": "Archived an onboarding template",
  "onboarding.template.create": "Created an onboarding template",
  "onboarding.template.delete": "Deleted an onboarding template",
  "onboarding.template.draft": "Saved an onboarding template draft",
  "onboarding.template.publish": "Published an onboarding template",
  "onboarding.template.restore": "Restored an onboarding template",
  "path.assign": "Assigned a learning path",
  "path.create": "Created a learning path",
  "path.publish": "Published a learning path",
  "probation.decision": "Recorded an employment decision",
  "probation.discuss": "Asked a manager to discuss a probation review",
  "probation.recommend": "Recorded a probation recommendation",
  "project.create": "Created a project",
  "project.delete": "Deleted a project",
  "project.update": "Updated a project",
  "question.ask": "Asked Context Bot",
  "source.access.grant": "Granted access to a source",
  "source.access.revoke": "Revoked access to a source",
  "source.create": "Added a source",
  "source.delete": "Deleted a source",
  "source.reprocess": "Reprocessed a source",
  "team.create": "Created a team",
  "team.delete": "Deleted a team",
  "team.update": "Updated a team",
  "thread.delete": "Deleted a conversation",
  "user.invite": "Invited someone",
  "user.organization.update": "Changed someone's job title, team or manager",
  "user.update": "Changed someone's role or status",
  "workspace.create": "Created the workspace",
  "workspace.setup": "Updated workspace setup",
  "workspace.update": "Updated the workspace",
};

export const CONTRIBUTION_KIND_LABEL: Record<ContributionKind, string> = {
  article: "New article",
  edit: "Suggested edit",
  glossary_term: "Glossary term",
  flag: "Flagged as outdated",
};

/** Knowledge Hub sections, as the editor's "Section" field names them. */
export const SECTION_LABEL: Record<KnowledgeSection, string> = {
  company: "Company",
  product: "Products",
  project: "Projects",
  system: "Systems",
  process: "Processes",
  decision: "Decisions",
  glossary: "Glossary",
};

export const VISIBILITY_LABEL: Record<ContributionVisibility, string> = {
  workspace: "Everyone",
  team: "Your team only",
};

/** Where a piece of knowledge came from (connectors and the hub itself). */
export const KNOWLEDGE_ORIGIN_LABEL: Record<KnowledgeOrigin, string> = {
  google_drive: "Google Drive",
  github: "GitHub",
  slack: "Slack",
  jira: "Jira",
  confluence: "Confluence",
  knowledge_hub: "Knowledge Hub",
  loom: "Loom",
};
