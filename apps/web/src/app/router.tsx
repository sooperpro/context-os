import { createBrowserRouter } from "react-router";
import { RootLayout } from "@/app/root-layout";
import { RouteErrorBoundary } from "@/components/route-error-boundary";
import { ProjectsPage } from "@/features/projects/pages/projects-page";
import { NotFoundPage } from "@/pages/not-found-page";

/** Development-only routes: the component gallery lives outside the app shell and auth gate. */
const devRoutes = import.meta.env.DEV
  ? [
      {
        path: "/dev/ui",
        ErrorBoundary: RouteErrorBoundary,
        lazy: async () => {
          const { UiGalleryPage } = await import("@/dev/ui-gallery-page");
          return { Component: UiGalleryPage };
        },
      },
    ]
  : [];

/** The application's routes under the shell, shared by "/" and the development shell preview. */
const appChildren = [
      { index: true, Component: ProjectsPage },
      {
        path: "members",
        lazy: async () => {
          const { MembersPage } = await import("@/features/members/pages/members-page");
          return { Component: MembersPage };
        },
      },
      {
        path: "settings",
        lazy: async () => {
          const { SettingsPage } = await import("@/features/settings/pages/settings-page");
          return { Component: SettingsPage };
        },
      },
      {
        path: "setup",
        lazy: async () => {
          const { SetupPage } = await import("@/features/setup/pages/setup-page");
          return { Component: SetupPage };
        },
      },
      {
        path: "projects/:projectId",
        // Project pages are code-split: this chunk loads only when a project is opened.
        lazy: async () => {
          const { ProjectLayout } = await import("@/components/layout/project-layout");
          return { Component: ProjectLayout };
        },
        children: [
          {
            index: true,
            lazy: async () => {
              const { ProjectHubPage } = await import("@/features/hub/pages/project-hub-page");
              return { Component: ProjectHubPage };
            },
          },
          {
            path: "ask",
            lazy: async () => {
              const { AskPage } = await import("@/features/ask/pages/ask-page");
              return { Component: AskPage };
            },
          },
          {
            path: "sources",
            lazy: async () => {
              const { SourcesPage } = await import("@/features/sources/pages/sources-page");
              return { Component: SourcesPage };
            },
          },
        ],
      },
      { path: "*", Component: NotFoundPage },
];

export const router = createBrowserRouter([
  ...devRoutes,
  // Development only: the same shell and pages without a session, for visual checks. The API in
  // development mode needs no token; links inside still point at the real routes.
  ...(import.meta.env.DEV
    ? [{ path: "/dev/shell", Component: RootLayout, ErrorBoundary: RouteErrorBoundary, children: appChildren }]
    : []),
  {
    path: "/",
    Component: RootLayout,
    ErrorBoundary: RouteErrorBoundary,
    children: appChildren,
  },
]);
