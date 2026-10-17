import type { SetupStep } from "@contextos/shared";

/** Copy for each wizard step. Order comes from the backend (`SETUP_STEPS`). */
export const STEP_COPY: Record<
  SetupStep,
  { title: string; short: string; description: string; evidence: string }
> = {
  company_profile: {
    title: "Tell us about the company",
    short: "Company",
    description:
      "What the company does, what it sells and when people work. The AI reads it when it drafts onboarding templates and modules; you can change it later on the Workspace page.",
    evidence: "Completes when the profile says what the company does.",
  },
  org_structure: {
    title: "Departments and teams",
    short: "Teams",
    description:
      "Add the company's departments and the teams in them, and put people on their teams. Job titles come in the templates step, where each role gets its onboarding.",
    evidence: "Completes when there is at least one department with a team.",
  },
  connect_source: {
    title: "Connect Google Drive",
    short: "Drive",
    description:
      "Authorize Google Drive with read-only access, then pick folders. Auto-organise files them under Company knowledge and sorts them into the Hub's Company, Products, Projects and Processes collections, so no project is needed.",
    evidence: "Completes when a Google Drive connection is recorded for your account.",
  },
  select_scopes: {
    title: "Choose content",
    short: "Content",
    description:
      "Pick more folders to import, auto-organised, or feed one project's sources. Permission mirroring stays on: people only see sources they can open in Drive.",
    evidence: "Completes when at least one source has been imported through a connector.",
  },
  create_project: {
    title: "Create a project",
    short: "Project",
    description:
      "A project reconstructs how a piece of work got here, why, and what is true now. Start with the one a new hire will ask about first.",
    evidence: "Completes when the workspace has at least one project.",
  },
  onboarding_templates: {
    title: "Generate onboarding templates",
    short: "Templates",
    description:
      "Draft an onboarding template for every role in the company, from its own knowledge: stages, probation, check-ins and modules. People Ops review and publish each one before anyone gets it.",
    evidence: "Completes when every role listed has a template.",
  },
  invite_team: {
    title: "Invite People Ops and managers",
    short: "Invite",
    description:
      "Invite People Ops to run onboarding and the managers who own the knowledge, so answers can point to them. Roles in ContextOS apply when they accept.",
    evidence: "Completes when a second member joins or an invitation is sent.",
  },
  assign_new_hire: {
    title: "Start a new hire's onboarding",
    short: "New hire",
    description:
      "People Ops starts onboarding from Onboarding › New onboarding (manager, buddy, template, start date), and a manager can assign a roadmap from Team onboarding.",
    evidence: "Completes when the first onboarding is started.",
  },
};
