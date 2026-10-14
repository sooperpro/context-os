import { Navigate, useLocation } from "react-router";

/** A soft-hidden page (lib/hidden.ts) sends people to Home, keeping the development shell prefix. */
export function RedirectHome() {
  const { pathname } = useLocation();
  return <Navigate to={pathname.startsWith("/dev/shell") ? "/dev/shell" : "/"} replace />;
}
