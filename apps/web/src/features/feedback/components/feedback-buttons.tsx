import type { FeedbackKind, FeedbackTarget } from "@contextos/shared";
import { FlagIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCreateFeedback } from "@/features/feedback/api/feedback.queries";

interface FeedbackButtonsProps {
  projectId: string;
  targetType: FeedbackTarget;
  targetId: string;
}

const OPTIONS: Array<{ kind: FeedbackKind; label: string }> = [
  { kind: "correct", label: "Correct" },
  { kind: "incorrect", label: "Incorrect" },
  { kind: "outdated", label: "Outdated" },
  { kind: "missing_context", label: "Missing context" },
  { kind: "conflicting", label: "Conflicting sources" },
];

/** "Flag" affordance: one click reveals the feedback kinds from the design rules. */
export function FeedbackButtons({ projectId, targetType, targetId }: FeedbackButtonsProps) {
  const [open, setOpen] = useState(false);
  const feedback = useCreateFeedback(projectId);

  if (!open) {
    return (
      <Button variant="ghost" size="xs" onClick={() => setOpen(true)}>
        <FlagIcon aria-hidden />
        Flag
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Feedback">
      {OPTIONS.map((option) => (
        <Button
          key={option.kind}
          variant="outline"
          size="xs"
          disabled={feedback.isPending}
          onClick={() =>
            feedback.mutate(
              { targetType, targetId, kind: option.kind },
              {
                onSuccess: () => {
                  toast.success("Thanks, feedback recorded");
                  setOpen(false);
                },
              },
            )
          }
        >
          {option.label}
        </Button>
      ))}
      <Button variant="ghost" size="xs" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}
