/**
 * Material Symbols Rounded, the icon set of the design system. Each icon is one SVG imported as a
 * React component (tree-shaken by import). Selected navigation items use the `-fill` variant,
 * matching the prototype's FILL 1 rule. Size and color come from the parent: `size-6`,
 * `text-on-surface-variant`; the SVG fills with currentColor.
 *
 * Add icons here as screens need them. Feature code imports from this module, never from the
 * package directly, so the set stays visible in one place.
 */
import type { ComponentType, SVGProps } from "react";

import AddIcon from "@material-symbols/svg-400/rounded/add.svg?react";
import ArrowDropDownIcon from "@material-symbols/svg-400/rounded/arrow_drop_down.svg?react";
import ArrowBackIcon from "@material-symbols/svg-400/rounded/arrow_back.svg?react";
import AiSparkleIcon from "@material-symbols/svg-400/rounded/wand_stars.svg?react";
import ChecklistFilledIcon from "@material-symbols/svg-400/rounded/checklist-fill.svg?react";
import ChecklistIcon from "@material-symbols/svg-400/rounded/checklist.svg?react";
import ContrastIcon from "@material-symbols/svg-400/rounded/contrast.svg?react";
import CloseIcon from "@material-symbols/svg-400/rounded/close.svg?react";
import DarkModeIcon from "@material-symbols/svg-400/rounded/dark_mode.svg?react";
import DeleteIcon from "@material-symbols/svg-400/rounded/delete.svg?react";
import DoneAllIcon from "@material-symbols/svg-400/rounded/done_all.svg?react";
import DescriptionIcon from "@material-symbols/svg-400/rounded/description.svg?react";
import DesktopWindowsIcon from "@material-symbols/svg-400/rounded/desktop_windows.svg?react";
import FolderOpenFilledIcon from "@material-symbols/svg-400/rounded/folder_open-fill.svg?react";
import FolderOpenIcon from "@material-symbols/svg-400/rounded/folder_open.svg?react";
import GroupFilledIcon from "@material-symbols/svg-400/rounded/group-fill.svg?react";
import GroupIcon from "@material-symbols/svg-400/rounded/group.svg?react";
import HubFilledIcon from "@material-symbols/svg-400/rounded/hub-fill.svg?react";
import HubIcon from "@material-symbols/svg-400/rounded/hub.svg?react";
import LayersIcon from "@material-symbols/svg-400/rounded/layers.svg?react";
import LogoutIcon from "@material-symbols/svg-400/rounded/logout.svg?react";
import ManageAccountsIcon from "@material-symbols/svg-400/rounded/manage_accounts.svg?react";
import LightModeIcon from "@material-symbols/svg-400/rounded/light_mode.svg?react";
import MenuIcon from "@material-symbols/svg-400/rounded/menu.svg?react";
import MenuOpenIcon from "@material-symbols/svg-400/rounded/menu_open.svg?react";
import MoreHorizIcon from "@material-symbols/svg-400/rounded/more_horiz.svg?react";
import NotificationsFilledIcon from "@material-symbols/svg-400/rounded/notifications-fill.svg?react";
import NotificationsIcon from "@material-symbols/svg-400/rounded/notifications.svg?react";
import RouteIcon from "@material-symbols/svg-400/rounded/route.svg?react";
import ScheduleIcon from "@material-symbols/svg-400/rounded/schedule.svg?react";
import SearchIcon from "@material-symbols/svg-400/rounded/search.svg?react";
import SendIcon from "@material-symbols/svg-400/rounded/send.svg?react";
import SettingsIcon from "@material-symbols/svg-400/rounded/settings.svg?react";

import VisibilityIcon from "@material-symbols/svg-400/rounded/visibility.svg?react";

export type MaterialIcon = ComponentType<SVGProps<SVGSVGElement>>;

export {
  AddIcon,
  ArrowDropDownIcon,
  ContrastIcon,
  DoneAllIcon,
  LogoutIcon,
  ManageAccountsIcon,
  NotificationsFilledIcon,
  NotificationsIcon,
  VisibilityIcon,
  ArrowBackIcon,
  AiSparkleIcon,
  ChecklistFilledIcon,
  ChecklistIcon,
  CloseIcon,
  DarkModeIcon,
  DeleteIcon,
  DescriptionIcon,
  DesktopWindowsIcon,
  FolderOpenFilledIcon,
  FolderOpenIcon,
  GroupFilledIcon,
  GroupIcon,
  HubFilledIcon,
  HubIcon,
  LayersIcon,
  LightModeIcon,
  MenuIcon,
  MenuOpenIcon,
  MoreHorizIcon,
  RouteIcon,
  ScheduleIcon,
  SearchIcon,
  SendIcon,
  SettingsIcon,
};
