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
import ArrowBackIcon from "@material-symbols/svg-400/rounded/arrow_back.svg?react";
import AiSparkleIcon from "@material-symbols/svg-400/rounded/wand_stars.svg?react";
import ChecklistFilledIcon from "@material-symbols/svg-400/rounded/checklist-fill.svg?react";
import ChecklistIcon from "@material-symbols/svg-400/rounded/checklist.svg?react";
import CloseIcon from "@material-symbols/svg-400/rounded/close.svg?react";
import DarkModeIcon from "@material-symbols/svg-400/rounded/dark_mode.svg?react";
import DeleteIcon from "@material-symbols/svg-400/rounded/delete.svg?react";
import DesktopWindowsIcon from "@material-symbols/svg-400/rounded/desktop_windows.svg?react";
import FolderOpenFilledIcon from "@material-symbols/svg-400/rounded/folder_open-fill.svg?react";
import FolderOpenIcon from "@material-symbols/svg-400/rounded/folder_open.svg?react";
import GroupFilledIcon from "@material-symbols/svg-400/rounded/group-fill.svg?react";
import GroupIcon from "@material-symbols/svg-400/rounded/group.svg?react";
import HubFilledIcon from "@material-symbols/svg-400/rounded/hub-fill.svg?react";
import HubIcon from "@material-symbols/svg-400/rounded/hub.svg?react";
import LightModeIcon from "@material-symbols/svg-400/rounded/light_mode.svg?react";
import MenuIcon from "@material-symbols/svg-400/rounded/menu.svg?react";
import MenuOpenIcon from "@material-symbols/svg-400/rounded/menu_open.svg?react";
import MoreHorizIcon from "@material-symbols/svg-400/rounded/more_horiz.svg?react";
import RouteIcon from "@material-symbols/svg-400/rounded/route.svg?react";
import SearchIcon from "@material-symbols/svg-400/rounded/search.svg?react";
import SendIcon from "@material-symbols/svg-400/rounded/send.svg?react";
import SettingsIcon from "@material-symbols/svg-400/rounded/settings.svg?react";

export type MaterialIcon = ComponentType<SVGProps<SVGSVGElement>>;

export {
  AddIcon,
  ArrowBackIcon,
  AiSparkleIcon,
  ChecklistFilledIcon,
  ChecklistIcon,
  CloseIcon,
  DarkModeIcon,
  DeleteIcon,
  DesktopWindowsIcon,
  FolderOpenFilledIcon,
  FolderOpenIcon,
  GroupFilledIcon,
  GroupIcon,
  HubFilledIcon,
  HubIcon,
  LightModeIcon,
  MenuIcon,
  MenuOpenIcon,
  MoreHorizIcon,
  RouteIcon,
  SearchIcon,
  SendIcon,
  SettingsIcon,
};
