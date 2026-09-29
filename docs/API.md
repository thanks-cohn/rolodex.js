# Rolodex.js Public API

Rolodex.js is a hierarchy-navigation engine for interfaces that need to expose a lot of structure without turning a right-click menu into submenu soup.

The public API is deliberately **platform-agnostic**. Cloudflare R2 is an important first use case, but the engine does not know what a bucket, file, repository, database record, game inventory, or document tree is.

## Design rules

1. **Stable IDs over DOM identity.** A node is addressed by its data ID, not by where it happens to render.
2. **Lazy by default.** A source only needs to provide the next level when Rolodex asks for it.
3. **Data and presentation stay separate.** Renderers decide what nodes look like.
4. **Intent lives in context.** The same hierarchy can be opened for Move, Copy, Pick, Inspect, Share, or any host-defined purpose.
5. **Everything important is inspectable.** Humans and agents can read state through the API instead of scraping pixels.
6. **Fields are addressable.** A host can patch one title or one metadata field without rebuilding a tree.
7. **100 levels is the default supported ceiling.** It is configurable, explicit, and validated.

## Minimum source

A custom source only needs two functions:

```js
import { createRolodex, createSource } from "./src/rolodex.js";

const source = createSource({
  async getRoot(context) {
    return [
      { id: "projects", title: "Projects", hasChildren: true }
    ];
  },

  async getChildren(node, context) {
    if (node.id === "projects") {
      return [
        { id: "alpha", title: "Alpha", hasChildren: true },
        { id: "beta", title: "Beta", hasChildren: false }
      ];
    }

    return [];
  }
});

const menu = createRolodex({
  source,
  maxDepth: 100,
  context: {
    intent: "move",
    selection: ["build.zip"]
  }
});

await menu.open();
```

## Node schema

```js
{
  id: "photos-2026",       // required, stable
  title: "Photos",         // user-facing label
  kind: "folder",          // host-defined semantic type
  description: "2026",     // optional secondary text
  icon: "folder",          // renderer-defined
  hasChildren: true,
  disabled: false,
  meta: {
    // completely host-defined
  }
}
```

Rolodex reserves behavior only for its documented fields. Everything inside `meta` belongs to the host application.

## Context and intent

Context is passed back to the source on every source operation.

```js
const menu = createRolodex({
  source,
  context: {
    intent: "copy",
    selection: [
      { bucket: "incoming", key: "build.zip" }
    ],
    accountId: "abc"
  }
});
```

Rolodex does not interpret `intent`. The source may use it to filter or annotate results.

## Navigation

```js
await menu.navigate.root();
await menu.navigate.to("projects");
await menu.navigate.parent();
await menu.navigate.back();
await menu.navigate.forward();

menu.navigate.path();
```

The path contains semantic nodes, not DOM elements.

## Data access

```js
await menu.data.get("alpha");
await menu.data.children("alpha");
await menu.data.search("archive");
await menu.data.refresh("alpha");
menu.data.clearCache();
```

## Field-level editing

A host can update only what changed.

```js
await menu.data.set("alpha", "title", "Alpha Project");

await menu.data.patch("alpha", {
  title: "Alpha Project",
  disabled: true
});
```

If the source exposes `updateNode()`, Rolodex delegates the write to the source. Otherwise the patch is local to the current session.

## Selection

```js
menu.selection.set(["file-a", "file-b"]);
menu.selection.add("file-c");
menu.selection.remove("file-a");
menu.selection.clear();
menu.selection.get();
```

This is intentionally independent of the currently navigated path.

## Capabilities

```js
menu.capabilities();
```

Example:

```js
{
  core: {
    maxDepth: 100,
    history: true,
    selection: true,
    inspection: true,
    fieldEditing: true,
    lazyLoading: true
  },
  source: {
    read: true,
    search: true,
    edit: true,
    move: true,
    copy: true
  }
}
```

Capability names beyond the core set are allowed. A Cloudflare adapter can advertise `copy` and `move`; a read-only catalog might advertise only `read` and `search`.

## Events

```js
const off = menu.events.on("navigate", snapshot => {
  console.log(snapshot.pathIds);
});

menu.events.on("nodechange", change => {
  console.log(change.before, change.after);
});

menu.events.on("selection", ids => {
  console.log(ids);
});

off();
```

Current core events:

- `open`
- `close`
- `navigate`
- `selection`
- `nodechange`
- `trace`

