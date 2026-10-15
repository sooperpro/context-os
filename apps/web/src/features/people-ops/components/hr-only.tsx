import type { ReactNode } from "react";
import { useViewer } from "@/features/workspace/hooks/use-viewer";
import { NotFoundPage } from "@/pages/not-found-page";

/**
 * People Ops pages are for the HR role only (role access spec §4.7). Everyone else gets the not
 * found page, as the API refuses them too. Renders nothing while the role is loading.
 */
export function HrOnly({ children }: { children: ReactNode }) {
  const { persona } = useViewer();
  if (!persona) return null;
  return persona === "people_ops" ? children : <NotFoundPage />;
}
