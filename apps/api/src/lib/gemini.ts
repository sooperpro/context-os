import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { AppError, UpstreamServiceError } from "./errors.js";
import type { Logger } from "./logger.js";
import { withRetry } from "./retry.js";

export interface StructuredGenerationRequest<TSchema extends z.ZodType> {
  /** Zod schema describing the JSON the model must return. */
  schema: TSchema;
  prompt: string;
  systemInstruction?: string;
  /** 0 = deterministic, 1 = creative. Defaults to 0.2 for analysis-style tasks. */
  temperature?: number;
  /** Tag for logging/evaluation (e.g. "extract_context", "ask"). */
  purpose?: string;
}

export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/**
 * Thin, testable abstraction over the Gemini SDK. Services depend on this
 * interface so tests can swap in a fake without touching the network.
 */
export interface GeminiClient {
  readonly model: string;
  readonly embeddingModel: string;
  generateStructured<TSchema extends z.ZodType>(
    request: StructuredGenerationRequest<TSchema>,
  ): Promise<z.output<TSchema>>;
  /** Embed texts for retrieval. Returns one vector per input, in order. */
  embed(texts: string[], taskType: EmbeddingTaskType): Promise<number[][]>;
}

export interface GeminiClientOptions {
  apiKey: string;
  model: string;
  embeddingModel: string;
  embeddingDimensions: number;
  logger?: Logger;
}

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const EMBED_BATCH_SIZE = 16;

export function createGeminiClient({
  apiKey,
  model,
  embeddingModel,
  embeddingDimensions,
  logger,
}: GeminiClientOptions): GeminiClient {
  const ai = new GoogleGenAI({ apiKey });

  const retryOptions = (purpose: string) => ({
    attempts: 3,
    shouldRetry: (error: unknown) =>
      error instanceof ApiError && RETRYABLE_STATUSES.has(error.status),
    onRetry: (error: unknown, attempt: number, delayMs: number) =>
      logger?.warn({ err: error, attempt, delayMs, purpose }, "Retrying Gemini request"),
  });

  const toUpstreamError = (error: unknown, what: string): UpstreamServiceError => {
    if (error instanceof ApiError) {
      return new UpstreamServiceError(
        `${what} failed with status ${error.status}`,
        { status: error.status },
        { cause: error },
      );
    }
    return new UpstreamServiceError(`${what} failed`, undefined, { cause: error });
  };

  return {
    model,
    embeddingModel,

    async generateStructured({
      schema,
      prompt,
      systemInstruction,
      temperature = 0.2,
      purpose = "generate",
    }) {
      // Zod 4 emits JSON Schema directly; Gemini accepts a JSON Schema subset via
      // `responseJsonSchema`. The `$schema` keyword is dropped as it is noise for the API.
      const { $schema: _ignored, ...responseJsonSchema } = z.toJSONSchema(schema);
      const startedAt = performance.now();

      let text: string | undefined;
      try {
        const response = await withRetry(
          () =>
            ai.models.generateContent({
              model,
              contents: prompt,
              config: {
                responseMimeType: "application/json",
                responseJsonSchema,
                systemInstruction,
                temperature,
              },
            }),
          retryOptions(purpose),
        );
        text = response.text;
        logger?.debug(
          {
            purpose,
            model,
            durationMs: Math.round(performance.now() - startedAt),
            usage: response.usageMetadata,
          },
          "Gemini generateContent",
        );
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw toUpstreamError(error, `Gemini ${purpose}`);
      }

      if (!text) {
        throw new UpstreamServiceError(`Gemini ${purpose} returned an empty response`);
      }

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch (error) {
        throw new UpstreamServiceError(`Gemini ${purpose} returned invalid JSON`, undefined, {
          cause: error,
        });
      }

      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        throw new UpstreamServiceError(
          `Gemini ${purpose} response did not match the expected schema`,
          { issues: parsed.error.issues },
        );
      }
      return parsed.data;
    },

    async embed(texts, taskType) {
      if (texts.length === 0) return [];
      const vectors: number[][] = [];
      for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
        const batch = texts.slice(start, start + EMBED_BATCH_SIZE);
        try {
          const response = await withRetry(
            () =>
              ai.models.embedContent({
                model: embeddingModel,
                contents: batch,
                config: { taskType, outputDimensionality: embeddingDimensions },
              }),
            retryOptions("embed"),
          );
          const embeddings = response.embeddings ?? [];
          if (embeddings.length !== batch.length) {
            throw new UpstreamServiceError(
              `Gemini embed returned ${embeddings.length} vectors for ${batch.length} inputs`,
            );
          }
          for (const embedding of embeddings) {
            vectors.push(embedding.values ?? []);
          }
        } catch (error) {
          if (error instanceof AppError) throw error;
          throw toUpstreamError(error, "Gemini embed");
        }
      }
      return vectors;
    },
  };
}
