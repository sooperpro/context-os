import { Navigate, useParams } from "react-router";
import { memberPath } from "@/features/team/team-meta";

/** `/team/:personId` from before N-14: a person's onboarding is the Onboarding tab of their profile. */
export function TeamMemberRedirect() {
  const { personId = "" } = useParams();
  return <Navigate to={memberPath(personId)} replace />;
}
