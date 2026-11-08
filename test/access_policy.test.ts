import assert from "node:assert/strict";
import { test } from "node:test";
import { exampleAssets, mayDownload } from "../src/access_policy.ts";

test("only the owner can download approved assets and live events; queued clips remain private", () => {
  const [avatar, event, queue] = exampleAssets("session-42");
  assert.equal(mayDownload(avatar, "session-42"), true);
  assert.equal(mayDownload(event, "session-42"), true);
  assert.equal(mayDownload(queue, "session-42"), false);
  assert.equal(mayDownload(avatar, "session-other"), false);
});
