import type { LearningRequestInput, PersonRef } from "@contextos/shared";
import { useId, useState } from "react";
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
import { PersonIcon } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import { OptionList, OptionTile } from "@/components/ui/option-tile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLearningRequest } from "@/features/learning/api/learning.queries";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function useSend(onDone: () => void, success: (recipient: PersonRef) => string) {
  const request = useLearningRequest();
  const send = (input: LearningRequestInput) =>
    request.mutate(input, {
      onSuccess: (result) => {
        toast.success(success(result.recipient));
        onDone();
      },
      onError: () => toast.error("The request could not be sent. Please try again."),
    });
  return { send, pending: request.isPending };
}

/** "Request clarification": a question about a module or lesson, sent to the module owner. */
export function ClarificationDialog({
  open,
  onOpenChange,
  moduleId,
  topics,
  owner,
}: DialogProps & {
  moduleId: string | null;
  /** What it can be about: the module and its lessons. */
  topics: Array<{ id: string; label: string; lessonId: string | null }>;
  owner: PersonRef | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open ? (
          <ClarificationForm
            moduleId={moduleId}
            topics={topics}
            owner={owner}
            close={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ClarificationForm({
  moduleId,
  topics,
  owner,
  close,
}: {
  moduleId: string | null;
  topics: Array<{ id: string; label: string; lessonId: string | null }>;
  owner: PersonRef | null;
  close: () => void;
}) {
  const ids = { about: useId(), question: useId() };
  const options = [
    ...topics,
    { id: "other", label: "Something else on my roadmap", lessonId: null },
  ];
  const [about, setAbout] = useState(options[0]?.id ?? "other");
  const [message, setMessage] = useState("");
  const { send, pending } = useSend(
    close,
    (recipient) => `Sent to ${recipient.name}. You’ll see the reply in Contributions.`,
  );
  const items = Object.fromEntries(options.map((option) => [option.id, option.label]));

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        const topic = options.find((option) => option.id === about);
        send({
          type: "clarification",
          moduleId: about === "other" ? null : moduleId,
          lessonId: topic?.lessonId ?? null,
          changeKind: null,
          message,
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>Request clarification</DialogTitle>
        <DialogDescription>Ask the owner about something that isn’t clear.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.about}>About</Label>
        <Select items={items} value={about} onValueChange={(value) => setAbout(String(value))}>
          <SelectTrigger id={ids.about} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.question}>What’s unclear?</Label>
        <Textarea
          id={ids.question}
          rows={3}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="e.g. I don’t follow how dual-write is verified before cutover"
        />
      </div>
      <p className="flex items-start gap-1.5 text-xs text-on-surface-variant">
        <PersonIcon className="mt-px size-4 shrink-0" aria-hidden />
        {owner
          ? `Goes to ${owner.name}, the module owner. Answers are added to the module so the next person benefits.`
          : "Goes to the module owner. Answers are added to the module so the next person benefits."}
      </p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={!message.trim() || pending}>
          Send request
        </Button>
      </DialogFooter>
    </form>
  );
}

const CHANGES = [
  {
    value: "due_date",
    title: "Move a due date",
    description: "For example, more time for a practical task",
  },
  {
    value: "swap_module",
    title: "Swap or skip a module",
    description: "You already know the material",
  },
  {
    value: "add_topic",
    title: "Add a topic",
    description: "Something you need that isn’t covered",
  },
] as const;

/** "Request a roadmap change": sent to the manager who owns the roadmap. */
export function RoadmapChangeDialog({
  open,
  onOpenChange,
  manager,
}: DialogProps & { manager: PersonRef | null }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open ? <RoadmapChangeForm manager={manager} close={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function RoadmapChangeForm({ manager, close }: { manager: PersonRef | null; close: () => void }) {
  const detailsId = useId();
  const [kind, setKind] = useState<(typeof CHANGES)[number]["value"]>("due_date");
  const [message, setMessage] = useState("");
  const { send, pending } = useSend(
    close,
    (recipient) =>
      `“${CHANGES.find((change) => change.value === kind)?.title}” request sent to ${recipient.name}`,
  );

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        send({ type: "roadmap_change", moduleId: null, lessonId: null, changeKind: kind, message });
      }}
    >
      <DialogHeader>
        <DialogTitle>Request a roadmap change</DialogTitle>
        <DialogDescription>What would you like to change?</DialogDescription>
      </DialogHeader>
      <OptionList aria-label="Change">
        {CHANGES.map((change) => (
          <OptionTile
            key={change.value}
            input={
              <input
                type="radio"
                name="change"
                value={change.value}
                checked={kind === change.value}
                onChange={() => setKind(change.value)}
              />
            }
            title={change.title}
            description={change.description}
          />
        ))}
      </OptionList>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={detailsId}>Details</Label>
        <Textarea
          id={detailsId}
          rows={3}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      </div>
      <p className="flex items-start gap-1.5 text-xs text-on-surface-variant">
        <PersonIcon className="mt-px size-4 shrink-0" aria-hidden />
        {manager
          ? `${manager.name}, your manager, reviews roadmap changes.`
          : "Your manager reviews roadmap changes."}
      </p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={!message.trim() || pending}>
          {manager ? `Send to ${manager.name.split(" ")[0]}` : "Send request"}
        </Button>
      </DialogFooter>
    </form>
  );
}
