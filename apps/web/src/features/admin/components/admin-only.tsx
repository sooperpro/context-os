import type { ReactNode } from "react";
import { useViewer } from "@/features/workspace/hooks/use-viewer";
import type { Persona } from "@/features/workspace/viewer";
import { NotFoundPage } from "@/pages/not-found-page";

/**
 * Admin pages are for owners and admins (role access spec §4.8). Everyone else gets the not found
 * page, as the API refuses them too. `alsoFor` lets another persona in, such as People Ops for the
 * audit log. Renders nothing while the role is loading.
 */
export function AdminOnly({
  children,
  alsoFor = [],
}: {
  children: ReactNode;
  alsoFor?: readonly Persona[];
}) {
  const { persona } = useViewer();
  if (!persona) return null;
  return persona === "admin" || alsoFor.includes(persona) ? children : <NotFoundPage />;
}
