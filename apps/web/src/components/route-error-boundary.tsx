import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { Button } from "@/components/ui/button";

export function RouteErrorBoundary() {
  const error = useRouteError();

  const title = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : "Something went wrong";
  const message = isRouteErrorResponse(error)
    ? (error.data as string | undefined)
    : error instanceof Error
      ? error.message
      : undefined;

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {message ? <p className="max-w-prose text-sm text-muted-foreground">{message}</p> : null}
      <Button variant="outline" nativeButton={false} render={<Link to="/" />}>
        Back to home
      </Button>
    </div>
  );
}
