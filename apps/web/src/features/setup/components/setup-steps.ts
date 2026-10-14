import type { SetupStep } from "@contextos/shared";

/** Copy for each wizard step. Order comes from the backend (`SETUP_STEPS`). */
export const STEP_COPY: Record<SetupStep, { title: string; short: string; description: string; evidence: string }> = {
  connect_source: {
    title: "Connect a source",
    short: "Connect",
    description:
      "Authorize Google Drive with read-only access. ContextOS never writes to your sources and only indexes what the connected account can already open.",
    evidence: "Completes when a Google Drive connection is recorded for your account.",
  },
  select_scopes: {
    title: "Choose content",
    short: "Content",
    description:
      "Pick the documents to import from the connected drive into a project. Permission mirroring stays on: people only see sources they can open in Drive.",
    evidence: "Completes when at least one source has been imported through a connector.",
  },
  create_project: {
    title: "Create a project",
    short: "Project",
    description:
      "A project reconstructs how a piece of work got here, why, and what is true now. Start with the one a new hire will ask about first.",
    evidence: "Completes when the workspace has at least one project.",
  },
  invite_team: {
    title: "Invite your team",
    short: "Team",
    description:
      "Invite the people who own the knowledge, so answers can point to them. Roles in ContextOS apply when they accept.",
    evidence: "Completes when a second member joins or an invitation is sent.",
  },
  assign_new_hire: {
    title: "Assign a new hire",
    short: "New hire",
    description:
      "Assign a published learning path to a new hire with a start date and a mentor. Learning paths exist in the API but are not in the app yet.",
    evidence: "Completes when a learning path assignment exists.",
  },
};
