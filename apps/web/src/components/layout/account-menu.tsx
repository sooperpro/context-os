import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import type { Theme } from "@/components/theme-context";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  avatarShapeFor,
  avatarToneFor,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRadioItemIcon,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContrastFilledIcon,
  ContrastIcon,
  DarkModeFilledIcon,
  DarkModeIcon,
  LightModeFilledIcon,
  LightModeIcon,
  LogoutIcon,
  ManageAccountsIcon,
  NotificationsIcon,
  PersonIcon,
  type MaterialIcon,
} from "@/components/ui/icons";
import { selectWorkspace, signOut } from "@/features/auth/api/auth.api";
import { meQuery } from "@/features/account/api/account.queries";
import { authKeys, sessionQuery } from "@/features/auth/api/auth.queries";
import { useTheme } from "@/hooks/use-theme";
import { initialsOf } from "@/lib/format";

const THEMES: Array<{
  value: Theme;
  label: string;
  icon: MaterialIcon;
  checkedIcon: MaterialIcon;
}> = [
  { value: "system", label: "Match system", icon: ContrastIcon, checkedIcon: ContrastFilledIcon },
  { value: "light", label: "Light", icon: LightModeIcon, checkedIcon: LightModeFilledIcon },
  { value: "dark", label: "Dark", icon: DarkModeIcon, checkedIcon: DarkModeFilledIcon },
];

/**
 * The prototype's account menu on our own avatar: name and email, sign-in and security (settings),
 * theme with "Match system", workspace switching, and sign out.
 */
export function AccountMenu() {
  const { data: session } = useQuery(sessionQuery());
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const switchWorkspace = useMutation({
    mutationFn: selectWorkspace,
    onSuccess: (next) => {
      // Everything cached belongs to the previous workspace.
      queryClient.clear();
      queryClient.setQueryData(authKeys.session(), next);
    },
  });
  const signOutNow = useMutation({
    mutationFn: signOut,
    onSuccess: () => window.location.assign("/"),
  });

  const user = session?.user;
  const name = user?.name ?? "Account";
  const email = user?.email ?? undefined;
  const workspaces = session?.workspaces ?? [];
  const activeWorkspaceId = session?.activeWorkspaceId ?? "";
  // Your avatar wears your shape, as on your profile (prototype `.avatar.shape-*`).
  const me = useQuery({ ...meQuery(), enabled: user !== undefined });
  const tone = avatarToneFor(user?.id ?? "account");
  const shape = avatarShapeFor(user?.id ?? "account", me.data?.profile?.avatarShape);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Account: ${name}`}
            className="ml-1 rounded-full transition-transform ease-spring-fast-spatial outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95"
          />
        }
      >
        <Avatar size="sm" tone={tone} shape={shape}>
          {user?.image ? <AvatarImage src={user.image} alt="" /> : null}
          <AvatarFallback>{initialsOf(name) || "?"}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6}>
        <div className="flex items-center gap-3 p-3">
          <Avatar size="lg" tone={tone} shape={shape}>
            {user?.image ? <AvatarImage src={user.image} alt="" /> : null}
            <AvatarFallback>{initialsOf(name) || "?"}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-base font-medium">{name}</p>
            {email ? <p className="truncate text-xs text-on-surface-variant">{email}</p> : null}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/settings" />}>
          <PersonIcon /> Profile & preferences
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link to="/settings?tab=notifications" />}>
          <NotificationsIcon /> Notifications
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link to="/settings?tab=security" />}>
          <ManageAccountsIcon /> Sign-in and security
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          {THEMES.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <DropdownMenuRadioItemIcon icon={option.icon} checkedIcon={option.checkedIcon} />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {workspaces.length > 1 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={activeWorkspaceId}
              onValueChange={(workspaceId: string) => switchWorkspace.mutate(workspaceId)}
            >
              <DropdownMenuLabel>Workspace</DropdownMenuLabel>
              {workspaces.map((workspace) => (
                <DropdownMenuRadioItem key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        ) : null}
        <DropdownMenuSeparator />
        {session?.authentication === "development" ? (
          <>
            {/* Local development has one built-in user and no sign-in, so there is no session to end. */}
            <DropdownMenuItem disabled>
              <LogoutIcon /> Sign out
            </DropdownMenuItem>
            <p className="max-w-64 px-3 pb-2 text-xs text-on-surface-variant">
              Development mode has no sign-in. Set AUTH_MODE=accounts in apps/api/.env to sign in
              and out with real accounts.
            </p>
          </>
        ) : (
          <DropdownMenuItem disabled={signOutNow.isPending} onClick={() => signOutNow.mutate()}>
            <LogoutIcon /> Sign out
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
