import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCanVerify } from "@/features/hub/hooks";
import { gapsQuery } from "@/features/knowledge-gaps/api/gaps.api";
import { useViewer } from "@/features/workspace/hooks/use-viewer";

/**
 * Open knowledge gaps for one project, on its hub, for the people who can fill them: the project's
 * domain owners, admins and owners. Shows nothing to anyone else.
 */
export function ProjectGapsCard({ projectId }: { projectId: string }) {
  const { actualRole } = useViewer();
  const owner = useCanVerify(projectId);
  const allowed = owner || actualRole === "owner" || actualRole === "admin";
  const query = useQuery({ ...gapsQuery("open", projectId), enabled: allowed });
  if (!allowed || !query.data) return null;
  const gaps = query.data.items;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Knowledge gaps</CardTitle>
        <CardDescription>
          {gaps.length
            ? "Questions about this project Context Bot couldn't answer."
            : "Nothing open. Gaps appear here when someone reports one, or when several people ask the same unanswered question."}
        </CardDescription>
      </CardHeader>
      {gaps.length ? (
        <CardContent className="flex flex-col gap-3">
          <ul aria-label="Open knowledge gaps" className="flex flex-col gap-2">
            {gaps.slice(0, 3).map((gap) => (
              <li key={gap.id} className="text-sm">
                {gap.question}
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            nativeButton={false}
            render={<Link to={`/knowledge-gaps?project=${encodeURIComponent(projectId)}`} />}
          >
            See all {gaps.length}
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}
