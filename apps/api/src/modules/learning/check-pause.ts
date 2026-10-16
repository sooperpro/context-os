import type { Db } from "../../db/index.js";
import { AppError } from "../../lib/errors.js";
import type { Actor } from "../../types.js";
import { workspaceSettings } from "../platform/settings.js";
import { createPlatformStore } from "../platform/store.js";

/** How long an open knowledge check keeps Context Bot paused when it is never submitted. */
const PAUSE_MS = 30 * 60_000;
const KIND = "check_session";

/**
 * Context Bot pauses for a learner while their knowledge check is open, when the workspace's AI
 * setting "pause during checks" is on (the default): from opening the check until they submit it,
 * or 30 minutes at most so an abandoned check doesn't lock them out.
 */
export function createCheckPause(db: Db) {
  const store = createPlatformStore(db);
  const enabled = (actor: Actor) =>
    workspaceSettings(db, actor.workspaceId).ai.rules.pause_during_checks;
  const openRows = (actor: Actor) =>
    store.listWhere(actor.workspaceId, KIND, { ownerId: actor.id, status: "open" }, 10);
  const pausedUntil = (actor: Actor): Date | null => {
    if (!enabled(actor)) return null;
    const ends = openRows(actor)
      .map((row) => Date.parse(String(row.data.openedAt)) + PAUSE_MS)
      .filter((end) => end > Date.now());
    return ends.length ? new Date(Math.max(...ends)) : null;
  };
  return {
    /** The learner opened a check. */
    open(actor: Actor, checkId: string) {
      if (!enabled(actor)) return;
      const data = { checkId, openedAt: new Date().toISOString() };
      const [row] = openRows(actor);
      if (row) store.patch(row, { data });
      else
        store.insert({
          workspaceId: actor.workspaceId,
          ownerId: actor.id,
          kind: KIND,
          status: "open",
          data,
        });
    },
    /** The learner submitted their answers. */
    close(actor: Actor) {
      for (const row of openRows(actor)) store.patch(row, { status: "closed" });
    },
    pausedUntil,
    assertNotPaused(actor: Actor) {
      const until = pausedUntil(actor);
      if (until)
        throw new AppError(
          409,
          "CONFLICT",
          "Context Bot is paused while your knowledge check is open. Submit your answers to ask again.",
          { pausedUntil: until.toISOString() },
        );
    },
  };
}
export type CheckPause = ReturnType<typeof createCheckPause>;
