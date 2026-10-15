import type { ReactNode } from "react";
import { useViewer } from "@/features/workspace/hooks/use-viewer";
import { NotFoundPage } from "@/pages/not-found-page";

/**
 * Admin pages are for owners and admins (role access spec §4.8). Everyone else gets the not found
 * page, as the API refuses them too. Renders nothing while the role is loading.
 */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { persona } = useViewer();
  if (!persona) return null;
  return persona === "admin" ? children : <NotFoundPage />;
}
