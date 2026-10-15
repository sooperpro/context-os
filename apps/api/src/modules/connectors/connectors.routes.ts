import {
  ConnectorProviderSchema,
  ConnectorScopesInputSchema,
  ConnectorSyncInputSchema,
  DisconnectModeSchema,
  ScopeVisibilitySchema,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { AppEnv } from "../../types.js";
import { requireRole } from "../identity/identity.service.js";
import type { createGoogleDriveService } from "./google-drive.js";

export function createConnectorRoutes(
  drive: ReturnType<typeof createGoogleDriveService>,
  frontendOrigin: string,
) {
  const setupRedirect = (status: "connected" | "error") => {
    const url = new URL("/setup", frontendOrigin);
    url.searchParams.set("google_drive", status);
    return url.toString();
  };

  return new Hono<AppEnv>()
    .get("/connectors", (c) => c.json({ items: drive.list(c.get("actor")) }))
    .post(
      "/connectors/:provider/authorize",
      zValidator(
        "param",
        z.object({
          // Accept the hyphenated path form (`google-drive`) as well as the enum value.
          provider: z
            .string()
            .max(50)
            .transform((value) => value.replaceAll("-", "_"))
            .pipe(ConnectorProviderSchema),
        }),
        validationHook,
      ),
      (c) => {
        requireRole(c.get("actor"), "owner", "admin", "manager", "hr", "member");
        if (c.req.valid("param").provider !== "google_drive")
          throw new AppError(
            503,
            "NOT_CONFIGURED",
            "This connector is not available yet; Google Drive is the only implemented provider",
          );
        return c.json(drive.authorize(c.get("actor")));
      },
    )
    .get(
      "/connectors/google-drive/callback",
      zValidator(
        "query",
        z.object({
          state: z.string().min(32).max(200),
          // Google sends `error` instead of `code` when the user cancels consent.
          code: z.string().min(1).max(4000).optional(),
          error: z.string().max(200).optional(),
        }),
        validationHook,
      ),
      async (c) => {
        try {
          const query = c.req.valid("query");
          if (!query.code) return c.redirect(setupRedirect("error"), 302);
          await drive.callback(query.state, query.code);
          return c.redirect(setupRedirect("connected"), 302);
        } catch {
          // OAuth callbacks are opened in a browser tab. Return the user to Setup for both
          // successful and failed grants instead of rendering an API response in that tab.
          return c.redirect(setupRedirect("error"), 302);
        }
      },
    )
    .get(
      "/connectors/:id/files",
      zValidator(
        "query",
        z.object({
          pageToken: z.string().max(2000).optional(),
          folderId: z.string().max(200).optional(),
        }),
        validationHook,
      ),
      async (c) =>
        c.json(
          await drive.files(
            c.get("actor"),
            c.req.param("id"),
            c.req.valid("query").pageToken,
            c.req.valid("query").folderId,
          ),
        ),
    )
    .get(
      "/connectors/:id/scopes",
      zValidator("query", z.object({ pageToken: z.string().max(2000).optional() }), validationHook),
      async (c) =>
        c.json(
          await drive.listScopes(c.get("actor"), c.req.param("id"), c.req.valid("query").pageToken),
        ),
    )
    .put(
      "/connectors/:id/scopes",
      zValidator("json", ConnectorScopesInputSchema, validationHook),
      (c) => c.json(drive.setScopes(c.get("actor"), c.req.param("id"), c.req.valid("json"))),
    )
    .post(
      "/connectors/:id/sync",
      zValidator("json", ConnectorSyncInputSchema.optional(), validationHook),
      (c) =>
        c.json(
          drive.requestSync(c.get("actor"), c.req.param("id"), c.req.valid("json")?.scopeId),
          202,
        ),
    )
    .post(
      "/connectors/:id/import",
      zValidator(
        "json",
        z
          .object({
            projectId: z.uuid(),
            fileId: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/),
            visibility: ScopeVisibilitySchema.optional(),
          })
          .strict(),
        validationHook,
      ),
      async (c) => {
        requireRole(c.get("actor"), "owner", "admin", "manager");
        return c.json(
          await drive.importFile(
            c.get("actor"),
            c.req.param("id"),
            c.req.valid("json").projectId,
            c.req.valid("json").fileId,
            undefined,
            c.req.valid("json").visibility,
          ),
          201,
        );
      },
    )
    .delete(
      "/connectors/:id",
      zValidator(
        "query",
        z.object({ mode: DisconnectModeSchema.default("purge") }),
        validationHook,
      ),
      async (c) => {
        await drive.disconnect(c.get("actor"), c.req.param("id"), c.req.valid("query").mode);
        return c.body(null, 204);
      },
    );
}
