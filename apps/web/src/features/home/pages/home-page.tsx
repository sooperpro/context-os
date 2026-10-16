import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { WarningIcon } from "@/components/ui/icons";
import { Loader } from "@/components/ui/loader";
import { AdminHome } from "@/features/home/components/admin-home";
import { EmployeeHome } from "@/features/home/components/employee-home";
import { ManagerHome } from "@/features/home/components/manager-home";
import { PeopleOpsHome } from "@/features/home/components/people-ops-home";
import { useViewer } from "@/features/workspace/hooks/use-viewer";
import { isPersona, setPreviewPersona } from "@/features/workspace/viewer";
import { GuestHome } from "@/features/home/components/guest-home";

/**
 * Home: the dashboard for the viewer's persona (employee, manager, People Ops or admin). In
 * development, `/?view=employee` starts the "Preview as" for that persona (the prototype's "View as");
 * production always follows the real role.
 */
export function HomePage() {
  const viewer = useViewer();
  const [params] = useSearchParams();
  const requested = params.get("view");
  const linked = import.meta.env.DEV && isPersona(requested) ? requested : null;

  // A `?view=` link previews the whole app, not just this page, so the rail follows too.
  useEffect(() => {
    if (linked) setPreviewPersona(linked);
  }, [linked]);

  const persona = linked ?? viewer.persona;
  // Without the workspace there is no role to pick a Home for: say so instead of loading forever.
  if (!persona && viewer.error) {
    return (
      <Banner
        tone="error"
        icon={<WarningIcon />}
        title="Your workspace couldn't be loaded"
        description={viewer.error.message}
        actions={<Button onClick={viewer.retry}>Try again</Button>}
      />
    );
  }
  if (!persona) {
    return (
      <div className="grid min-h-80 place-items-center">
        <Loader label="Loading your Home" />
      </div>
    );
  }
  switch (persona) {
    case "admin":
      return <AdminHome />;
    case "manager":
      return <ManagerHome />;
    case "people_ops":
      return <PeopleOpsHome />;
    case "employee":
      // Guests share the employee screens but aren't onboarding: their Home is their projects.
      return viewer.role === "guest" && !linked ? <GuestHome /> : <EmployeeHome />;
  }
}
