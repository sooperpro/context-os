import type { ReactNode } from "react";
import { useViewer } from "@/features/workspace/hooks/use-viewer";
import { NotFoundPage } from "@/pages/not-found-page";

/**
 * Team pages are for managers (role access spec §4.6); People Ops and owners may also open a member
 * page, as the API lets them read it. Everyone else gets the not found page. Renders nothing while the role
 * is loading.
 */
export function ManagerOnly({
  hrMayRead = false,
  children,
}: {
  hrMayRead?: boolean;
  children: ReactNode;
}) {
  const { persona, seesEverything } = useViewer();
  if (!persona) return null;
  return persona === "manager" || (hrMayRead && (persona === "people_ops" || seesEverything)) ? (
    children
  ) : (
    <NotFoundPage />
  );
}
