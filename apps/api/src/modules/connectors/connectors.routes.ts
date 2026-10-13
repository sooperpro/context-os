import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types.js";
import { validationHook } from "../../middleware/validation.js";
import { requireRole } from "../identity/identity.service.js";
import type { createGoogleDriveService } from "./google-drive.js";

export function createConnectorRoutes(drive: ReturnType<typeof createGoogleDriveService>) {
  return new Hono<AppEnv>()
    .get("/connectors", (c) => c.json({ items: drive.list(c.get("actor")) }))
    .post("/connectors/google-drive/authorize", (c) => c.json(drive.authorize(c.get("actor"))))
    .get(
      "/connectors/google-drive/callback",
      zValidator(
        "query",
        z.object({ state: z.string().min(32).max(200), code: z.string().min(1).max(4000) }),
        validationHook,
      ),
      async (c) =>
        c.json(await drive.callback(c.req.valid("query").state, c.req.valid("query").code)),
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
    .post(
      "/connectors/:id/import",
      zValidator(
        "json",
        z
          .object({ projectId: z.uuid(), fileId: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/) })
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
          ),
          201,
        );
      },
    )
    .delete("/connectors/:id", async (c) => {
      await drive.disconnect(c.get("actor"), c.req.param("id"));
      return c.body(null, 204);
    });
}
