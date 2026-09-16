import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const dynamic = "force-static";

function readExampleCss() {
  const nearby = fileURLToPath(new URL("../example.css", import.meta.url));
  try {
    return readFileSync(nearby, "utf8");
  } catch {
    return readFileSync(
      join(process.cwd(), "src/app/admin/example.css"),
      "utf8",
    );
  }
}

export function GET() {
  return new Response(readExampleCss(), {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
