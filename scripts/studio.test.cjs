const fs = require("node:fs");
const assert = require("node:assert/strict");
const ts = require("typescript");
function load(file, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)(
    (name) => (name in mocks ? mocks[name] : require(name)),
    module,
    module.exports,
  );
  return module.exports;
}
async function main() {
  const schema = load("src/lib/studio/schema.ts");
  assert.equal(
    schema.mediaSettings.safeParse({ trimStart: 10, trimEnd: 5 }).success,
    false,
  );
  assert.equal(schema.mediaSettings.parse({}).mute, false);
  assert.equal(
    schema.draftInput.safeParse({
      title: "A title",
      caption: "A caption",
      variants: {},
    }).success,
    true,
  );
  const draft = {
    title: "Title",
    caption: "Caption",
    variants: {},
    scheduled_for: null,
  };
  assert.throws(
    () => schema.validatePost(draft, [], "video", 1),
    /Choose at least/,
  );
  assert.throws(
    () => schema.validatePost(draft, [{ platform: "youtube" }], "carousel", 2),
    /YouTube needs a video/,
  );
  assert.throws(
    () =>
      schema.validatePost(draft, [{ platform: "facebook" }], "carousel", 11),
    /10 photos/,
  );
  assert.throws(
    () =>
      schema.validatePost(
        { ...draft, variants: { instagram: "x".repeat(2201) } },
        [{ platform: "instagram" }],
        "video",
        1,
      ),
    /2200/,
  );
  schema.validatePost(draft, [{ platform: "youtube" }], "video", 1);
  class StudioError extends Error {
    constructor(message, status = 400) {
      super(message);
      this.status = status;
    }
  }
  let state = "approved",
    postCount = 0,
    timeout = false,
    saved;
  const row = {
    id: "draft",
    brand_id: "brand",
    content_item_id: "item",
    destination_ids: ["destination"],
    ...draft,
  };
  const ctx = {
    workspace: "workspace",
    db: {
      rpc: async () => {
        if (state !== "approved") return { error: { message: "Review first" } };
        state = "submitting";
        return { data: row };
      },
      from(table) {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          single: async () => ({
            data: {
              kind: "video",
              output_path: "asset",
              metadata: { outputPaths: ["asset"] },
            },
          }),
          in: async () => ({
            data: [
              {
                id: "destination",
                platform: "youtube",
                remote_id: "youtube-account",
              },
            ],
          }),
          update(values) {
            saved = values;
            if (values.status) state = values.status;
            return this;
          },
          then(resolve) {
            resolve({ error: null });
          },
        };
      },
    },
  };
  const publisher = load("src/lib/studio/publisher.ts", {
    "./server": {
      integration: async () => "mock-key",
      signedMedia: async () => "https://storage.test/asset",
      StudioError,
    },
    "./schema": schema,
  });
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    if (String(url).endsWith("/media/presign"))
      return Response.json({
        uploadUrl: "https://upload.test/file",
        publicUrl: "https://media.test/file",
      });
    if (String(url) === "https://storage.test/asset")
      return new Response("media");
    if (String(url) === "https://upload.test/file")
      return new Response(null, { status: 200 });
    if (String(url).endsWith("/posts")) {
      postCount++;
      const body = JSON.parse(init.body);
      assert.deepEqual(
        body.platforms.map((p) => p.accountId),
        ["youtube-account"],
      );
      if (timeout) throw new Error("network timeout");
      return Response.json({
        post: {
          _id: "remote-id",
          status: "scheduled",
          platforms: [{ platform: "youtube", status: "pending" }],
        },
      });
    }
    throw new Error("Unexpected URL " + url);
  };
  try {
    await assert.rejects(
      publisher.submitDraft(ctx, "draft", false, "public", false),
      /Confirm/,
    );
    assert.equal(postCount, 0);
    const results = await Promise.allSettled([
      publisher.submitDraft(ctx, "draft", true, "public", false),
      publisher.submitDraft(ctx, "draft", true, "public", false),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(postCount, 1);
    assert.equal(state, "scheduled");
    assert.equal(saved.provider_post_id, "remote-id");
    state = "approved";
    postCount = 0;
    timeout = true;
    await assert.rejects(
      publisher.submitDraft(ctx, "draft", true, "public", false),
      /interrupted/,
    );
    assert.equal(state, "unknown");
    assert.equal(postCount, 1);
    await assert.rejects(
      publisher.submitDraft(ctx, "draft", true, "public", false),
      /Review first/,
    );
    assert.equal(
      postCount,
      1,
      "an ambiguous request must never automatically submit again",
    );
    assert.equal(
      publisher.providerStatus({
        status: "published",
        platforms: [{ status: "published" }, { status: "failed" }],
      }),
      "partial",
    );
    assert.equal(
      publisher.providerStatus({ status: "processing" }),
      "submitting",
    );
  } finally {
    global.fetch = originalFetch;
  }
  console.log(
    "PASS: platform/media constraints, manual drafting, consent, exact destinations, atomic duplicate prevention, ambiguous publish hold, partial platform failure.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
