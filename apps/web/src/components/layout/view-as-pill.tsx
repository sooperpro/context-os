import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router";
import { useAssistant, type BotDemoState } from "@/components/layout/assistant-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuItemSupporting,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRadioItemIcon,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AdminPanelSettingsFilledIcon,
  AdminPanelSettingsIcon,
  ArrowDropDownIcon,
  BadgeFilledIcon,
  BadgeIcon,
  CloudOffIcon,
  GroupIcon,
  LockIcon,
  LoginIcon,
  PersonFilledIcon,
  PersonIcon,
  ProgressActivityIcon,
  SearchOffIcon,
  SupervisorAccountFilledIcon,
  SupervisorAccountIcon,
  VerifiedIcon,
  VisibilityIcon,
  WavingHandIcon,
  type MaterialIcon,
} from "@/components/ui/icons";
import { currentWorkspaceQuery } from "@/features/workspace/api/workspace.queries";
import { useViewer } from "@/features/workspace/hooks/use-viewer";
import {
  isPersona,
  PERSONA_LABEL,
  PERSONAS,
  personaForRole,
  setPreviewPersona,
  type Persona,
} from "@/features/workspace/viewer";
import { ROLE_LABEL } from "@/lib/labels";

/** The prototype's icons for its four roles; the checked one is filled. */
const PERSONA_ICON: Record<Persona, { icon: MaterialIcon; checkedIcon: MaterialIcon }> = {
  employee: { icon: PersonIcon, checkedIcon: PersonFilledIcon },
  manager: { icon: SupervisorAccountIcon, checkedIcon: SupervisorAccountFilledIcon },
  people_ops: { icon: BadgeIcon, checkedIcon: BadgeFilledIcon },
  admin: { icon: AdminPanelSettingsIcon, checkedIcon: AdminPanelSettingsFilledIcon },
};

/** The prototype's Context Bot review states (bot.js `demo`). */
const BOT_STATES: ReadonlyArray<readonly [BotDemoState, string, MaterialIcon]> = [
  ["welcome", "Welcome", WavingHandIcon],
  ["thinking", "Thinking", ProgressActivityIcon],
  ["answer", "Answer with sources", VerifiedIcon],
  ["no_answer", "No answer found", SearchOffIcon],
  ["restricted", "Restricted", LockIcon],
  ["error", "Error", CloudOffIcon],
];

/**
 * The prototype's "View as" pill. In development it is the prototype's menu: switch the persona the
 * whole app renders for, open the first-day flow, or show Context Bot in a review state. The API
 * still enforces the real role, so a preview can show more than that persona would see. In
 * production there is no preview: the pill shows the real role and where roles are managed.
 */
export function ViewAsPill() {
  const viewer = useViewer();
  const actual = viewer.actualRole;
  const own = actual ? personaForRole(actual) : null;
  const current = viewer.preview ?? own;
  const label = import.meta.env.DEV
    ? current
      ? PERSONA_LABEL[current]
      : "…"
    : actual
      ? ROLE_LABEL[actual]
      : "…";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="me-1 h-10 gap-1.5 ps-3 pe-2 text-on-surface-variant aria-expanded:bg-transparent aria-expanded:text-on-surface-variant [&_svg]:-ms-1"
            aria-label={import.meta.env.DEV ? `View as ${label}` : `Your role: ${label}`}
          />
        }
      >
        <VisibilityIcon />
        <span className="hidden medium:inline">View as</span>
        <b className="font-medium text-on-surface">{label}</b>
        <ArrowDropDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6}>
        {import.meta.env.DEV ? <PrototypeMenu own={own} current={current} /> : <RoleMenu />}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Development: the prototype's three sections, as in its `viewAsMenu`. */
function PrototypeMenu({ own, current }: { own: Persona | null; current: Persona | null }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { showBotDemo } = useAssistant();
  // The session-free dev shell keeps its own Home and welcome.
  const devShell = pathname.startsWith("/dev/shell");

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Prototype · view as</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={current ?? ""}
          onValueChange={(value: unknown) => {
            if (typeof value !== "string" || !isPersona(value)) return;
            setPreviewPersona(value === own ? null : value);
            void navigate(devShell ? "/dev/shell" : "/");
          }}
        >
          {PERSONAS.map((persona) => (
            <DropdownMenuRadioItem key={persona} value={persona} closeOnClick>
              <DropdownMenuRadioItemIcon {...PERSONA_ICON[persona]} />
              {PERSONA_LABEL[persona]}
              <DropdownMenuItemSupporting>
                {persona === own ? "You" : null}
              </DropdownMenuItemSupporting>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>Prototype · flows</DropdownMenuLabel>
        <DropdownMenuItem render={<Link to={devShell ? "/dev/welcome" : "/welcome"} />}>
          <LoginIcon /> First-day welcome
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>Prototype · Context Bot state</DropdownMenuLabel>
        {BOT_STATES.map(([state, text, Icon]) => (
          <DropdownMenuItem key={state} onClick={() => showBotDemo(state)}>
            <Icon /> {text}
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>
    </>
  );
}

/** Production: the real role and, for admins, where roles are managed. */
function RoleMenu() {
  const workspace = useQuery(currentWorkspaceQuery());
  const { actualRole: actual } = useViewer();
  const canManage = actual === "owner" || actual === "admin";

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>{workspace.data?.name ?? "Workspace"}</DropdownMenuLabel>
      </DropdownMenuGroup>
      <p className="max-w-72 px-3 pb-2 text-xs text-on-surface-variant">
        {actual
          ? `You are a${canManage ? "n" : ""} ${ROLE_LABEL[actual].toLowerCase()} here. Roles are set by workspace admins and decide what you can see and change.`
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
    </>
  );
}
