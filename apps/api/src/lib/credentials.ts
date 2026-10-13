import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { AppError } from "./errors.js";

const Envelope = z.object({
  v: z.literal(1),
  nonce: z.string(),
  tag: z.string(),
  ciphertext: z.string(),
});
export function sealCredentials(
  value: Record<string, unknown>,
  key: string | undefined,
  binding: string,
): string {
  if (!key)
    throw new AppError(
      503,
      "NOT_CONFIGURED",
      "Configure token encryption before connecting providers",
    );
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), nonce);
  cipher.setAAD(Buffer.from(binding));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return JSON.stringify({
    v: 1,
    nonce: nonce.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });
}
export function openCredentials(
  value: string,
  key: string | undefined,
  binding: string,
): Record<string, unknown> {
  if (!key) throw new AppError(503, "NOT_CONFIGURED", "Token encryption is not configured");
  const envelope = Envelope.parse(JSON.parse(value));
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    Buffer.from(envelope.nonce, "base64"),
  );
  decipher.setAAD(Buffer.from(binding));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  return z
    .record(z.string(), z.unknown())
    .parse(
      JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(envelope.ciphertext, "base64")),
          decipher.final(),
        ]).toString("utf8"),
      ),
    );
}
