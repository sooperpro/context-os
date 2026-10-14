import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowDropDownIcon, GroupIcon, ScienceIcon, VisibilityIcon } from "@/components/ui/icons";
import { currentWorkspaceQuery } from "@/features/workspace/api/workspace.queries";
import { useViewer } from "@/features/workspace/hooks/use-viewer";
import { isPersona, PERSONA_LABEL, PERSONAS, setPreviewPersona } from "@/features/workspace/viewer";
import { ROLE_LABEL } from "@/lib/labels";

const ACTUAL = "actual";

/**
 * The prototype's "View as" pill. It shows the real role from the workspace membership and explains
 * where roles are managed. In development it also previews the app as another persona, like the
 * prototype's role switch; while previewing, the pill turns tonal so the preview is never forgotten.
 */
export function ViewAsPill() {
  const workspace = useQuery(currentWorkspaceQuery());
  const viewer = useViewer();
  const navigate = useNavigate();
  const actual = viewer.actualRole;
  const preview = viewer.preview;
  const canManage = viewer.role === "owner" || viewer.role === "admin";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className={cn(
              "mr-1 h-10 gap-1.5 pr-2 pl-3 text-on-surface-variant",
              preview && "bg-secondary-container text-on-secondary-container shadow-none",
            )}
            aria-label={
              preview ? `Previewing as ${PERSONA_LABEL[preview]}` : "Your role in this workspace"
            }
          />
        }
      >
        {preview ? <ScienceIcon /> : <VisibilityIcon />}
        <span className="hidden expanded:inline">Viewing as</span>
        <b className={cn("font-medium", !preview && "text-on-surface")}>
          {preview ? PERSONA_LABEL[preview] : actual ? ROLE_LABEL[actual] : "…"}
        </b>
        <ArrowDropDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-76">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{workspace.data?.name ?? "Workspace"}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <p className="px-2 pb-2 text-xs text-on-surface-variant">
          {preview && actual
            ? `Previewing the ${PERSONA_LABEL[preview]} view: navigation, Home and role-based controls follow that role. Data still comes from your ${ROLE_LABEL[actual].toLowerCase()} account, so you may see more than they would.`
            : actual
              ? `You are a${actual === "owner" || actual === "admin" ? "n" : ""} ${ROLE_LABEL[actual].toLowerCase()} here. Roles are set by workspace admins and decide what you can see and change.`
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
          // Development only: see every persona's app from one account. Production has no preview.
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Preview as (development)</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={preview ?? ACTUAL}
                onValueChange={(value: unknown) => {
                  setPreviewPersona(typeof value === "string" && isPersona(value) ? value : null);
                  void navigate("/");
                }}
              >
                <DropdownMenuRadioItem value={ACTUAL}>
                  <VisibilityIcon /> You{actual ? ` (${ROLE_LABEL[actual]})` : ""}
                </DropdownMenuRadioItem>
                {PERSONAS.map((persona) => (
                  <DropdownMenuRadioItem key={persona} value={persona}>
                    <ScienceIcon /> {PERSONA_LABEL[persona]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
