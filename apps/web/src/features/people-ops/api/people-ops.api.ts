import {
  NewOnboardingInputSchema,
  NewTemplateInputSchema,
  RoadmapGenerateInputSchema,
  type RoadmapGenerateInput,
  OnboardingAssignmentInputSchema,
  OnboardingMessageInputSchema,
  OnboardingMessageResultSchema,
  OnboardingOptionsSchema,
  OnboardingRecordListSchema,
  OnboardingRecordSchema,
  ProbationDecisionInputSchema,
  ProbationDetailSchema,
  ProbationDiscussInputSchema,
  OnboardingRecordSummarySchema,
  PersonDetailsInputSchema,
  PersonDetailsSchema,
  ReminderInputSchema,
  ReminderResultSchema,
  ReviewSendBackInputSchema,
  SetupStepInputSchema,
  TemplateArchiveInputSchema,
  TemplateDetailSchema,
  TemplateDraftInputSchema,
  TemplateLibrarySchema,
  TemplatePublishInputSchema,
  TemplateVersionSchema,
  type NewOnboardingInput,
  type NewTemplateInput,
  type OnboardingAssignmentInput,
  type OnboardingFilter,
  type OnboardingMessageInput,
  type PersonDetailsInput,
  type ProbationDecisionInput,
  type ProbationDiscussInput,
  type ReminderInput,
  type ReviewSendBackInput,
  type SetupStepId,
  type TemplateDraftInput,
  type TemplatePublishInput,
} from "@contextos/shared";
import { z } from "zod";
import { apiRequest } from "@/lib/api-client";

/**
 * People Ops (HR) endpoints, for the `hr` role only (apps/api/src/modules/platform/people-ops.routes.ts).
 * Templates are also open to admins, and to managers and path curators for their own drafts.
 * Tests use the fixtures in src/mocks/people-ops.ts. Contracts:
 * packages/shared/src/schemas/people-ops.ts. The probation list and the template list are HR Home's
 * (`HOME_ENDPOINTS.probationReviews`, `.templates`).
 */
export const PEOPLE_OPS_ENDPOINTS = {
  onboardings: { path: "/v1/people-ops/onboardings", schema: OnboardingRecordListSchema },
  onboarding: { path: "/v1/people-ops/onboardings/:id", schema: OnboardingRecordSchema },
  assign: {
    path: "/v1/people-ops/onboardings/:id",
    schema: OnboardingRecordSchema,
    input: OnboardingAssignmentInputSchema,
  },
  setupStep: {
    path: "/v1/people-ops/onboardings/:id/setup/:step",
    schema: OnboardingRecordSchema,
    input: SetupStepInputSchema,
  },
  message: {
    path: "/v1/people-ops/onboardings/:id/message",
    schema: OnboardingMessageResultSchema,
    input: OnboardingMessageInputSchema,
  },
  options: { path: "/v1/people-ops/onboarding-options", schema: OnboardingOptionsSchema },
  createOnboarding: {
    path: "/v1/people-ops/onboardings",
    schema: OnboardingRecordSchema,
    input: NewOnboardingInputSchema,
  },
  probation: { path: "/v1/people-ops/probation-reviews/:id", schema: ProbationDetailSchema },
  decide: {
    path: "/v1/people-ops/probation-reviews/:id/decision",
    schema: ProbationDetailSchema,
    input: ProbationDecisionInputSchema,
  },
  discuss: {
    path: "/v1/people-ops/probation-reviews/:id/discuss",
    schema: ProbationDetailSchema,
    input: ProbationDiscussInputSchema,
  },
  personOnboarding: {
    path: "/v1/people-ops/people/:id/onboarding",
    schema: OnboardingRecordSummarySchema,
  },
  personDetails: {
    path: "/v1/people-ops/people/:id/details",
    schema: PersonDetailsSchema,
    input: PersonDetailsInputSchema,
  },
  remind: {
    path: "/v1/people-ops/reminders",
    schema: ReminderResultSchema,
    input: ReminderInputSchema,
  },
  template: { path: "/v1/people-ops/templates/:id", schema: TemplateDetailSchema },
  templateVersion: {
    path: "/v1/people-ops/templates/:id/versions/:version",
    schema: TemplateVersionSchema,
  },
  archiveTemplate: {
    path: "/v1/people-ops/templates/:id/archive",
    schema: TemplateDetailSchema,
    input: TemplateArchiveInputSchema,
  },
  restoreTemplate: {
    path: "/v1/people-ops/templates/:id/restore",
    schema: TemplateDetailSchema,
    input: TemplateArchiveInputSchema,
  },
  saveDraft: {
    path: "/v1/people-ops/templates/:id/draft",
    schema: TemplateDetailSchema,
    input: TemplateDraftInputSchema,
  },
  publish: {
    path: "/v1/people-ops/templates/:id/publish",
    schema: TemplateDetailSchema,
    input: TemplatePublishInputSchema,
  },
  /** Managers and path curators send their draft to People Ops instead of publishing it. */
  submitTemplate: {
    path: "/v1/people-ops/templates/:id/submit",
    schema: TemplateDetailSchema,
    input: TemplatePublishInputSchema,
  },
  sendBackTemplate: {
    path: "/v1/people-ops/templates/:id/send-back",
    schema: TemplateDetailSchema,
    input: ReviewSendBackInputSchema,
  },
  createTemplate: {
    path: "/v1/people-ops/templates",
    schema: TemplateDetailSchema,
    input: NewTemplateInputSchema,
  },
  library: { path: "/v1/people-ops/template-library", schema: TemplateLibrarySchema },
  /** Draft a template for a job title from the Knowledge Hub, in the background. */
  generateTemplate: {
    path: "/v1/roadmaps/generate",
    schema: TemplateDetailSchema,
    input: RoadmapGenerateInputSchema,
  },
} as const;

