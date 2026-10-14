// Guardrail for the token package itself: raw color values may appear ONLY in
// reference.css. Every other file must reference a token.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const src = new URL("../src/", import.meta.url).pathname;
const raw = /#(?:[0-9a-f]{3}){1,2}\b|\b(?:rgba?|hsla?|oklch|oklab)\(/i;
let failed = false;
for (const file of readdirSync(src)) {
  if (file === "reference.css") continue;
  const lines = readFileSync(join(src, file), "utf8").split("\n");
  lines.forEach((line, i) => {
    if (raw.test(line) && !line.trimStart().startsWith("/*")) {
      console.error(`${file}:${i + 1}: raw color value; reference a token instead`);
      failed = true;
    }
  });
}
process.exit(failed ? 1 : 0);
