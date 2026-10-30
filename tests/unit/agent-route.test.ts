import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return nextResolve(
        pathToFileURL(path.join(root, "node_modules/next/dist/compiled/server-only/empty.js")).href,
        context,
      );
    }

    if (specifier.startsWith("@/")) {
      const relative = specifier.slice(2);
      const filename = relative.endsWith(".ts") || relative.endsWith(".tsx") ? relative : `${relative}.ts`;
      return nextResolve(pathToFileURL(path.join(root, "src", filename)).href, context);
    }

    return nextResolve(specifier, context);
  },
});

const { GET } = await import("../../src/app/api/agent/route.ts");

function frames(body: string) {
  return body.split("\n\n").filter((frame) => frame.length > 0);
}

async function test(name: string, task: () => Promise<void>) {
  try {
    await task();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

await test("GET streams an empty query and ends with data: [DONE]", async () => {
  const response = GET(new Request("http://localhost/api/agent?q="));
  const body = await response.text();
  const events = frames(body);

  assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
  assert.equal(response.headers.get("x-accel-buffering"), "no");
  assert.equal(response.headers.get("connection"), null);
  assert.equal(events.at(-1), "data: [DONE]");
  assert.equal(events.some((frame) => frame.includes("empty_query")), true);
});

await test("cancelling the agent stream does not reject as unhandled", async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (error: unknown) => {
    unhandled.push(error);
  };

  process.on("unhandledRejection", onUnhandled);

  try {
    const response = GET(new Request("http://localhost/api/agent?q="));
    assert.ok(response.body);
    await response.body.cancel();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});