const E = PEOPLE_OPS_ENDPOINTS;
const withId = (path: string, id: string) => path.replace(":id", encodeURIComponent(id));

export const fetchOnboardings = (
  query: { q: string; team: string; filter: OnboardingFilter },
  signal?: AbortSignal,
) =>
  apiRequest(E.onboardings.path, {
    query: { q: query.q || undefined, team: query.team || undefined, filter: query.filter },
    schema: E.onboardings.schema,
    signal,
  });

export const fetchOnboarding = (id: string, signal?: AbortSignal) =>
  apiRequest(withId(E.onboarding.path, id), { schema: E.onboarding.schema, signal });

export const updateOnboarding = (id: string, input: OnboardingAssignmentInput) =>
  apiRequest(withId(E.assign.path, id), { method: "PATCH", body: input, schema: E.assign.schema });

export const completeSetupStep = (id: string, step: SetupStepId) =>
  apiRequest(withId(E.setupStep.path, id).replace(":step", step), {
    method: "POST",
    body: {},
    schema: E.setupStep.schema,
  });

export const messageOnboarding = (id: string, input: OnboardingMessageInput) =>
  apiRequest(withId(E.message.path, id), { method: "POST", body: input, schema: E.message.schema });

export const fetchOnboardingOptions = (signal?: AbortSignal) =>
  apiRequest(E.options.path, { schema: E.options.schema, signal });

export const createOnboarding = (input: NewOnboardingInput) =>
  apiRequest(E.createOnboarding.path, {
    method: "POST",
    body: input,
    schema: E.createOnboarding.schema,
  });

export const fetchProbation = (id: string, signal?: AbortSignal) =>
  apiRequest(withId(E.probation.path, id), { schema: E.probation.schema, signal });

export const decideProbation = (id: string, input: ProbationDecisionInput) =>
  apiRequest(withId(E.decide.path, id), { method: "POST", body: input, schema: E.decide.schema });

export const discussProbation = (id: string, input: ProbationDiscussInput) =>
  apiRequest(withId(E.discuss.path, id), { method: "POST", body: input, schema: E.discuss.schema });

export const fetchPersonOnboarding = (userId: string, signal?: AbortSignal) =>
  apiRequest(withId(E.personOnboarding.path, userId), {
    schema: E.personOnboarding.schema,
    signal,
  });

export const fetchPersonDetails = (userId: string, signal?: AbortSignal) =>
  apiRequest(withId(E.personDetails.path, userId), { schema: E.personDetails.schema, signal });

export const updatePersonDetails = (userId: string, input: PersonDetailsInput) =>
  apiRequest(withId(E.personDetails.path, userId), {
    method: "PATCH",
    body: input,
    schema: E.personDetails.schema,
  });

export const remindManagers = (input: ReminderInput) =>
  apiRequest(E.remind.path, { method: "POST", body: input, schema: E.remind.schema });

export const fetchTemplate = (id: string, signal?: AbortSignal) =>
  apiRequest(withId(E.template.path, id), { schema: E.template.schema, signal });

export const fetchTemplateVersion = (id: string, version: number, signal?: AbortSignal) =>
  apiRequest(withId(E.templateVersion.path, id).replace(":version", String(version)), {
    schema: E.templateVersion.schema,
    signal,
  });

export const archiveTemplate = (id: string) =>
  apiRequest(withId(E.archiveTemplate.path, id), {
    method: "POST",
    body: {},
    schema: E.archiveTemplate.schema,
  });

export const restoreTemplate = (id: string) =>
  apiRequest(withId(E.restoreTemplate.path, id), {
    method: "POST",
    body: {},
    schema: E.restoreTemplate.schema,
  });

export const deleteTemplate = (id: string) =>
  apiRequest(withId(E.template.path, id), { method: "DELETE", schema: z.undefined() });

export const saveTemplateDraft = (id: string, input: TemplateDraftInput) =>
  apiRequest(withId(E.saveDraft.path, id), {
    method: "POST",
    body: input,
    schema: E.saveDraft.schema,
  });

export const publishTemplate = (id: string, input: TemplatePublishInput) =>
  apiRequest(withId(E.publish.path, id), { method: "POST", body: input, schema: E.publish.schema });

export const submitTemplate = (id: string, input: TemplatePublishInput) =>
  apiRequest(withId(E.submitTemplate.path, id), {
    method: "POST",
    body: input,
    schema: E.submitTemplate.schema,
  });

export const sendBackTemplate = (id: string, input: ReviewSendBackInput) =>
  apiRequest(withId(E.sendBackTemplate.path, id), {
    method: "POST",
    body: input,
    schema: E.sendBackTemplate.schema,
  });

export const createTemplate = (input: NewTemplateInput) =>
  apiRequest(E.createTemplate.path, {
    method: "POST",
    body: input,
    schema: E.createTemplate.schema,
  });

export const generateTemplate = (input: RoadmapGenerateInput) =>
  apiRequest(E.generateTemplate.path, {
    method: "POST",
    body: input,
    schema: E.generateTemplate.schema,
  });

export const fetchTemplateLibrary = (signal?: AbortSignal) =>
  apiRequest(E.library.path, { schema: E.library.schema, signal });
