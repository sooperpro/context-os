import {
  AddCourseInputSchema,
  CheckAttemptInputSchema,
  CheckResultSchema,
  CourseDetailSchema,
  KnowledgeCheckSchema,
  LearningRatingInputSchema,
  LearningRatingSchema,
  LearningRequestInputSchema,
  LearningRequestSchema,
  LessonCompletionInputSchema,
  LessonCompletionSchema,
  LessonSchema,
  ModuleDetailSchema,
  MyLearningSchema,
  MyRoadmapSchema,
  type CheckAttemptInput,
  type CheckResult,
  type CourseDetail,
  type KnowledgeCheck,
  type LearningRatingInput,
  type LearningRequest,
  type LearningRequestInput,
  type Lesson,
  type LessonCompletion,
  type ModuleDetail,
  type MyLearning,
  type MyRoadmap,
} from "@contextos/shared";
import { z } from "zod";
import { apiRequest } from "@/lib/api-client";

/**
 * The learner's onboarding endpoints: My learning (`/v1/me/learning`), and the roadmap, modules,
 * lessons and checks built from published tutorials (apps/api/src/modules/learning/learner.routes.ts).
 * Tests use the fixtures in src/mocks/learning.ts. Contracts: packages/shared/src/schemas/learning.ts.
 */
export const LEARNING_ENDPOINTS = {
  roadmap: { path: "/v1/me/roadmap", schema: MyRoadmapSchema },
  module: { path: "/v1/me/modules/:id", schema: ModuleDetailSchema },
  lesson: { path: "/v1/me/lessons/:id", schema: LessonSchema },
  completeLesson: {
    path: "/v1/me/lessons/:id/complete",
    schema: LessonCompletionSchema,
    input: LessonCompletionInputSchema,
  },
  check: { path: "/v1/me/checks/:id", schema: KnowledgeCheckSchema },
  attempt: {
    path: "/v1/me/checks/:id/attempts",
    schema: CheckResultSchema,
    input: CheckAttemptInputSchema,
  },
  rating: {
    path: "/v1/me/learning-ratings",
    schema: LearningRatingSchema,
    input: LearningRatingInputSchema,
  },
  request: {
    path: "/v1/me/learning-requests",
    schema: LearningRequestSchema,
    input: LearningRequestInputSchema,
  },
  myLearning: { path: "/v1/me/learning", schema: MyLearningSchema },
  addCourse: {
    path: "/v1/me/learning/:id/add",
    schema: MyLearningSchema,
    input: AddCourseInputSchema,
  },
  course: { path: "/v1/me/learning/:id", schema: CourseDetailSchema },
} as const;

const E = LEARNING_ENDPOINTS;
const withId = (path: string, id: string) => path.replace(":id", encodeURIComponent(id));

export const fetchRoadmap = (signal?: AbortSignal): Promise<MyRoadmap> =>
  apiRequest(E.roadmap.path, { schema: E.roadmap.schema, signal });

export const fetchModule = (id: string, signal?: AbortSignal): Promise<ModuleDetail> =>
  apiRequest(withId(E.module.path, id), { schema: E.module.schema, signal });

export const fetchLesson = (id: string, signal?: AbortSignal): Promise<Lesson> =>
  apiRequest(withId(E.lesson.path, id), { schema: E.lesson.schema, signal });

export const completeLesson = (id: string): Promise<LessonCompletion> =>
  apiRequest(withId(E.completeLesson.path, id), {
    method: "POST",
    body: {},
    schema: E.completeLesson.schema,
  });

export const fetchCheck = (id: string, signal?: AbortSignal): Promise<KnowledgeCheck> =>
  apiRequest(withId(E.check.path, id), { schema: E.check.schema, signal });

export const submitCheckAttempt = (id: string, input: CheckAttemptInput): Promise<CheckResult> =>
  apiRequest(withId(E.attempt.path, id), { method: "POST", body: input, schema: E.attempt.schema });

export const rateLearning = (input: LearningRatingInput) =>
  apiRequest(E.rating.path, { method: "POST", body: input, schema: E.rating.schema });

export const sendLearningRequest = (input: LearningRequestInput): Promise<LearningRequest> =>
  apiRequest(E.request.path, { method: "POST", body: input, schema: E.request.schema });

export const fetchMyLearning = (signal?: AbortSignal): Promise<MyLearning> =>
  apiRequest(E.myLearning.path, { schema: E.myLearning.schema, signal });

export const addCourse = (id: string): Promise<MyLearning> =>
  apiRequest(withId(E.addCourse.path, id), {
    method: "POST",
    body: {},
    schema: E.addCourse.schema,
  });

export const fetchCourse = (id: string, signal?: AbortSignal): Promise<CourseDetail> =>
  apiRequest(withId(E.course.path, id), { schema: E.course.schema, signal });

/** A step on one item of an assigned course. Steps after "start" carry the progress version. */
export type CourseStep = "start" | "attest" | "signoff/request" | "skip" | "dwell";

/** The response is the raw progress record; callers refetch the course instead of reading it. */
export const takeCourseStep = (input: {
  assignmentId: string;
  itemId: string;
  step: CourseStep;
  version: number | null;
}) =>
  apiRequest(
    `/v1/learning/assignments/${encodeURIComponent(input.assignmentId)}/items/${encodeURIComponent(input.itemId)}/${input.step}`,
    {
      method: "POST",
      body: input.version === null ? undefined : { version: input.version },
      schema: z.unknown(),
    },
  );
