import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowDropDownIcon, GroupIcon, ScienceIcon, VisibilityIcon } from "@/components/ui/icons";
import { HOME_VIEW_LABEL, HOME_VIEWS } from "@/features/home/views";
import { currentWorkspaceQuery } from "@/features/workspace/api/workspace.queries";
import { ROLE_LABEL } from "@/lib/labels";

/**
 * The prototype's "View as" pill. The prototype switches demo roles; here the role is real, read
 * from the current workspace membership, and the menu explains where it is managed.
 */
export function ViewAsPill() {
  const workspace = useQuery(currentWorkspaceQuery());
  const role = workspace.data?.role;
  const canManage = role === "owner" || role === "admin";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="mr-1 h-10 gap-1.5 pr-2 pl-3 text-on-surface-variant"
            aria-label="Your role in this workspace"
          />
        }
      >
        <VisibilityIcon />
        <span className="hidden expanded:inline">Viewing as</span>
        <b className="font-medium text-on-surface">{role ? ROLE_LABEL[role] : "…"}</b>
        <ArrowDropDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{workspace.data?.name ?? "Workspace"}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <p className="px-2 pb-2 text-xs text-on-surface-variant">
          {role
            ? `You are a${role === "owner" || role === "admin" ? "n" : ""} ${ROLE_LABEL[role].toLowerCase()} here. Roles are set by workspace admins and decide what you can see and change.`
            : "Checking your role…"}
        </p>
        {canManage ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link to="/members" />}>
              <GroupIcon /> Manage people and roles
            </DropdownMenuItem>
          </>
        ) : null}
        {import.meta.env.DEV ? (
          // Development only, like the prototype's role switch: see every role's Home from one account.
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Preview Home as (development)</DropdownMenuLabel>
              {HOME_VIEWS.map((view) => (
                <DropdownMenuItem key={view} render={<Link to={`/?view=${view}`} />}>
                  <ScienceIcon /> {HOME_VIEW_LABEL[view]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
