import {
  ReviewSendBackInputSchema,
  TutorialAssignInputSchema,
  TutorialAssignmentSchema,
  TutorialCreateInputSchema,
  TutorialDetailSchema,
  TutorialListSchema,
  TutorialPublishInputSchema,
  TutorialRegenerateInputSchema,
  TutorialUpdateInputSchema,
  type ReviewSendBackInput,
  type TutorialAssignInput,
  type TutorialCreateInput,
  type TutorialDetail,
  type TutorialPublishInput,
  type TutorialUpdateInput,
} from "@contextos/shared";
import type { z } from "zod";
import { apiRequest } from "@/lib/api-client";

/**
 * Tutorial Studio, served by the API (apps/api/src/modules/learning/tutorials.routes.ts): admins
 * and People Ops draft tutorials from a project's knowledge, review them, and publish versions.
 * Contracts: packages/shared/src/schemas/tutorials.ts.
 */
export const TUTORIAL_ENDPOINTS = {
  list: { path: "/v1/tutorials", schema: TutorialListSchema },
  detail: { path: "/v1/tutorials/:id", schema: TutorialDetailSchema },
  create: { path: "/v1/tutorials", schema: TutorialDetailSchema, input: TutorialCreateInputSchema },
  update: {
    path: "/v1/tutorials/:id",
    schema: TutorialDetailSchema,
    input: TutorialUpdateInputSchema,
  },
  regenerate: {
    path: "/v1/tutorials/:id/regenerate",
    schema: TutorialDetailSchema,
    input: TutorialRegenerateInputSchema,
  },
  publish: {
    path: "/v1/tutorials/:id/publish",
    schema: TutorialDetailSchema,
    input: TutorialPublishInputSchema,
  },
  /** Path curators and managers send their draft to People Ops instead of publishing it. */
  submit: { path: "/v1/tutorials/:id/submit", schema: TutorialDetailSchema },
  sendBack: {
    path: "/v1/tutorials/:id/send-back",
    schema: TutorialDetailSchema,
    input: ReviewSendBackInputSchema,
  },
  archive: { path: "/v1/tutorials/:id/archive", schema: TutorialDetailSchema },
  assign: {
    path: "/v1/tutorials/:id/assign",
    schema: TutorialAssignmentSchema,
    input: TutorialAssignInputSchema,
  },
} as const;

const E = TUTORIAL_ENDPOINTS;
const withId = (path: string, id: string) => path.replace(":id", encodeURIComponent(id));

export const fetchTutorials = (signal?: AbortSignal) =>
  apiRequest(E.list.path, { schema: E.list.schema, signal });

export const fetchTutorial = (id: string, signal?: AbortSignal): Promise<TutorialDetail> =>
  apiRequest(withId(E.detail.path, id), { schema: E.detail.schema, signal });

export const createTutorial = (input: TutorialCreateInput) =>
  apiRequest(E.create.path, { method: "POST", body: input, schema: E.create.schema });

export const updateTutorial = (id: string, input: TutorialUpdateInput) =>
  apiRequest(withId(E.update.path, id), { method: "PATCH", body: input, schema: E.update.schema });

export const regenerateTutorial = (
  id: string,
  input: z.input<typeof TutorialRegenerateInputSchema>,
) =>
  apiRequest(withId(E.regenerate.path, id), {
    method: "POST",
    body: input,
    schema: E.regenerate.schema,
  });

export const publishTutorial = (id: string, input: TutorialPublishInput) =>
  apiRequest(withId(E.publish.path, id), { method: "POST", body: input, schema: E.publish.schema });

export const submitTutorial = (id: string) =>
  apiRequest(withId(E.submit.path, id), { method: "POST", body: {}, schema: E.submit.schema });

export const sendBackTutorial = (id: string, input: ReviewSendBackInput) =>
  apiRequest(withId(E.sendBack.path, id), {
    method: "POST",
    body: input,
    schema: E.sendBack.schema,
  });

export const archiveTutorial = (id: string) =>
  apiRequest(withId(E.archive.path, id), { method: "POST", body: {}, schema: E.archive.schema });

export const assignTutorial = (id: string, input: TutorialAssignInput) =>
  apiRequest(withId(E.assign.path, id), { method: "POST", body: input, schema: E.assign.schema });
