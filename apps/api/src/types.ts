import type { RequestIdVariables } from "hono/request-id";
import type { SystemRole } from "@contextos/shared";
import type { ProjectRow } from "./db/schema.js";

/** Who is acting. Resolved by middleware; replace with a real identity provider later. */
export interface Actor {
  id: string;
  name: string;
  workspaceId: string;
  role: SystemRole;
  sessionId?: string;
}

/** Hono environment shared by every route and middleware in the app. */
export type AppEnv = {
  Variables: RequestIdVariables & { actor: Actor };
};

/** Routes under /projects/:projectId have the project pre-loaded and tenant-checked. */
export type ProjectEnv = {
  Variables: AppEnv["Variables"] & { project: ProjectRow };
};
