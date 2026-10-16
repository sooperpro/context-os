import type { PersonRef, ReviewState } from "@contextos/shared";
import type { Actor } from "../../types.js";

/*
 * Who publishes generated learning (N-18 Phase 6). Owner, Admin and HR publish templates and
 * tutorials directly: their publish is the review. Managers and path curators make drafts, then
 * submit them; a reviewer publishes the draft or sends it back with a note.
 */

export const REVIEWERS = ["owner", "admin", "hr"] as const;

export const isReviewer = (actor: Pick<Actor, "role">) =>
  (REVIEWERS as readonly string[]).includes(actor.role);

/** Stored on the template or tutorial record while a draft is in review or sent back. */
export interface ReviewData {
  state: ReviewState["state"];
  /** The submitter (in review), or the reviewer who sent it back. */
  by: string;
  at: string;
  note: string | null;
}

export const reviewView = (
  review: ReviewData | null | undefined,
  person: (userId: string) => PersonRef | null,
): ReviewState | null =>
  review ? { state: review.state, note: review.note, by: person(review.by), at: review.at } : null;
