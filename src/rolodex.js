/**
 * Rolodex.js — platform-agnostic hierarchy/navigation core.
 *
 * This module intentionally knows nothing about Cloudflare, filesystems,
 * GitHub, databases, or any particular renderer. It models deep hierarchical
 * data, navigation, editing, capabilities, history, and inspection.
 */

const DEFAULT_MAX_DEPTH = 100;

export class RolodexError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "RolodexError";
    this.code = code;
    this.details = details;
  }
}

export function normalizeNode(input, { parentId = null, depth = 0 } = {}) {
  if (!input || typeof input !== "object") {
    throw new RolodexError("INVALID_NODE", "Rolodex nodes must be objects.");
  }
  if (input.id == null || String(input.id).trim() === "") {
    throw new RolodexError("MISSING_NODE_ID", "Every Rolodex node requires a stable id.");
  }

  const id = String(input.id);
  const title = input.title == null ? id : String(input.title);

  return Object.freeze({
    id,
    title,
    kind: input.kind == null ? "item" : String(input.kind),
    description: input.description == null ? null : String(input.description),
    icon: input.icon ?? null,
    hasChildren: Boolean(input.hasChildren ?? input.children),
    disabled: Boolean(input.disabled),
    meta: input.meta && typeof input.meta === "object" ? input.meta : {},
    parentId: input.parentId == null ? parentId : String(input.parentId),
    depth: Number.isFinite(input.depth) ? Number(input.depth) : depth,
    raw: input
  });
}

export function createSource(adapter = {}) {
  const required = ["getRoot", "getChildren"];
  for (const key of required) {
    if (typeof adapter[key] !== "function") {
      throw new RolodexError(
        "INVALID_SOURCE",
        `Rolodex source requires ${key}().`
      );
    }
  }

  return Object.freeze({
    getRoot: adapter.getRoot,
    getChildren: adapter.getChildren,
    getNode: typeof adapter.getNode === "function" ? adapter.getNode : null,
    search: typeof adapter.search === "function" ? adapter.search : null,
    updateNode: typeof adapter.updateNode === "function" ? adapter.updateNode : null,
    refresh: typeof adapter.refresh === "function" ? adapter.refresh : null,
    capabilities:
      typeof adapter.capabilities === "function"
        ? adapter.capabilities
        : () => ({ read: true })
  });
}

export function createStaticSource(tree) {
  const roots = Array.isArray(tree) ? tree : tree?.items ?? [];
  const byId = new Map();
  const children = new Map();

  const visit = (items, parentId = null, depth = 0) => {
    const normalized = [];
    for (const item of items || []) {
      const node = normalizeNode(item, { parentId, depth });
      byId.set(node.id, node);
      normalized.push(node);

      const nested = Array.isArray(item.children) ? item.children : [];
      if (nested.length) visit(nested, node.id, depth + 1);
    }
    children.set(parentId, normalized);
  };

  visit(roots);

  return createSource({
    async getRoot() {
      return children.get(null) ?? [];
    },
    async getChildren(node) {
      return children.get(node.id) ?? [];
    },
    async getNode(id) {
      return byId.get(String(id)) ?? null;
    },
    async search(query) {
      const q = String(query ?? "").toLowerCase();
      return [...byId.values()].filter(
        n =>
          n.title.toLowerCase().includes(q) ||
          (n.description || "").toLowerCase().includes(q)
      );
    },
    capabilities() {
      return {
        read: true,
        search: true,
        edit: false,
        lazyLoading: false
      };
    }
  });
}

