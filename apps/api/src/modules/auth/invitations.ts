import { eq } from "drizzle-orm";
import type { Container } from "../../container.js";
import { workspaces } from "../../db/schema.js";
import { UpstreamServiceError } from "../../lib/errors.js";
import { linkEmail } from "../../lib/mailer.js";
import type { Actor } from "../../types.js";
import { publicOrigin } from "./auth.js";

/**
 * Email an invitation to join the actor's workspace. Accepting is signing in with that address (magic
 * link, Google, Microsoft or SSO): the pending invitation then becomes a membership with its role.
 * Development mode has no sign-in, so nothing is sent there.
 */
export async function sendInvitationEmail(
  container: Container,
  actor: Actor,
  email: string,
): Promise<"email" | "local"> {
  const { db, env, mailer, logger } = container;
  if (!container.identity.auth) return "local";
  const workspace = db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, actor.workspaceId))
    .get();
  const url = new URL("/", publicOrigin(env));
  url.searchParams.set("email", email);
  try {
    await mailer.send(
      linkEmail({
        to: email,
        subject: `${actor.name} invited you to ${workspace?.name ?? "a workspace"} on ContextOS`,
        intro: `${actor.name} invited you to join ${workspace?.name ?? "their workspace"} on ContextOS.`,
        action: "Accept invitation",
        url: url.toString(),
        outro: `Sign in with ${email} to join. The invitation expires in 14 days.`,
      }),
    );
  } catch (error) {
    logger.error({ err: error }, "Invitation email could not be sent");
    throw new UpstreamServiceError("The invitation email could not be sent. Try again shortly.");
  }
  return "email";
}
