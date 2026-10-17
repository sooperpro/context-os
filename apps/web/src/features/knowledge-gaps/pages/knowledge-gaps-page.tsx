import { GapStatusSchema, type GapStatus, type KnowledgeGapEntry } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckIcon } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { gapsQuery, useSetGapStatus } from "@/features/knowledge-gaps/api/gaps.api";
import { ApiClientError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";

const STATUS_LABEL: Record<GapStatus, string> = {
  open: "Open",
  answered: "Answered",
  dismissed: "Dismissed",
};

const times = (count: number, one: string, many: string) =>
  count === 1 ? one : `${count.toLocaleString()} ${many}`;

/** What a gap is made of, without saying who asked: asking is private. */
function describe(gap: KnowledgeGapEntry): string {
  const parts = [
    gap.asks ? `Asked ${times(gap.asks, "once", "times")} without an answer` : null,
    gap.askers > 1 ? `by ${gap.askers} people` : null,
    gap.reports ? `reported ${times(gap.reports, "once", "times")}` : null,
    gap.wordings > 1 ? `${gap.wordings} wordings` : null,
  ].filter(Boolean);
  const text = parts.join(", ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}. Last asked ${formatDate(gap.lastAskedAt)}.`;
}

/**
 * Knowledge gaps (N-13): questions Context Bot couldn't answer, for the people who can fill them.
 * Domain owners see their projects' gaps, admins and owners every gap. Notifications about gaps
 * open this page, filtered to their project with `?project=`.
 */
export function KnowledgeGapsPage() {
  const [params, setParams] = useSearchParams();
  const status = GapStatusSchema.safeParse(params.get("status")).data ?? "open";
  const projectId = params.get("project") ?? undefined;
  const query = useQuery(gapsQuery(status, projectId));
  const setStatus = useSetGapStatus();
  const [answering, setAnswering] = useState<KnowledgeGapEntry | null>(null);
  const forbidden = query.error instanceof ApiClientError && query.error.status === 403;
  const data = query.data;
  const projectName = data?.items.find((gap) => gap.project?.id === projectId)?.project?.name;

  const choose = (next: GapStatus) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (next === "open") copy.delete("status");
        else copy.set("status", next);
        return copy;
      },
      { replace: true },
    );
  const change = (gap: KnowledgeGapEntry, next: GapStatus, note?: string) =>
    setStatus.mutate(
      { id: gap.id, status: next, ...(note ? { note } : {}) },
      {
        onSuccess: () => {
          toast.success(
            next === "answered"
              ? "Marked answered. People who reported it are told."
              : next === "dismissed"
                ? "Dismissed"
                : "Open again",
          );
          setAnswering(null);
        },
      },
    );

  return (
    <div className="mx-auto flex max-w-240 flex-col gap-3 medium:gap-4">
      <PageHeader
        title="Knowledge gaps"
        description="Questions Context Bot couldn't answer, grouped when they mean the same thing. Add or update a source that answers one, then mark it answered."
      />
      {forbidden ? (
        <SectionCard title="Not available">
          <p className="text-sm text-on-surface-variant">
            Knowledge gaps are for domain owners and admins. Ask an admin to make you a domain owner
            of a project to see its gaps.
          </p>
        </SectionCard>
      ) : (
        <SectionCard
          title={projectId ? `Gaps in ${projectName ?? "this project"}` : "All gaps"}
          count={data?.items.length}
          endpoint="/v1/knowledge-gaps"
          status={query}
          action={
            projectId ? (
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link to="/knowledge-gaps" />}
              >
                All projects
              </Button>
            ) : undefined
          }
        >
          <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
            {GapStatusSchema.options.map((value) => (
              <Chip
                key={value}
                variant="filter"
                selected={status === value}
                onClick={() => choose(value)}
              >
                {status === value ? <CheckIcon aria-hidden /> : null}
                {STATUS_LABEL[value]} {data ? data.counts[value] : ""}
              </Chip>
            ))}
          </div>
          {data?.items.length ? (
            <ul
              aria-label="Knowledge gaps"
              className="flex flex-col divide-y divide-outline-variant"
            >
              {data.items.map((gap) => (
                <li key={gap.id} className="flex flex-wrap items-start gap-3 py-3">
                  <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5">
                    <span className="font-medium">{gap.question}</span>
                    <span className="text-sm text-on-surface-variant">{describe(gap)}</span>
                    {gap.project && !projectId ? (
                      <Link
                        to={`/projects/${gap.project.id}`}
                        className="text-xs text-on-surface-variant hover:underline"
                      >
                        {gap.project.name}
                      </Link>
                    ) : null}
                    {gap.resolution ? (
                      <span className="text-xs text-on-surface-variant">
                        {STATUS_LABEL[gap.status]} by {gap.resolution.by.name} on{" "}
                        {formatDate(gap.resolution.at)}
                        {gap.resolution.note ? `: ${gap.resolution.note}` : ""}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    {gap.status === "open" ? (
                      <>
                        <Button size="sm" onClick={() => setAnswering(gap)}>
                          Mark answered
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={setStatus.isPending}
                          onClick={() => change(gap, "dismissed")}
                        >
                          Dismiss
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={setStatus.isPending}
                        onClick={() => change(gap, "open")}
                      >
                        Reopen
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : data ? (
            <p className="text-sm text-on-surface-variant">
              {status === "open"
                ? `No open gaps. A question shows here as soon as someone reports it, or once ${data.privacyFloor} different people ask something Context Bot couldn't answer. Until then, what people ask stays private.`
                : `No ${STATUS_LABEL[status].toLocaleLowerCase()} gaps.`}
            </p>
          ) : null}
        </SectionCard>
      )}
      <AnswerDialog
        gap={answering}
        pending={setStatus.isPending}
        onClose={() => setAnswering(null)}
        onConfirm={(gap, note) => change(gap, "answered", note)}
      />
    </div>
  );
}

function AnswerDialog({
  gap,
  pending,
  onClose,
  onConfirm,
}: {
  gap: KnowledgeGapEntry | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: (gap: KnowledgeGapEntry, note: string) => void;
}) {
  const id = useId();
  const [note, setNote] = useState("");
  return (
    <Dialog
      open={gap !== null}
      onOpenChange={(open) => {
        if (!open) {
          setNote("");
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        {gap ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              onConfirm(gap, note.trim());
              setNote("");
            }}
          >
            <DialogHeader>
              <DialogTitle>Mark answered</DialogTitle>
              <DialogDescription>
                “{gap.question}” People who reported it are told it now has an answer.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor={`${id}-note`}>Where the answer is (optional)</Label>
              <Textarea
                id={`${id}-note`}
                rows={3}
                maxLength={500}
                placeholder="Added the VPN guide to IT help."
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                Mark answered
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
