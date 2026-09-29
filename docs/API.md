# Rolodex.js API Reference

> **Status:** API preview  
> **Core version:** `0.1-api-preview`  
> **Default maximum depth:** `100`

Rolodex.js provides a renderer-independent model for navigating, inspecting, selecting, and editing hierarchical data.

The core does not depend on a particular UI, storage provider, filesystem, cloud service, or framework. A host application supplies a **source adapter** that exposes hierarchical data. A renderer can then present the same model as a context menu, landing-page explorer, command interface, tree, or another interaction surface.

This document describes the API implemented by `src/rolodex.js` on the current `main` branch.

---

## Contents

- [Quick start](#quick-start)
- [Imports](#imports)
- [Concepts](#concepts)
- [Node model](#node-model)
- [Source adapters](#source-adapters)
- [Creating an instance](#creating-an-instance)
- [Lifecycle](#lifecycle)
- [Data API](#data-api)
- [Navigation API](#navigation-api)
- [Selection API](#selection-api)
- [Events](#events)
- [Inspection and debugging](#inspection-and-debugging)
- [Capabilities](#capabilities)
- [Static sources](#static-sources)
- [Remote sources](#remote-sources)
- [Error handling](#error-handling)
- [TypeScript](#typescript)
- [Adapter design guidance](#adapter-design-guidance)
- [Current limitations](#current-limitations)
- [API stability](#api-stability)

---

## Quick start

```js
import { createRolodex, createSource } from "../src/rolodex.js";

const source = createSource({
  async getRoot(context) {
    return [
      {
        id: "projects",
        title: "Projects",
        kind: "folder",
        hasChildren: true
      }
    ];
  },

  async getChildren(node, context) {
    if (node.id === "projects") {
      return [
        {
          id: "alpha",
          title: "Alpha",
          kind: "folder",
          hasChildren: false
        }
      ];
    }

    return [];
  }
});

const rolodex = createRolodex({
  source,
  maxDepth: 100,
  context: {
    intent: "browse"
  }
});

const roots = await rolodex.open();
console.log(roots);

await rolodex.navigate.to("projects");

console.log(rolodex.inspect());
```

The source owns the data. Rolodex owns navigation state, selection state, history, caching, normalization, inspection, and related semantics.

---

## Imports

The module currently exports:

```js
import Rolodex, {
  RolodexCore,
  RolodexError,
  createRolodex,
  createSource,
  createStaticSource,
  createRemoteSource,
  normalizeNode
} from "../src/rolodex.js";
```

The default export is a convenience object:

```js
Rolodex.create
Rolodex.source.create
Rolodex.source.static
Rolodex.source.remote
Rolodex.normalizeNode
Rolodex.Error
Rolodex.version
```

Example:

```js
const model = Rolodex.create({
  source: Rolodex.source.static([
    { id: "docs", title: "Documents" }
  ])
});
```

---

## Concepts

### Core

`RolodexCore` is the stateful hierarchy model. It manages:

- normalized nodes;
- lazy child retrieval;
- navigation path;
- back/forward history;
- selection;
- local caching;
- field-level patches;
- source capabilities;
- event delivery;
- trace history;
- structural validation.

### Source

A source adapter translates an external hierarchy into Rolodex nodes.

Examples include:

- an in-memory tree;
- Cloudflare R2 buckets and prefixes;
- filesystem directories;
- repositories;
- database records;
- CMS content;
- game inventories;
- custom HTTP APIs.

### Renderer

A renderer is intentionally outside the core API.

The current visual context-menu prototype is being developed as a renderer over the same underlying concepts. Future renderers can consume the core without changing the source adapter.

### Context

`context` is host-defined state passed to source operations.

Typical examples include:

```js
{
  intent: "move",
  selection: ["asset-123"],
  accountId: "account-1"
}
```

Rolodex does not assign meaning to these values. The source adapter decides how to use them.

---

## Node model

### Input node

A source returns objects compatible with `RolodexNodeInput`.

```js
{
  id: "photos-2026",
  title: "Photos",
  kind: "folder",
  description: "2026 archive",
  icon: "folder",
  hasChildren: true,
  disabled: false,
  meta: {
    bucket: "media",
    prefix: "photos/2026/"
  }
}
```

### Fields

| Field | Required | Type | Meaning |
| --- | --- | --- | --- |
| `id` | Yes | `string \| number` | Stable node identifier. Normalized to a string. |
| `title` | No | `string` | Human-readable label. Defaults to the normalized ID. |
| `kind` | No | `string` | Host-defined semantic type. Defaults to `"item"`. |
| `description` | No | `string \| null` | Optional secondary description. |
| `icon` | No | `unknown` | Renderer-defined icon value. |
| `hasChildren` | No | `boolean` | Indicates whether navigation may continue below this node. |
| `children` | No | `RolodexNodeInput[]` | Used primarily by static trees. |
| `disabled` | No | `boolean` | Prevents navigation through `navigate.to()`. |
| `meta` | No | `object` | Host-owned metadata. |
| `parentId` | No | `string \| null` | Normally assigned by Rolodex during normalization. |
| `depth` | No | `number` | Normally assigned by Rolodex during normalization. |

### Normalized node

Rolodex converts source values to immutable normalized nodes:

```js
{
  id,
  title,
  kind,
  description,
  icon,
  hasChildren,
  disabled,
  meta,
  parentId,
  depth,
  raw
}
```

The normalized node object itself is frozen with `Object.freeze()`.

`raw` retains the original input value supplied by the source.

### ID requirements

Every node must have a non-empty stable ID.

Invalid:

```js
{ title: "Untitled" }
```

Valid:

```js
{ id: "untitled", title: "Untitled" }
```

A source should avoid reusing the same ID for different logical nodes.

---

## Source adapters

Use `createSource()` to validate and normalize a source adapter.

```js
const source = createSource({
  getRoot,
  getChildren,
  getNode,
  search,
  updateNode,
  refresh,
  capabilities
});
```

Only two methods are required.

### `getRoot(context)`

**Required.**

Returns the top-level nodes.

```js
async getRoot(context) {
  return [
    { id: "a", title: "A", hasChildren: true },
    { id: "b", title: "B", hasChildren: false }
  ];
}
```

Return type:

```ts
RolodexNodeInput[] | Promise<RolodexNodeInput[]>
```

### `getChildren(node, context)`

**Required.**

Returns one level of children for a normalized node.

```js
async getChildren(node, context) {
  return api.listChildren(node.id);
}
```

Return type:

```ts
RolodexNodeInput[] | Promise<RolodexNodeInput[]>
```

### `getNode(id, context)`

**Optional.**

Retrieves a node by stable ID when it is not already in the local node cache.

```js
async getNode(id, context) {
  return database.findById(id);
}
```

If omitted, `data.get(id)` can only resolve nodes already known to the current Rolodex instance.

### `search(query, context)`

**Optional.**

Provides source-backed search.

```js
async search(query, context) {
  return api.search(query);
}
```

Calling `data.search()` without this method throws `SEARCH_UNSUPPORTED`.

### `updateNode(id, patch, context)`

**Optional.**

Persists a field-level patch in the backing source.

```js
async updateNode(id, patch, context) {
  return api.patchNode(id, patch);
}
```

The method must return the resulting node.

If `updateNode()` is omitted, `data.set()` and `data.patch()` update only the current Rolodex instance.

### `refresh(node, context)`

**Optional.**

Provides custom refresh behavior for a non-root node.

```js
async refresh(node, context) {
  return api.reloadChildren(node.id);
}
```

When omitted, Rolodex falls back to `getChildren(node, context)`.

Root refreshes use `getRoot(context)`.

### `capabilities(context)`

**Optional.**

Returns host-defined source capabilities.

```js
capabilities(context) {
  return {
    read: true,
    search: true,
    move: true,
    copy: true
  };
}
```

If omitted, the source reports:

```js
{ read: true }
```

Capability names are extensible.

---

## Creating an instance

### `createRolodex(options)`

Creates a `RolodexCore` instance.

```js
const rolodex = createRolodex({
  source,
  context: {},
  maxDepth: 100,
  cache: true
});
```

Equivalent:

```js
const rolodex = Rolodex.create({
  source,
  context: {},
  maxDepth: 100,
  cache: true
});
```

### Options

| Option | Required | Default | Description |
| --- | --- | --- | --- |
| `source` | Yes | — | Rolodex source adapter. |
| `context` | No | `{}` | Host-defined context passed to source operations. |
| `maxDepth` | No | `100` | Maximum accepted navigation depth. Minimum effective value is `1`. |
| `cache` | No | `true` | Enables child-list reuse after first retrieval. |

---

## Lifecycle

### `open(options?)`

Loads the root level and marks the instance open.

```js
const rootNodes = await rolodex.open();
```

A new context can be supplied at open time:

```js
await rolodex.open({
  context: {
    intent: "copy"
  }
});
```

Effects:

- retrieves `source.getRoot(context)`;
- normalizes and caches the root nodes;
- resets the current path to root;
- marks the instance open;
- records history;
- emits `open`.

Returns:

```ts
Promise<RolodexNode[]>
```

### `close()`

Marks the instance closed and clears the current navigation path.

```js
rolodex.close();
```

It emits `close`.

Closing does not clear the node cache, selection, trace, or history.

---

## Data API

The `data` namespace provides semantic access to nodes and source-backed data.

### `data.get(id)`

```js
const node = await rolodex.data.get("alpha");
```

Returns a cached node when available. Otherwise, if the source implements `getNode()`, the source is queried.

Returns:

```ts
Promise<RolodexNode | null>
```

### `data.children(id)`

```js
const children = await rolodex.data.children("projects");
```

Returns cached children when caching is enabled and the branch has already been loaded. Otherwise it calls `source.getChildren()`.

Returns:

```ts
Promise<RolodexNode[]>
```

### `data.set(id, field, value)`

Updates one field.

```js
const node = await rolodex.data.set(
  "alpha",
  "title",
  "Alpha Project"
);
```

This is shorthand for:

```js
rolodex.data.patch("alpha", {
  title: "Alpha Project"
});
```

### `data.patch(id, patch)`

Updates one or more fields.

```js
const node = await rolodex.data.patch("alpha", {
  title: "Alpha Project",
  disabled: true
});
```

If the source implements `updateNode()`, the patch is delegated to the source.

Otherwise the patch is local to the instance.

The following structural fields are preserved by the core during a patch:

- `id`
- `parentId`
- `depth`

After a successful patch, Rolodex emits `nodechange`.

### `data.refresh(id?)`

Refreshes root data or one branch.

Root:

```js
const roots = await rolodex.data.refresh();
```

Branch:

```js
const children = await rolodex.data.refresh("projects");
```

Branch refresh deletes the cached child list for that node and retrieves a fresh list.

### `data.search(query)`

```js
const matches = await rolodex.data.search("archive");
```

Requires a source `search()` implementation.

Returns:

```ts
Promise<RolodexNode[]>
```

### `data.clearCache()`

```js
rolodex.data.clearCache();
```

Clears the internal node and child-list caches.

Returns `true`.

This does not reset selection, navigation history, context, or trace history.

---

## Navigation API

The `navigate` namespace manages the current semantic path.

### `navigate.root()`

```js
const roots = await rolodex.navigate.root();
```

Moves the navigation path to root, records history, emits `navigate`, and returns the root node list.

If root data has not yet been loaded, `open()` is used.

### `navigate.to(id)`

```js
const nextLevel = await rolodex.navigate.to("projects");
```

Moves to the requested node.

If the node reports `hasChildren: true`, the method returns that node's children. Otherwise it returns an empty array.

Returns:

```ts
Promise<RolodexNode[]>
```

Important behavior:

- disabled nodes throw `NODE_DISABLED`;
- unknown nodes throw `NODE_NOT_FOUND`;
- maximum depth is enforced;
- navigation is recorded in history;
- `navigate` is emitted.

### `navigate.parent()`

```js
const siblings = await rolodex.navigate.parent();
```

Moves up one level and returns the child list corresponding to the resulting parent.

At root, it remains at root.

### `navigate.back()`

```js
const snapshot = await rolodex.navigate.back();
```

Restores the previous recorded navigation path when available.

Returns an inspection snapshot.

### `navigate.forward()`

```js
const snapshot = await rolodex.navigate.forward();
```

Restores the next recorded navigation path when available.

Returns an inspection snapshot.

### `navigate.path()`

```js
const path = rolodex.navigate.path();
```

Returns a shallow copy of the current normalized node path.

---

## Selection API

Selection is intentionally independent of navigation.

### `selection.get()`

```js
const selected = rolodex.selection.get();
```

Returns selected IDs as strings.

### `selection.set(ids)`

```js
rolodex.selection.set(["file-a", "file-b"]);
```

A single ID is also accepted:

```js
rolodex.selection.set("file-a");
```

Replaces the complete selection and emits `selection`.

### `selection.add(id)`

```js
rolodex.selection.add("file-c");
```

Adds an ID and emits `selection`.

### `selection.remove(id)`

```js
rolodex.selection.remove("file-a");
```

Removes an ID and emits `selection`.

### `selection.clear()`

```js
rolodex.selection.clear();
```

Clears all selected IDs and emits `selection`.

---

## Events

The event hub is available as `rolodex.events`.

### Subscribe

```js
const unsubscribe = rolodex.events.on("navigate", snapshot => {
  console.log(snapshot.pathIds);
});
```

`on()` returns an unsubscribe function.

### Subscribe once

```js
rolodex.events.once("open", snapshot => {
  console.log("Opened", snapshot);
});
```

### Unsubscribe explicitly

```js
function onSelection(ids) {
  console.log(ids);
}

rolodex.events.on("selection", onSelection);
rolodex.events.off("selection", onSelection);
```

### Core events

| Event | Payload |
| --- | --- |
| `open` | Current inspection snapshot |
| `close` | Current inspection snapshot |
| `navigate` | Current inspection snapshot |
| `selection` | Array of selected IDs |
| `nodechange` | `{ before, after, patch }` |
| `trace` | Trace entry |

A trace entry has the form:

```js
{
  at: "2026-09-28T...",
  event: "navigate:to",
  detail: {
    id: "projects",
    depth: 1
  }
}
```

Renderers and adapters may define their own namespaced events separately.

---

## Inspection and debugging

Inspection is a first-class part of Rolodex.js.

A host, developer tool, test, or coding agent should be able to understand semantic state without querying rendered DOM geometry.

### `inspect()`

```js
const snapshot = rolodex.inspect();
```

Example:

```js
{
  open: true,
  maxDepth: 100,
  depth: 2,
  currentNode: { id: "alpha", ... },
  path: [
    { id: "projects", ... },
    { id: "alpha", ... }
  ],
  pathIds: ["projects", "alpha"],
  selection: ["file-a"],
  rootCount: 3,
  cachedNodeCount: 12,
  cachedBranchCount: 4,
  history: {
    index: 2,
    length: 3,
    canBack: true,
    canForward: false
  },
  capabilities: {
    core: { ... },
    source: { ... }
  }
}
```

### `debug.inspect()`

Alias of `inspect()`.

```js
rolodex.debug.inspect();
```

### `debug.validate()`

Checks core structural invariants.

```js
const report = rolodex.debug.validate();

if (!report.ok) {
  console.error(report.errors);
}
```

Current checks include:

- path does not exceed `maxDepth`;
- duplicate child IDs are not present within one cached branch;
- repeated node IDs in the active path are reported as a warning.

Return shape:

```js
{
  ok: true,
  errors: [],
  warnings: [],
  snapshot: rolodex.inspect()
}
```

### `debug.trace()`

Returns a shallow copy of the accumulated trace.

```js
console.table(rolodex.debug.trace());
```

### `debug.clearTrace()`

Clears the trace and returns `true`.

```js
rolodex.debug.clearTrace();
```

---

## Capabilities

### `capabilities()`

```js
const capabilities = rolodex.capabilities();
```

Return shape:

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
    edit: true
  }
}
```

The `core` section describes Rolodex capabilities.

The `source` section is supplied by the source adapter and may include arbitrary provider-specific flags such as:

```js
{
  move: true,
  copy: true,
  rename: true
}
```

Consumers should treat source capabilities as descriptive feature flags rather than assume every adapter implements the same operations.

---

## Static sources

`createStaticSource()` converts an in-memory nested tree into a source.

```js
const source = createStaticSource([
  {
    id: "projects",
    title: "Projects",
    children: [
      {
        id: "alpha",
        title: "Alpha"
      }
    ]
  }
]);

const rolodex = createRolodex({ source });

await rolodex.open();
```

Equivalent convenience form:

```js
const source = Rolodex.source.static([
  {
    id: "projects",
    title: "Projects"
  }
]);
```

The static source includes:

- root retrieval;
- child retrieval;
- ID lookup;
- title/description search;
- read-only capability reporting.

Its capability report is:

```js
{
  read: true,
  search: true,
  edit: false,
  lazyLoading: false
}
```

---

## Remote sources

`createRemoteSource()` provides a small generic HTTP adapter.

```js
const source = createRemoteSource({
  endpoint: "https://example.com/api/rolodex"
});
```

Options:

```ts
{
  endpoint: string;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
  mapNode?: (value: unknown) => RolodexNodeInput;
}
```

### HTTP contract

The current adapter expects:

```text
GET   /root
GET   /node/:id
GET   /node/:id/children
GET   /search?q=...
PATCH /node/:id
```

Read requests append serialized Rolodex context as the `context` query parameter.

Example:

```text
GET /root?context=%7B%22intent%22%3A%22move%22%7D
```

The patch request body is:

```json
{
  "patch": {
    "title": "Renamed"
  },
  "context": {
    "intent": "rename"
  }
}
```

### List response format

Root, child, and search endpoints may return either:

```json
[
  { "id": "a", "title": "A" }
]
```

or:

```json
{
  "items": [
    { "id": "a", "title": "A" }
  ]
}
```

### `mapNode`

Use `mapNode` when the remote API does not already return Rolodex-shaped nodes.

```js
const source = createRemoteSource({
  endpoint: "/api/tree",

  mapNode(value) {
    return {
      id: value.uuid,
      title: value.name,
      hasChildren: value.childCount > 0,
      meta: value
    };
  }
});
```

### Authentication

Authentication belongs to the host application.

For example:

```js
const source = createRemoteSource({
  endpoint: "/api/tree",
  headers: {
    authorization: `Bearer ${token}`
  }
});
```

Rolodex does not own credentials.

### Remote errors

Any non-2xx response throws:

```js
new RolodexError("REMOTE_ERROR", ...)
```

The error `details` contains the HTTP status and requested path.

---

## Error handling

Rolodex-specific failures use `RolodexError`.

```js
try {
  await rolodex.navigate.to("missing");
} catch (error) {
  if (error instanceof RolodexError) {
    console.error(error.code, error.message, error.details);
  }
}
```

### Current error codes

| Code | Meaning |
| --- | --- |
| `INVALID_NODE` | A node value is not an object. |
| `MISSING_NODE_ID` | A node has no usable stable ID. |
| `INVALID_SOURCE` | A required source method is missing. |
| `MISSING_ENDPOINT` | A remote source was created without an endpoint. |
| `MISSING_FETCH` | No usable fetch implementation is available. |
| `REMOTE_ERROR` | The remote source returned a non-success HTTP status. |
| `INVALID_HANDLER` | An event handler is not a function. |
| `MAX_DEPTH_EXCEEDED` | Navigation or child loading exceeded `maxDepth`. |
| `NODE_NOT_FOUND` | A requested node could not be resolved. |
| `NODE_DISABLED` | Navigation was requested to a disabled node. |
| `INVALID_FIELD` | A field name supplied to `data.set()` is invalid. |
| `SEARCH_UNSUPPORTED` | The active source does not implement search. |

Applications should prefer `error.code` over matching error-message text.

---

## TypeScript

Type declarations are provided in:

```text
src/rolodex.d.ts
```

Primary exported interfaces include:

```ts
RolodexNodeInput
RolodexNode
RolodexSourceCapabilities
RolodexSource<Context>
RolodexInspect
RolodexCoreOptions<Context>
```

The `Context` type is generic:

```ts
type AppContext = {
  intent: "move" | "copy" | "browse";
  selection: string[];
};

const source: RolodexSource<AppContext> = {
  async getRoot(context) {
    return [];
  },

  async getChildren(node, context) {
    return [];
  }
};

const rolodex = createRolodex<AppContext>({
  source,
  context: {
    intent: "browse",
    selection: []
  }
});
```

---

## Adapter design guidance

### Keep stable IDs stable

IDs are the semantic identity of a node. Do not derive them from temporary DOM state or array position.

Prefer:

```js
id: `object:${bucket}:${key}`
```

over:

```js
id: String(index)
```

when list ordering may change.

### Keep provider data in `meta`

Use the standard fields for shared Rolodex semantics and place provider-specific information in `meta`.

```js
{
  id: "object:media:logo.svg",
  title: "logo.svg",
  kind: "object",
  hasChildren: false,
  meta: {
    bucket: "media",
    key: "logo.svg",
    etag: "...",
    size: 4128
  }
}
```

### Keep credentials outside Rolodex

Adapters may call authenticated services, but credential ownership belongs to the host application.

The included Cloudflare example follows this model:

```js
createR2RolodexSource(hostCloudflareClient)
```

Rolodex receives an already-authorized client rather than storing Cloudflare credentials itself.

### Prefer lazy retrieval for large hierarchies

A source does not need to construct the full tree before opening Rolodex.

```js
async getChildren(node) {
  return fetchOnlyThisLevel(node.id);
}
```

This keeps the core suitable for very deep hierarchies.

### Advertise optional behavior

If an adapter supports operations outside the core contract, expose them through `capabilities()`.

```js
capabilities() {
  return {
    read: true,
    search: true,
    move: true,
    copy: true
  };
}
```

---

## Cloudflare R2 example

A reference adapter is included at:

```text
examples/cloudflare-r2-adapter.js
```

It demonstrates how bucket, prefix, and object data can be translated into Rolodex nodes without adding Cloudflare-specific behavior to the core.

Example node IDs:

```text
bucket:assets
prefix:assets:images/
object:assets:images/logo.svg
```

The host supplies the Cloudflare client.

---

## Current limitations

The current API is intentionally an early preview. Developers evaluating it should be aware of the following boundaries.

### No official renderer package yet

The visual Rolodex prototype and the semantic core are not yet exposed as one installable renderer API.

The intended direction is for modules such as the context-menu and landing renderer to consume `RolodexCore`.

### No package-manager release yet

The repository currently exposes source files directly. A formal package entry point and package-manager distribution are future work.

### Remote pagination is not yet first-class

The generic remote adapter expects complete lists from its current endpoints. Cursor and page semantics are planned but are not part of the current core contract.

### Request cancellation is not yet first-class

Source operations do not currently receive an `AbortSignal`.

Applications with highly concurrent remote navigation may prefer a custom adapter and host-side request coordination for now.

### Direct deep-path reconstruction is limited

`navigate.to(id)` works best when parent relationships have already been established in the current instance or returned by the source. A dedicated path-resolution API is planned for robust arbitrary deep linking.

### Renderer geometry is separate

The current visual prototype exposes extensive rail, geometry, and interaction-debug APIs. Those are not yet part of the stable core namespace documented here.

See `docs/MODULAR_ARCHITECTURE.md` for the intended separation between core, renderers, geometry, interaction, debug, and adapters.

---

## API stability

The current version is:

```text
0.1-api-preview
```

The API is usable for experimentation and adapter development, but names and contracts may still change before a stable release.

The project intends to preserve a small, coherent vocabulary:

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

Renderer-specific behavior should remain outside the semantic core.

For the broader module and versioning strategy, see:

```text
docs/MODULAR_ARCHITECTURE.md
```

The long-term goal is one shared Rolodex model with independently adoptable modules for context menus, landing experiences, geometry, interaction, debugging, and external adapters.
