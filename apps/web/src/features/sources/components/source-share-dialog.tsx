import type { SourceObject } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { membersQuery } from "@/features/members/api/members.queries";
import { OptionalSelect } from "@/features/members/components/optional-select";
import { sourceAccessQuery, useSourceAccess } from "@/features/sources/api/sources.queries";
import { formatShortDate } from "@/lib/format";

/**
 * Share a pasted or uploaded source with one person (admins). Such sources are restricted by
 * default; connected sources follow their provider's sharing instead, so they never show this.
 */
export function SourceShareDialog({
  projectId,
  source,
  onOpenChange,
}: {
  projectId: string;
  source: SourceObject | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={source !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {source ? <ShareForm projectId={projectId} source={source} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ShareForm({ projectId, source }: { projectId: string; source: SourceObject }) {
  const id = useId();
  const access = useQuery(sourceAccessQuery(projectId, source.id));
  const members = useQuery(membersQuery());
  const { grant, revoke } = useSourceAccess(projectId, source.id);
  const [userId, setUserId] = useState("");
  const [until, setUntil] = useState("");
  const shared = new Set(access.data?.items.map((row) => row.userId));
  const people = (members.data ?? [])
    .filter((member) => member.status === "active" && !shared.has(member.id))
    .map((member) => ({ value: member.id, label: member.name }));

  const add = () =>
    grant.mutate(
      { userId, ...(until ? { expiresAt: new Date(`${until}T23:59:59`).toISOString() } : {}) },
      {
        onSuccess: () => {
          toast.success("Shared");
          setUserId("");
          setUntil("");
        },
        onError: (error) => toast.error(error.message || "It could not be shared."),
      },
    );

  return (
    <>
      <DialogHeader>
        <DialogTitle>Share “{source.title}”</DialogTitle>
        <DialogDescription>
          It stays restricted. These people can open it, and Context Bot can use it to answer them.
        </DialogDescription>
      </DialogHeader>
      {access.data?.items.length ? (
        <ul className="flex flex-col gap-1" aria-label="Shared with">
          {access.data.items.map((row) => (
            <li key={row.userId} className="flex items-center gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {row.name}
                {row.expiresAt ? (
                  <span className="text-xs text-on-surface-variant">
                    {" "}
                    · until {formatShortDate(row.expiresAt)}
                  </span>
                ) : null}
              </span>
              <Button
                size="xs"
                variant="ghost"
                disabled={revoke.isPending}
                aria-label={`Stop sharing with ${row.name}`}
                onClick={() => revoke.mutate(row.userId)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : access.data ? (
        <p className="text-sm text-on-surface-variant">Not shared with anyone yet.</p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${id}-person`}>Person</Label>
          <OptionalSelect
            id={`${id}-person`}
            value={userId}
            onChange={setUserId}
            options={people}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-until`}>Until (optional)</Label>
          <Input
            id={`${id}-until`}
            type="date"
            value={until}
            onChange={(event) => setUntil(event.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button disabled={!userId || grant.isPending} onClick={add}>
          Share
        </Button>
      </DialogFooter>
    </>
  );
}
