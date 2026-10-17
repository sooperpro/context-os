import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { setupQuery } from "@/features/setup/api/setup.queries";
import { currentWorkspaceQuery } from "@/features/workspace/api/workspace.queries";
import { useViewer } from "@/features/workspace/hooks/use-viewer";

const seenKey = (workspaceId: string) => `contextos.setup-opened.${workspaceId}`;

const alreadyOpened = (workspaceId: string) => {
  try {
    return sessionStorage.getItem(seenKey(workspaceId)) === "1";
  } catch {
    return false;
  }
};

const markOpened = (workspaceId: string) => {
  try {
    sessionStorage.setItem(seenKey(workspaceId), "1");
  } catch {
    // Without storage, setup may open again on a reload while the workspace is still new.
  }
};

/**
 * A brand-new workspace (N-7): its owner or admin lands on "Set up your company" once per sign-in,
 * until setup is started. Brand new means no step was touched and nothing it checks exists yet, so
 * established workspaces are never sent there; the Overview banner leads back to it instead.
 */
export function useSetupRedirect() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { actualRole } = useViewer();
  const admin = actualRole === "owner" || actualRole === "admin";
  const workspaceId = useQuery(currentWorkspaceQuery()).data?.id;
  const setup = useQuery({ ...setupQuery(), enabled: admin });
  const fresh =
    !!setup.data &&
    Object.keys(setup.data.data.steps).length === 0 &&
    !Object.values(setup.data.evidence.completed).some(Boolean);
  useEffect(() => {
    if (!fresh || !workspaceId || pathname === "/setup" || alreadyOpened(workspaceId)) return;
    markOpened(workspaceId);
    void navigate("/setup", { replace: pathname === "/" });
  }, [fresh, workspaceId, pathname, navigate]);
}
