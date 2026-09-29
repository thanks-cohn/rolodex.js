export interface RolodexNodeInput {
  id: string | number;
  title?: string;
  kind?: string;
  description?: string | null;
  icon?: unknown;
  hasChildren?: boolean;
  children?: RolodexNodeInput[];
  disabled?: boolean;
  meta?: Record<string, unknown>;
  parentId?: string | null;
  depth?: number;
}

export interface RolodexNode {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly description: string | null;
  readonly icon: unknown;
  readonly hasChildren: boolean;
  readonly disabled: boolean;
  readonly meta: Record<string, unknown>;
  readonly parentId: string | null;
  readonly depth: number;
  readonly raw: RolodexNodeInput;
}

export interface RolodexSourceCapabilities {
  read?: boolean;
  search?: boolean;
  edit?: boolean;
  move?: boolean;
  copy?: boolean;
  delete?: boolean;
  lazyLoading?: boolean;
  remote?: boolean;
  [key: string]: unknown;
}

export interface RolodexSource<Context = unknown> {
  getRoot(context: Context): Promise<RolodexNodeInput[]> | RolodexNodeInput[];
  getChildren(node: RolodexNode, context: Context): Promise<RolodexNodeInput[]> | RolodexNodeInput[];
  getNode?(id: string, context: Context): Promise<RolodexNodeInput | null> | RolodexNodeInput | null;
  search?(query: string, context: Context): Promise<RolodexNodeInput[]> | RolodexNodeInput[];
  updateNode?(
    id: string,
    patch: Partial<RolodexNodeInput>,
    context: Context
  ): Promise<RolodexNodeInput> | RolodexNodeInput;
  refresh?(
    node: RolodexNode | null,
    context: Context
  ): Promise<RolodexNodeInput[]> | RolodexNodeInput[];
  capabilities?(context: Context): RolodexSourceCapabilities;
}

export interface RolodexInspect {
  open: boolean;
  maxDepth: number;
  depth: number;
  currentNode: RolodexNode | null;
  path: RolodexNode[];
  pathIds: string[];
  selection: string[];
  rootCount: number | null;
  cachedNodeCount: number;
  cachedBranchCount: number;
  history: {
    index: number;
    length: number;
    canBack: boolean;
    canForward: boolean;
  };
  capabilities: {
    core: Record<string, unknown>;
    source: RolodexSourceCapabilities;
  };
}

export interface RolodexCoreOptions<Context = unknown> {
  source: RolodexSource<Context>;
  context?: Context;
  maxDepth?: number;
  cache?: boolean;
}

export class RolodexError extends Error {
  code: string;
  details?: unknown;
}

export class RolodexCore<Context = unknown> {
  constructor(options: RolodexCoreOptions<Context>);
  context: Context;
  maxDepth: number;

  open(options?: { context?: Context }): Promise<RolodexNode[]>;
  close(): void;
  getNode(id: string): Promise<RolodexNode | null>;
  getChildren(idOrNode: string | RolodexNode): Promise<RolodexNode[]>;
  capabilities(): {
    core: Record<string, unknown>;
    source: RolodexSourceCapabilities;
  };
  inspect(): RolodexInspect;
  validate(): {
    ok: boolean;
    errors: string[];
    warnings: string[];
    snapshot: RolodexInspect;
  };

  data: {
    get(id: string): Promise<RolodexNode | null>;
    children(id: string): Promise<RolodexNode[]>;
    set(id: string, field: string, value: unknown): Promise<RolodexNode>;
    patch(id: string, patch: Partial<RolodexNodeInput>): Promise<RolodexNode>;
    refresh(id?: string | null): Promise<RolodexNode[]>;
    search(query: string): Promise<RolodexNode[]>;
    clearCache(): boolean;
  };

  navigate: {
    root(): Promise<RolodexNode[]>;
    to(id: string): Promise<RolodexNode[]>;
    parent(): Promise<RolodexNode[]>;
    back(): Promise<RolodexInspect>;
    forward(): Promise<RolodexInspect>;
    path(): RolodexNode[];
  };

  selection: {
    get(): string[];
    set(ids: string | string[]): string[];
    add(id: string): string[];
    remove(id: string): string[];
    clear(): string[];
  };

  events: {
    on(name: string, handler: (payload: unknown) => void): () => void;
    once(name: string, handler: (payload: unknown) => void): () => void;
    off(name: string, handler: (payload: unknown) => void): void;
  };

  debug: {
    inspect(): RolodexInspect;
    validate(): ReturnType<RolodexCore["validate"]>;
    trace(): unknown[];
    clearTrace(): boolean;
  };
}

export function normalizeNode(
  input: RolodexNodeInput,
  options?: { parentId?: string | null; depth?: number }
): RolodexNode;

export function createSource<Context = unknown>(
  adapter: RolodexSource<Context>
): RolodexSource<Context>;

export function createStaticSource(
  tree: RolodexNodeInput[] | { items: RolodexNodeInput[] }
): RolodexSource;

export function createRemoteSource(options: {
  endpoint: string;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
  mapNode?: (value: unknown) => RolodexNodeInput;
}): RolodexSource;

export function createRolodex<Context = unknown>(
  options: RolodexCoreOptions<Context>
): RolodexCore<Context>;

export const Rolodex: {
  create: typeof createRolodex;
  source: {
    create: typeof createSource;
    static: typeof createStaticSource;
    remote: typeof createRemoteSource;
  };
  normalizeNode: typeof normalizeNode;
  Error: typeof RolodexError;
  version: string;
};

export default Rolodex;
