import { useQuery } from "@tanstack/react-query";
import { RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { jobsQuery, useRetryJob } from "@/features/jobs/api/jobs.queries";
import { formatDateTime } from "@/lib/format";

/** Shown when the sync state needs attention: lists failed jobs with a retry. */
export function FailedJobsPanel({ projectId }: { projectId: string }) {
  const jobs = useQuery(jobsQuery(projectId, "failed"));
  const retry = useRetryJob(projectId);
  const items = jobs.data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <Alert variant="destructive">
      <AlertTitle>Some background work failed</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 w-full space-y-2">
          {items.map((job) => (
            <li key={job.id} className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 text-xs">
                <span className="font-medium">
                  {job.type === "process_source" ? "Process source" : "Refresh overview"}
                  {job.subject ? `: ${job.subject}` : ""}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  · {job.attempts}/{job.maxAttempts} attempts
                  {job.finishedAt ? ` · ${formatDateTime(job.finishedAt)}` : ""}
                </span>
                {job.lastError ? <p className="mt-0.5 break-words">{job.lastError}</p> : null}
              </div>
              <Button
                variant="outline"
                size="xs"
                disabled={retry.isPending}
                onClick={() =>
                  retry.mutate(job.id, { onSuccess: () => toast.success("Job re-queued") })
                }
              >
                <RotateCcwIcon aria-hidden />
                Retry
              </Button>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
