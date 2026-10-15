import { useQuery } from "@tanstack/react-query";
import { meQuery } from "@/features/account/api/account.queries";

/** Holds a path curator assignment: may build tutorials for that project in Tutorial Studio. */
export function useIsCurator(): boolean {
  const me = useQuery(meQuery());
  return Boolean(me.data?.assignments?.some((assignment) => assignment.type === "path_curator"));
}
