import { Worker } from "node:worker_threads";
import { z } from "zod";
import { BadRequestError } from "./errors.js";

export interface ParseLimits {
  /** Hard deadline for one document. */
  timeoutMs?: number;
  /** Heap for the parser thread; large PDFs need more than small ones. */
  memoryMb?: number;
}

/** Parse untrusted binary documents outside the HTTP event loop, with a hard deadline. */
export async function parseDocument(
  bytes: Buffer,
  mimeType: string,
  { timeoutMs = 30_000, memoryMb = 128 }: ParseLimits = {},
): Promise<string> {
  if (mimeType !== "application/pdf" && !mimeType.includes("wordprocessingml"))
    return bytes.toString("utf8");
  const extension = import.meta.url.endsWith(".ts") ? "ts" : "js";
  const url = new URL(`./document-worker.${extension}`, import.meta.url);
  return new Promise((resolve, reject) => {
    let settled = false;
    const worker = new Worker(url, {
      workerData: { mimeType, bytes: new Uint8Array(bytes) },
      resourceLimits: { maxOldGenerationSizeMb: memoryMb, maxYoungGenerationSizeMb: 32 },
      execArgv: extension === "ts" ? ["--import", "tsx"] : [],
    });
    const timer = setTimeout(() => {
      settled = true;
      void worker.terminate();
      reject(
        new BadRequestError(
          `Document parsing exceeded the ${Math.round(timeoutMs / 1000)}-second limit`,
        ),
      );
    }, timeoutMs);
    worker.once("message", (message: unknown) => {
      clearTimeout(timer);
      void worker.terminate();
      settled = true;
      const result = z
        .object({ content: z.string().optional(), error: z.string().optional() })
        .safeParse(message);
      if (!result.success || result.data.error || result.data.content === undefined)
        reject(
          new BadRequestError(
            result.success
              ? (result.data.error ?? "Document parsing failed")
              : "Invalid parser output",
          ),
        );
      else resolve(result.data.content);
    });
    worker.once("error", () => {
      settled = true;
      clearTimeout(timer);
      reject(new BadRequestError("Document parsing failed"));
    });
    worker.once("exit", () => {
      clearTimeout(timer);
      if (!settled) reject(new BadRequestError("Document parsing ended without a result"));
    });
  });
}
