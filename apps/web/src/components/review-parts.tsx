import type { ReviewState } from "@contextos/shared";
import { useId, useState } from "react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PendingIcon, RateReviewIcon, UndoIcon } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatRelativeTime } from "@/lib/format";

/*
 * The review queue for generated learning (N-18): managers and path curators submit drafts, and
 * Owner, Admin or HR publish them or send them back with a note.
 */

/** Where a draft is in review, worded for the reviewer or for whoever submitted it. */
export function ReviewBanner({
  review,
  reviewer,
  what,
  onSendBack,
}: {
  review: ReviewState | null;
  reviewer: boolean;
  /** "template" or "tutorial". */
  what: string;
  onSendBack: () => void;
}) {
  if (!review) return null;
  const who = review.by?.name ?? "Someone";
  const when = formatRelativeTime(review.at).toLowerCase();
  if (review.state === "in_review")
    return reviewer ? (
      <Banner
        tone="info"
        icon={<RateReviewIcon aria-hidden />}
        title={`${who} submitted this ${what} for review ${when}`}
        description={
          review.note ?? "Check it, then publish it or send it back with what to change."
        }
        actions={
          <Button size="xs" variant="outline" onClick={onSendBack}>
            <UndoIcon aria-hidden /> Send back
          </Button>
        }
      />
    ) : (
      <Banner
        tone="info"
        icon={<PendingIcon aria-hidden />}
        title="Waiting for People Ops"
        description={`Submitted ${when}. HR, an admin or the owner publishes it or sends it back with a note.`}
      />
    );
  return (
    <Banner
      tone={reviewer ? "neutral" : "warning"}
      icon={<UndoIcon aria-hidden />}
      title={`${who} sent this ${what} back ${when}`}
      description={
        reviewer ? review.note : `${review.note ?? ""} Make the changes, then submit it again.`
      }
    />
  );
}

/** Ask what should change before a draft goes back to whoever submitted it. */
export function SendBackDialog({
  open,
  pending,
  onOpenChange,
  onSendBack,
}: {
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSendBack: (note: string) => void;
}) {
  const noteId = useId();
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            if (note.trim()) onSendBack(note.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle>Send it back?</DialogTitle>
            <DialogDescription>
              They’re notified with your note, and can submit it again once it’s fixed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={noteId}>What should change?</Label>
            <Textarea
              id={noteId}
              rows={3}
              value={note}
              maxLength={1000}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !note.trim()}>
              Send back
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
