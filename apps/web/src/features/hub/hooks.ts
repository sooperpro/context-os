import { useQuery } from "@tanstack/react-query";
import { meQuery } from "@/features/account/api/account.queries";
import { ownershipQuery } from "@/features/people/api/people.queries";
import { useViewer } from "@/features/workspace/hooks/use-viewer";

/**
 * Whether the viewer may confirm, mark stale or dispute items in a project. As the API checks:
 * a domain owner of that project or of the whole workspace, and never a guest.
 */
export function useCanVerify(projectId: string): boolean {
  const { actualRole } = useViewer();
  const me = useQuery(meQuery());
  const guest = actualRole === "guest";
  const ownership = useQuery({
    ...ownershipQuery(me.data?.id ?? ""),
    enabled: Boolean(me.data) && actualRole !== undefined && !guest,
  });
  if (guest || !ownership.data) return false;
  return ownership.data.some(
    (assignment) =>
      assignment.type === "domain_owner" &&
      (assignment.scopeType === "workspace" ||
        (assignment.scopeType === "project" && assignment.scopeId === projectId)),
  );
}
