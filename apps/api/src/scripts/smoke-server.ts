/** Isolated HTTP fixture for Bruno. Never start this entry point in production. */
import { serve } from "@hono/node-server";
import { createTestApp } from "../test/helpers.js";

if (process.env.NODE_ENV !== "test" || process.env.AUTH_MODE !== "development") {
  throw new Error("The smoke server requires NODE_ENV=test and AUTH_MODE=development");
}
const fixture = createTestApp();
const port = Number(process.env.SMOKE_PORT ?? 3001);
fixture.container.worker.start();
const server = serve({ fetch: fixture.app.fetch, hostname: "127.0.0.1", port }, () => {
  console.warn(`Isolated Bruno fixture listening on http://127.0.0.1:${port}`);
});
const close = () => {
  void fixture.container.worker.stop().then(() => {
    server.close();
    fixture.close();
  });
};
process.on("SIGTERM", close);
process.on("SIGINT", close);