Renderers and adapters may define additional namespaced events.

## Agent/programmer inspection

```js
menu.inspect();
menu.debug.inspect();
menu.debug.validate();
menu.debug.trace();
```

Example snapshot:

```js
{
  open: true,
  maxDepth: 100,
  depth: 4,
  currentNode: { id: "september", title: "September", ... },
  pathIds: ["archive", "2026", "photos", "september"],
  selection: ["build.zip"],
  cachedNodeCount: 43,
  history: {
    canBack: true,
    canForward: false
  }
}
```

The important rule is that a coding agent should be able to answer "where am I?", "what is selected?", "what can I do?", and "what node is wrong?" without querying the renderer.

## Validation

```js
const report = menu.debug.validate();

if (!report.ok) {
  console.error(report.errors);
}
```

The core validates depth and structural invariants. Renderer-specific geometry validation belongs to the renderer/debug layer.

## Static source

Useful for tests, demos, and small menus:

```js
const source = Rolodex.source.static([
  {
    id: "move",
    title: "Move",
    children: [
      {
        id: "bucket-a",
        title: "Bucket A",
        children: [
          { id: "folder-a", title: "Folder A" }
        ]
      }
    ]
  }
]);
```

## Remote source

For generic HTTP-backed trees:

```js
const source = Rolodex.source.remote({
  endpoint: "https://example.com/api/rolodex"
});
```

Contract:

```text
GET   /root
GET   /node/:id
GET   /node/:id/children
GET   /search?q=...
PATCH /node/:id
```

Responses may be an array of nodes or `{ "items": [...] }`.

This adapter is intentionally generic. Production applications may prefer a custom adapter so authentication, pagination, cursors, retries, batching, and source-specific semantics remain explicit.

## Cloudflare-shaped adapter example

Rolodex.js should not contain R2 semantics in its core.

A host adapter can map R2 buckets and prefixes to generic nodes:

```js
const r2Source = createSource({
  async getRoot(ctx) {
    const buckets = await cloudflare.listBuckets();

    return buckets.map(bucket => ({
      id: `bucket:${bucket.name}`,
      title: bucket.name,
      kind: "bucket",
      hasChildren: true,
      meta: { bucket: bucket.name }
    }));
  },

  async getChildren(node, ctx) {
    const { bucket, prefix = "" } = node.meta;
    const page = await cloudflare.listObjects({ bucket, prefix });

    return page.prefixes.map(childPrefix => ({
      id: `prefix:${bucket}:${childPrefix}`,
      title: childPrefix.split("/").filter(Boolean).at(-1),
      kind: "prefix",
      hasChildren: true,
      meta: { bucket, prefix: childPrefix }
    }));
  },

  capabilities() {
    return {
      read: true,
      move: true,
      copy: true,
      search: true,
      lazyLoading: true
    };
  }
});
```

The host application decides what selecting a destination means.

## Renderers

The core intentionally does not dictate HTML.

The current Rolodex right-click prototype should eventually become one renderer:

```js
const model = createRolodex({ source });

RolodexRenderer.mount({
  model,
  target: document.body
});
```

Other possible renderers:

- classic context menu;
- mobile drill-down;
- command palette;
- tree view;
- accessibility-first list view;
- headless/agent-only consumer.

All can share the same source and navigation model.

## Interaction and geometry

The current prototype already explores a richer renderer API for:

- vertical rails;
- visible-tail controls;
- overlap/contact inspection;
- invisible interaction regions;
- hover occlusion;
- deterministic slot geometry.

Those should remain renderer concerns and expose themselves through a parallel namespace rather than contaminating the data core.

Long-term shape:

```js
rolodex.layout.inspect();
rolodex.layout.validate();

rolodex.interaction.registerRegion(...);
rolodex.interaction.overlaps(...);
rolodex.interaction.contacts(...);
rolodex.interaction.blockUnderlyingHover(...);
```

## Recommended public shape

The intended vocabulary is:

```js
Rolodex.create()
Rolodex.source.*

instance.open()
instance.close()

instance.data.*
instance.navigate.*
instance.selection.*
instance.events.*
instance.debug.*

instance.capabilities()
instance.inspect()
```

This gives humans, applications, and agents the same semantic surface.

## Stability

This is an **API preview** built alongside the v0.1 visual prototype.

The point of introducing it early is to keep future rendering work from hard-coding Cloudflare, DOM structure, or one particular right-click menu into Rolodex.js itself.
