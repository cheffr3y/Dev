import test from "node:test";
import assert from "node:assert/strict";
import { DocumentQueue, uploadDocument, type UploadState } from "./document-queue";
import { progressResponse } from "./progress-response";

test("queue continues after failure, serializes files and retries the original operation snapshot", async () => {
  const states: UploadState[] = [], attempts: string[] = [];
  let finish!: () => void;
  const blocked = new Promise<void>(resolve => { finish = resolve; });
  let active = 0, maximum = 0;
  const queue = new DocumentQueue(async (task, report) => {
    active++; maximum = Math.max(maximum, active); attempts.push(task.key);
    try {
      if (task.key === "a" && attempts.filter(key => key === "a").length === 1) { await blocked; throw new Error("Lost response"); }
      assert.deepEqual(task.fields, [["operationId", task.key]]);
      report({ message: "Storing" });
      return task.key + "-document";
    } finally { active--; }
  }, state => states.push(state));
  const file = new File(["bytes"], "photo.png");
  queue.add({ key: "a", file, fields: [["operationId", "a"]] });
  queue.add({ key: "b", file, fields: [["operationId", "b"]] });
  queue.retry("a"); // Active uploads cannot be queued a second time.
  finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(attempts, ["a", "b"]);
  assert.equal(states.find(state => state.key === "a" && state.status === "error")?.message, "Lost response");
  assert.ok(states.some(state => state.key === "b" && state.status === "ready"));
  queue.retry("a");
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(attempts, ["a", "b", "a"]);
  assert.equal(maximum, 1);
  assert.equal(states.at(-1)?.id, "a-document");
});

test("stream transport preserves JSON compatibility and sends progress followed by a terminal result", async () => {
  const work = async (report: (event: { message: string }) => void) => { report({ message: "Preparing" }); return Response.json({ id: "saved" }); };
  const plain = await progressResponse(new Request("http://localhost"), work);
  assert.deepEqual(await plain.json(), { id: "saved" });
  const streamed = await progressResponse(new Request("http://localhost", { headers: { accept: "application/x-ndjson" } }), work);
  assert.deepEqual((await streamed.text()).trim().split("\n").map(line => JSON.parse(line)), [{ type: "progress", message: "Preparing" }, { type: "ready", id: "saved" }]);
  const failure = await progressResponse(new Request("http://localhost", { headers: { accept: "application/x-ndjson" } }), async () => Response.json({ error: "Denied" }, { status: 403 }));
  assert.deepEqual(JSON.parse((await failure.text()).trim()), { type: "error", error: "Denied", status: 403 });
});

test("client reads fragmented progress and rejects truncated streams instead of reporting success", async () => {
  const original = globalThis.fetch;
  const task = { key: "retry-key", file: new File(["bytes"], "scan.pdf"), fields: [["operationId", "retry-key"]] as [string, string][] };
  const messages: string[] = [];
  try {
    globalThis.fetch = async (_url, options) => {
      assert.equal((options?.body as FormData).get("operationId"), "retry-key");
      return new Response(new ReadableStream({ start(controller) {
        for (const part of ['{"type":"pro', 'gress","message":"Preparing page 1"}\n{"type":"ready","id":"doc"}', '\n']) controller.enqueue(new TextEncoder().encode(part));
        controller.close();
      } }), { headers: { "content-type": "application/x-ndjson" } });
    };
    assert.equal(await uploadDocument("/upload", task, event => messages.push(event.message)), "doc");
    assert.deepEqual(messages, ["Preparing page 1"]);
    globalThis.fetch = async () => new Response('{"type":"progress","message":"Storing"}\n', { headers: { "content-type": "application/x-ndjson" } });
    await assert.rejects(uploadDocument("/upload", task, () => {}), /interrupted/);
  } finally { globalThis.fetch = original; }
});

test("leaving the page pauses pending files and allows their original task to be retried", async () => {
  let finish!: () => void;
  const blocked = new Promise<void>(resolve => { finish = resolve; });
  const attempts: string[] = [], states: UploadState[] = [];
  const queue = new DocumentQueue(async task => { attempts.push(task.key); if (task.key === "a") await blocked; return task.key; }, state => states.push(state));
  const file = new File(["bytes"], "file.png");
  queue.add({ key: "a", file, fields: [] });
  queue.add({ key: "b", file, fields: [] });
  queue.stop();
  finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(attempts, ["a"]);
  assert.ok(states.some(state => state.key === "b" && state.status === "error" && state.message.includes("paused")));
  queue.retry("b");
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(attempts, ["a", "b"]);
});
