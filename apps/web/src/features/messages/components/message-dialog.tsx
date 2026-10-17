import type { DirectMessageInput } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { findMemberByName, useSendMessage } from "@/features/messages/api/messages.api";
import { firstName } from "@/lib/format";

/** Who to message: an account id when the page has one, otherwise just their name. */
export interface MessageRecipient {
  id?: string;
  name: string;
}

const LIMIT = 1000;

/**
 * Message a colleague (ALL-3): it reaches their notifications in ContextOS and their email, with a
 * link to what it's about. Opened from the Message buttons on profiles, Home, roadmaps, lessons,
 * answers and Hub items.
 */
export function MessageDialog({
  to,
  about,
  onClose,
}: {
  to: MessageRecipient | null;
  about?: DirectMessageInput["about"];
  onClose: () => void;
}) {
  return (
    <Dialog open={to !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        {/* Mounted while open, so every message starts blank. */}
        {to ? <MessageForm to={to} about={about} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function MessageForm({
  to,
  about,
  onClose,
}: {
  to: MessageRecipient;
  about?: DirectMessageInput["about"];
  onClose: () => void;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const send = useSendMessage();
  // People the Hub knows only by name are matched to a member with exactly that name.
  const lookup = useQuery({
    queryKey: ["messages", "recipient", to.name],
    queryFn: ({ signal }) => findMemberByName(to.name, signal),
    enabled: !to.id,
    staleTime: 5 * 60_000,
  });
  const personId = to.id ?? lookup.data?.id;
  const first = firstName(to.name);
  const unknown = !to.id && lookup.isSuccess && !lookup.data;

  let body: ReactNode;
  if (!to.id && lookup.isPending)
    body = <p className="text-sm text-on-surface-variant">Finding {first}…</p>;
  else if (unknown || lookup.isError)
    body = (
      <p className="text-sm text-on-surface-variant">
        {to.name} isn't in ContextOS yet, so they can't get messages here.
      </p>
    );
  else
    body = (
      <div className="space-y-2">
        <Label htmlFor={`${id}-text`}>Message</Label>
        <Textarea
          id={`${id}-text`}
          rows={5}
          maxLength={LIMIT}
          autoFocus
          placeholder={about ? `Ask ${first} about ${about.title}…` : `Write to ${first}…`}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <p className="text-right text-xs text-on-surface-variant tabular-nums">
          {text.length}/{LIMIT}
        </p>
      </div>
    );

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!personId) return;
        send.mutate(
          { personId, text: text.trim(), ...(about ? { about } : {}) },
          {
            onSuccess: (result) => {
              toast.success(
                result.inApp || result.emailed
                  ? `Sent to ${first}${result.emailed ? ", with an email copy" : ""}`
                  : `${first} has turned off notifications, so it may not reach them`,
              );
              onClose();
            },
            onError: (error) => toast.error(error.message),
          },
        );
      }}
    >
      <DialogHeader>
        <DialogTitle>Message {to.name}</DialogTitle>
        <DialogDescription>
          {about ? (
            <>
              About <b className="font-medium">{about.title}</b>.{" "}
            </>
          ) : null}
          It reaches {first} in ContextOS and by email.
        </DialogDescription>
      </DialogHeader>
      {body}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!personId || !text.trim() || send.isPending}>
          Send
        </Button>
      </DialogFooter>
    </form>
  );
}
