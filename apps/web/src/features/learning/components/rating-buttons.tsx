import type { LearningRatingValue } from "@contextos/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ThumbDownFilledIcon,
  ThumbDownIcon,
  ThumbUpFilledIcon,
  ThumbUpIcon,
} from "@/components/ui/icons";
import { useRateLearning } from "@/features/learning/api/learning.queries";

/** "Was this useful?" thumbs (prototype `.fb-row`). The rating goes to the owner. */
export function RatingButtons({
  targetType,
  targetId,
  initial,
  labels,
  ownerName,
}: {
  targetType: "module" | "lesson";
  targetId: string;
  initial: LearningRatingValue | null;
  labels: { up: string; down: string };
  ownerName: string | null;
}) {
  const [value, setValue] = useState(initial);
  const rate = useRateLearning();
  const choose = (next: LearningRatingValue) => {
    const updated = value === next ? null : next;
    setValue(updated);
    rate.mutate({ targetType, targetId, value: updated }, { onError: () => setValue(value) });
  };
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label={`Rate this ${targetType}`}
    >
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={labels.up}
        aria-pressed={value === "up"}
        onClick={() => choose("up")}
      >
        {value === "up" ? <ThumbUpFilledIcon /> : <ThumbUpIcon />}
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={labels.down}
        aria-pressed={value === "down"}
        onClick={() => choose("down")}
      >
        {value === "down" ? <ThumbDownFilledIcon /> : <ThumbDownIcon />}
      </Button>
      <span className="text-xs text-on-surface-variant" aria-live="polite">
        {value === "up"
          ? "Thanks. The owner sees your rating."
          : value === "down"
            ? "Thanks. Tell the owner what was unclear with “Request clarification”."
            : ownerName
              ? `Feedback goes to ${ownerName}.`
              : null}
      </span>
    </div>
  );
}
