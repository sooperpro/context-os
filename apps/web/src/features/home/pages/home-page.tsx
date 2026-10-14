import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { Loader } from "@/components/ui/loader";
import { AdminHome } from "@/features/home/components/admin-home";
import { EmployeeHome } from "@/features/home/components/employee-home";
import { ManagerHome } from "@/features/home/components/manager-home";
import { PeopleOpsHome } from "@/features/home/components/people-ops-home";
import { isHomeView, viewForRole } from "@/features/home/views";
import { currentWorkspaceQuery } from "@/features/workspace/api/workspace.queries";

/**
 * Home: the dashboard for the caller's role. In development, `?view=` previews another role's Home
 * (the prototype's "View as"); production always follows the real role.
 */
export function HomePage() {
  const workspace = useQuery(currentWorkspaceQuery());
  const [params] = useSearchParams();
  const requested = params.get("view");
  const preview = import.meta.env.DEV && isHomeView(requested) ? requested : null;
  const view = preview ?? (workspace.data ? viewForRole(workspace.data.role) : null);

  if (!view) {
    return (
      <div className="grid min-h-80 place-items-center">
        <Loader label="Loading your Home" />
      </div>
    );
  }
  switch (view) {
    case "admin":
      return <AdminHome />;
    case "manager":
      return <ManagerHome />;
    case "people_ops":
      return <PeopleOpsHome />;
    case "employee":
      return <EmployeeHome />;
  }
}
