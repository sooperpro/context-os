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

export const router = createBrowserRouter([
  ...devRoutes,
  {
    path: "/",
    Component: RootLayout,
    ErrorBoundary: RouteErrorBoundary,
    children: [
      { index: true, Component: ProjectsPage },
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
    ],
  },
]);
