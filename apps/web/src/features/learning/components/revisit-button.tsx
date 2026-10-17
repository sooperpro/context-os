import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BookmarkIcon } from "@/components/ui/icons";
import { useSetRevisit } from "@/features/learning/api/learning.queries";

/** Marks a lesson or module to come back to. It isn't a skip: progress and due dates stay. */
export function RevisitButton({ id, revisit }: { id: string; revisit: boolean }) {
  const setRevisit = useSetRevisit();
  return (
    <Button
      variant={revisit ? "secondary" : "ghost"}
      className="text-current"
      aria-pressed={revisit}
      disabled={setRevisit.isPending}
      onClick={() =>
        setRevisit.mutate(
          { id, revisit: !revisit },
          {
            onSuccess: () =>
              toast.success(revisit ? "Removed from Revisit later" : "Added to Revisit later"),
            onError: () => toast.error("That didn't save. Please try again."),
          },
        )
      }
    >
      <BookmarkIcon aria-hidden />
      {revisit ? "Marked to revisit" : "Revisit later"}
    </Button>
  );
}
