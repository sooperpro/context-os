import { useViewer } from "@/features/workspace/hooks/use-viewer";

/**
 * Owner, Admin and HR publish templates and tutorials directly (N-18). Managers and path curators
 * submit their drafts to them for review instead; the API enforces the same rule.
 */
export function useIsReviewer(): boolean {
  const { role } = useViewer();
  return role === "owner" || role === "admin" || role === "hr";
}
