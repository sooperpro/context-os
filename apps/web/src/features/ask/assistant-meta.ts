import type { Persona } from "@/features/workspace/viewer";

/** Context Bot's defaults for each persona when a page declares nothing (prototype `SUGGESTIONS`). */
export const DEFAULT_SUGGESTIONS: Record<Persona, readonly string[]> = {
  employee: [
    "What does the Platform team own?",
    "Why are we moving billing to Kafka?",
    "Who owns the ingest gateway?",
    "What is a shipment event?",
  ],
  manager: [
    "Which topics is my team struggling with?",
    "Summarize Leah’s onboarding progress",
    "Draft an agenda for Maya’s week 2 check-in",
  ],
  people_ops: [
    "Which probation reviews need action this week?",
    "Which teams have overdue check-ins?",
    "What changed in the Engineering template v4?",
  ],
  admin: [
    "Why is the Jira connector failing?",
    "Which sources are excluded from answers?",
    "Who changed access policies this week?",
  ],
};

export const DEFAULT_INTRO: Record<Persona, string> = {
  employee:
    "I can explain the company’s products, projects, systems and decisions, and point you to the right people.",
  manager: "I can summarize your team’s onboarding, spot knowledge gaps, and prepare check-ins.",
  people_ops:
    "I can summarize onboarding status, probation reviews and check-ins across teams you’re authorized to see.",
  admin: "I can explain connector health, access policies and audit events in this workspace.",
};

/** The second context chip: how wide the bot looks by default. */
export const DEFAULT_SCOPE: Record<Persona, string> = {
  employee: "Your onboarding",
  manager: "Your team",
  people_ops: "All teams",
  admin: "Workspace",
};
