import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { workspaceKeys } from "@/features/workspace/api/workspace.queries";
import { apiDownload, apiRequest } from "@/lib/api-client";

/**
 * The admin Workspace page: analytics (apps/api/src/modules/platform/analytics.routes.ts), the
 * workspace data export (platform/admin.routes.ts) and an owner's scheduled deletion
 * (workspace/workspace.routes.ts).
 */

const Rate = z.number().nullable();
/** What the page shows of `GET /v1/analytics/overview`: aggregates, never person-level. */
const AnalyticsSchema = z.object({
  periodDays: z.number(),
  knowledgeHealth: z.array(
    z.object({ projectId: z.string(), name: z.string(), khs: z.number().nullable() }),
  ),
  ask: z.object({ volume: z.number(), helpfulRate: Rate, insufficientRate: Rate }),
  contributions: z.object({
    flagsOpened: z.number(),
    flagsResolved: z.number(),
    correctionsVerified: z.number(),
    bountiesCompleted: z.number(),
  }),
});
export type Analytics = z.infer<typeof AnalyticsSchema>;

export const analyticsQuery = (days: number) =>
  queryOptions({
    queryKey: [...workspaceKeys.all, "analytics", days] as const,
    queryFn: ({ signal }) =>
      apiRequest("/v1/analytics/overview", { query: { days }, schema: AnalyticsSchema, signal }),
  });

/** Saves the workspace's data as JSON. Ask conversations and people data are never in it. */
export const downloadWorkspaceExport = () =>
  apiDownload("/v1/admin/export", { fallbackName: "contextos-export.json" });

/** Owners schedule deletion (7 days' grace) by typing the slug, and can cancel it. */
export function useWorkspaceDeletion() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: workspaceKeys.current() });
  return {
    schedule: useMutation({
      mutationFn: (confirm: string) =>
        apiRequest("/v1/workspaces/current/deletion", {
          method: "POST",
          body: { confirm },
          schema: z.unknown(),
        }),
      onSettled: refresh,
    }),
    cancel: useMutation({
      mutationFn: () =>
        apiRequest("/v1/workspaces/current/deletion", { method: "DELETE", schema: z.unknown() }),
      onSettled: refresh,
    }),
  };
}