export function createRemoteSource({
  endpoint,
  fetchImpl = globalThis.fetch,
  headers = {},
  mapNode = x => x
} = {}) {
  if (!endpoint) throw new RolodexError("MISSING_ENDPOINT", "Remote source requires endpoint.");
  if (typeof fetchImpl !== "function") {
    throw new RolodexError("MISSING_FETCH", "Remote source requires a fetch implementation.");
  }

  const base = String(endpoint).replace(/\/$/, "");

  async function request(path, init = {}) {
    const response = await fetchImpl(base + path, {
      ...init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...headers,
        ...(init.headers || {})
      }
    });

    if (!response.ok) {
      throw new RolodexError("REMOTE_ERROR", `Remote source returned ${response.status}.`, {
        status: response.status,
        path
      });
    }

    return response.json();
  }

  const normalizeList = payload =>
    (payload?.items ?? payload ?? []).map(x => mapNode(x));

  return createSource({
    async getRoot(context) {
      return normalizeList(await request("/root?context=" + encodeURIComponent(JSON.stringify(context ?? {}))));
    },
    async getChildren(node, context) {
      return normalizeList(
        await request(
          "/node/" +
            encodeURIComponent(node.id) +
            "/children?context=" +
            encodeURIComponent(JSON.stringify(context ?? {}))
        )
      );
    },
    async getNode(id, context) {
      return mapNode(
        await request(
          "/node/" +
            encodeURIComponent(String(id)) +
            "?context=" +
            encodeURIComponent(JSON.stringify(context ?? {}))
        )
      );
    },
    async search(query, context) {
      return normalizeList(
        await request(
          "/search?q=" +
            encodeURIComponent(String(query ?? "")) +
            "&context=" +
            encodeURIComponent(JSON.stringify(context ?? {}))
        )
      );
    },
    async updateNode(id, patch, context) {
      return mapNode(
        await request("/node/" + encodeURIComponent(String(id)), {
          method: "PATCH",
          body: JSON.stringify({ patch, context })
        })
      );
    },
    async refresh(node, context) {
      if (!node) return this.getRoot(context);
      return this.getChildren(node, context);
    },
    capabilities() {
      return {
        read: true,
        search: true,
        edit: true,
        lazyLoading: true,
        remote: true
      };
    }
  });
}

class EventHub {
  #events = new Map();

  on(name, handler) {
    if (typeof handler !== "function") {
      throw new RolodexError("INVALID_HANDLER", "Event handler must be a function.");
    }
    if (!this.#events.has(name)) this.#events.set(name, new Set());
    this.#events.get(name).add(handler);
    return () => this.off(name, handler);
  }

  once(name, handler) {
    const off = this.on(name, (...args) => {
      off();
      handler(...args);
    });
    return off;
  }

  off(name, handler) {
    this.#events.get(name)?.delete(handler);
  }

  emit(name, payload) {
    for (const fn of this.#events.get(name) ?? []) fn(payload);
  }
}

export class RolodexCore {
  constructor({
    source,
    context = {},
    maxDepth = DEFAULT_MAX_DEPTH,
    cache = true
  } = {}) {
    this.source = createSource(source);
    this.context = context;
    this.maxDepth = Math.max(1, Number(maxDepth) || DEFAULT_MAX_DEPTH);
    this.cacheEnabled = Boolean(cache);

    this.events = new EventHub();

    this._nodes = new Map();
    this._children = new Map();
    this._path = [];
    this._history = [];
    this._historyIndex = -1;
    this._selection = new Set();
    this._opened = false;
    this._trace = [];

    this.data = Object.freeze({
      get: id => this.getNode(id),
      children: id => this.getChildren(id),
      set: (id, field, value) => this.setField(id, field, value),
      patch: (id, patch) => this.patchNode(id, patch),
      refresh: id => this.refresh(id),
      search: query => this.search(query),
      clearCache: () => this.clearCache()
    });

    this.navigate = Object.freeze({
      root: () => this.goRoot(),
      to: id => this.goTo(id),
      parent: () => this.goParent(),
      back: () => this.goBack(),
      forward: () => this.goForward(),
      path: () => [...this._path]
    });

    this.selection = Object.freeze({
      get: () => [...this._selection],
      set: ids => this.setSelection(ids),
      add: id => this.addSelection(id),
      remove: id => this.removeSelection(id),
      clear: () => this.clearSelection()
    });

    this.debug = Object.freeze({
      inspect: () => this.inspect(),
      validate: () => this.validate(),
      trace: () => [...this._trace],
      clearTrace: () => {
        this._trace.length = 0;
        return true;
      }
    });
  }

  #record(event, detail = {}) {
    const entry = Object.freeze({
      at: new Date().toISOString(),
      event,
      detail
    });
    this._trace.push(entry);
    this.events.emit("trace", entry);
    return entry;
  }

  #normalizeList(items, parentId = null, depth = 0) {
    const result = [];
    for (const input of items ?? []) {
      const node = normalizeNode(input, { parentId, depth });
      this._nodes.set(node.id, node);
      result.push(node);
    }
    return result;
  }

  #assertDepth(depth) {
    if (depth > this.maxDepth) {
      throw new RolodexError(
        "MAX_DEPTH_EXCEEDED",
        `Rolodex maximum depth is ${this.maxDepth}.`,
        { depth, maxDepth: this.maxDepth }
      );
    }
  }

  #pushHistory(path) {
    const ids = path.map(n => n.id);
    const current = this._history[this._historyIndex];
    if (current && current.join("/") === ids.join("/")) return;

    this._history = this._history.slice(0, this._historyIndex + 1);
    this._history.push(ids);
    this._historyIndex = this._history.length - 1;
  }

  async open({ context } = {}) {
    if (context !== undefined) this.context = context;
    const roots = await this.source.getRoot(this.context);
    const normalized = this.#normalizeList(roots, null, 0);
    this._children.set(null, normalized);
    this._path = [];
    this._opened = true;
    this.#pushHistory(this._path);
    this.#record("open", { rootCount: normalized.length });
    this.events.emit("open", this.inspect());
    return normalized;
  }

  close() {
    this._opened = false;
    this._path = [];
    this.#record("close");
    this.events.emit("close", this.inspect());
  }

  async getNode(id) {
    const key = String(id);
    if (this._nodes.has(key)) return this._nodes.get(key);
    if (!this.source.getNode) return null;

    const raw = await this.source.getNode(key, this.context);
    if (!raw) return null;

    const node = normalizeNode(raw);
    this._nodes.set(node.id, node);
    return node;
  }

  async getChildren(idOrNode) {
    const node =
      typeof idOrNode === "object" && idOrNode
        ? idOrNode
        : await this.getNode(idOrNode);

    if (!node) throw new RolodexError("NODE_NOT_FOUND", "Node not found.");

    const nextDepth = node.depth + 1;
    this.#assertDepth(nextDepth);

    if (this.cacheEnabled && this._children.has(node.id)) {
      return this._children.get(node.id);
    }

    const raw = await this.source.getChildren(node, this.context);
    const normalized = this.#normalizeList(raw, node.id, nextDepth);

    if (this.cacheEnabled) this._children.set(node.id, normalized);
    this.#record("children", { id: node.id, count: normalized.length, depth: nextDepth });
    return normalized;
  }

  async goRoot() {
    this._path = [];
    this.#pushHistory(this._path);
    this.#record("navigate:root");
    this.events.emit("navigate", this.inspect());
    return this._children.get(null) ?? this.open();
  }

  async goTo(id) {
    const node = await this.getNode(id);
    if (!node) throw new RolodexError("NODE_NOT_FOUND", `Unknown node: ${id}`);
    if (node.disabled) throw new RolodexError("NODE_DISABLED", `Node is disabled: ${id}`);

    const parentIndex = this._path.findIndex(x => x.id === node.parentId);
    let nextPath;

    if (node.parentId == null) {
      nextPath = [node];
    } else if (parentIndex >= 0) {
      nextPath = [...this._path.slice(0, parentIndex + 1), node];
    } else {
      nextPath = [...this._path, node];
    }

    this.#assertDepth(nextPath.length);
    this._path = nextPath;
    this.#pushHistory(this._path);
    this.#record("navigate:to", { id: node.id, depth: this._path.length });
    this.events.emit("navigate", this.inspect());

    return node.hasChildren ? this.getChildren(node) : [];
  }

  async goParent() {
    if (!this._path.length) return this.goRoot();
    this._path = this._path.slice(0, -1);
    this.#pushHistory(this._path);
    this.#record("navigate:parent");
    this.events.emit("navigate", this.inspect());

    const parent = this._path.at(-1);
    return parent ? this.getChildren(parent) : this._children.get(null) ?? [];
  }

  async #restoreHistory(index) {
    const ids = this._history[index];
    if (!ids) return this.inspect();

    const path = [];
    for (const id of ids) {
      const node = await this.getNode(id);
      if (node) path.push(node);
    }

    this._path = path;
    this._historyIndex = index;
    this.#record("navigate:history", { index });
    this.events.emit("navigate", this.inspect());
    return this.inspect();
  }

  goBack() {
    if (this._historyIndex <= 0) return Promise.resolve(this.inspect());
    return this.#restoreHistory(this._historyIndex - 1);
  }

  goForward() {
    if (this._historyIndex >= this._history.length - 1) {
      return Promise.resolve(this.inspect());
    }
    return this.#restoreHistory(this._historyIndex + 1);
  }

  async setField(id, field, value) {
    if (!field || typeof field !== "string") {
      throw new RolodexError("INVALID_FIELD", "Field name must be a string.");
    }
    return this.patchNode(id, { [field]: value });
  }

  async patchNode(id, patch) {
    const current = await this.getNode(id);
    if (!current) throw new RolodexError("NODE_NOT_FOUND", `Unknown node: ${id}`);

    const editable = {
      title: current.title,
      kind: current.kind,
      description: current.description,
      icon: current.icon,
      hasChildren: current.hasChildren,
      disabled: current.disabled,
      meta: current.meta,
      ...patch,
      id: current.id,
      parentId: current.parentId,
      depth: current.depth
    };

    let updated;
    if (this.source.updateNode) {
      const remote = await this.source.updateNode(current.id, patch, this.context);
      updated = normalizeNode(remote, {
        parentId: current.parentId,
        depth: current.depth
      });
    } else {
      updated = normalizeNode(editable, {
        parentId: current.parentId,
        depth: current.depth
      });
    }

    this._nodes.set(updated.id, updated);
    this.#record("node:patch", { id: updated.id, fields: Object.keys(patch) });
    this.events.emit("nodechange", { before: current, after: updated, patch });
    return updated;
  }

  async refresh(id = null) {
    if (id == null) {
      this._children.delete(null);
      const roots = this.#normalizeList(await this.source.getRoot(this.context), null, 0);
      this._children.set(null, roots);
      this.#record("refresh:root", { count: roots.length });
      return roots;
    }

    const node = await this.getNode(id);
    if (!node) throw new RolodexError("NODE_NOT_FOUND", `Unknown node: ${id}`);
    this._children.delete(node.id);

    const raw = this.source.refresh
      ? await this.source.refresh(node, this.context)
      : await this.source.getChildren(node, this.context);

    const list = this.#normalizeList(raw, node.id, node.depth + 1);
    this._children.set(node.id, list);
    this.#record("refresh:node", { id: node.id, count: list.length });
    return list;
  }

  async search(query) {
    if (!this.source.search) {
      throw new RolodexError("SEARCH_UNSUPPORTED", "This source does not support search.");
    }
    const raw = await this.source.search(query, this.context);
    const result = this.#normalizeList(raw);
    this.#record("search", { query: String(query), count: result.length });
    return result;
  }

  clearCache() {
    this._nodes.clear();
    this._children.clear();
    this.#record("cache:clear");
    return true;
  }

  setSelection(ids) {
    this._selection = new Set((Array.isArray(ids) ? ids : [ids]).map(String));
    this.#record("selection:set", { ids: [...this._selection] });
    this.events.emit("selection", [...this._selection]);
    return [...this._selection];
  }

  addSelection(id) {
    this._selection.add(String(id));
    this.events.emit("selection", [...this._selection]);
    return [...this._selection];
  }

  removeSelection(id) {
    this._selection.delete(String(id));
    this.events.emit("selection", [...this._selection]);
    return [...this._selection];
  }

  clearSelection() {
    this._selection.clear();
    this.events.emit("selection", []);
    return [];
  }

  capabilities() {
    return Object.freeze({
      core: {
        maxDepth: this.maxDepth,
        history: true,
        selection: true,
        inspection: true,
        fieldEditing: true,
        lazyLoading: true
      },
      source: this.source.capabilities(this.context) ?? {}
    });
  }

  inspect() {
    const current = this._path.at(-1) ?? null;
    return Object.freeze({
      open: this._opened,
      maxDepth: this.maxDepth,
      depth: this._path.length,
      currentNode: current,
      path: [...this._path],
      pathIds: this._path.map(x => x.id),
      selection: [...this._selection],
      rootCount: this._children.get(null)?.length ?? null,
      cachedNodeCount: this._nodes.size,
      cachedBranchCount: this._children.size,
      history: {
        index: this._historyIndex,
        length: this._history.length,
        canBack: this._historyIndex > 0,
        canForward: this._historyIndex >= 0 && this._historyIndex < this._history.length - 1
      },
      capabilities: this.capabilities()
    });
  }

  validate() {
    const errors = [];
    const warnings = [];

    if (this._path.length > this.maxDepth) {
      errors.push("path-exceeds-max-depth");
    }

    const pathIds = this._path.map(n => n.id);
    if (new Set(pathIds).size !== pathIds.length) {
      warnings.push("path-contains-repeated-node-id");
    }

    for (const [parentId, list] of this._children) {
      const seen = new Set();
      for (const node of list) {
        if (seen.has(node.id)) errors.push(`duplicate-child-id:${parentId ?? "root"}:${node.id}`);
        seen.add(node.id);
      }
    }

    return Object.freeze({
      ok: errors.length === 0,
      errors,
      warnings,
      snapshot: this.inspect()
    });
  }
}

export function createRolodex(options) {
  return new RolodexCore(options);
}

export const Rolodex = Object.freeze({
  create: createRolodex,
  source: Object.freeze({
    create: createSource,
    static: createStaticSource,
    remote: createRemoteSource
  }),
  normalizeNode,
  Error: RolodexError,
  version: "0.1-api-preview"
});

export default Rolodex;
