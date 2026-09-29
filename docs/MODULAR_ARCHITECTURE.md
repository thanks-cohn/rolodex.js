# Rolodex.js Modular Architecture and Versioning Plan

## Purpose

Rolodex.js is intended to grow as a cohesive family of reusable interface modules built on one shared semantic core.

The project should remain unified in design language, data contracts, navigation semantics, inspection APIs, and development philosophy, while allowing developers to adopt only the parts they need.

The guiding principle is:

> **Shared semantics, separate modules, independent adoption, coordinated versioning.**

This structure is meant to keep the project flexible without turning it into a single monolithic package.

---

## Proposed Module Structure

```text
Rolodex.js
├── core
├── context-menu
├── landing
├── geometry
├── interaction
├── debug
└── adapters
```

### core

The platform-agnostic foundation.

Responsibilities include:

- node and hierarchy semantics;
- source adapters;
- navigation state;
- history;
- selection;
- field-level editing;
- capabilities;
- lifecycle events;
- validation;
- semantic inspection for programmers and agents.

The core should not depend on any specific renderer, browser layout, cloud provider, or application domain.

### context-menu

The right-click / contextual interaction renderer.

Responsibilities may include:

- pointer-anchored opening;
- nested contextual actions;
- deep hierarchy presentation;
- vertical rails;
- compressed depth views;
- close behavior;
- hover and pointer interaction;
- viewport collision handling;
- contextual action semantics.

This is the primary reference experience for navigating large or deeply nested datasets from a compact contextual surface.

### landing

A larger persistent renderer for full-page or embedded navigation.

Responsibilities may include:

- persistent hierarchy navigation;
- larger cards or panels;
- previews;
- richer explanatory content;
- breadcrumbs;
- persistent sidebars;
- desktop-style exploration.

The landing renderer should reuse the same semantic model as the context-menu renderer rather than implementing its own hierarchy logic.

### geometry

Shared spatial and layout utilities.

Responsibilities may include:

- deterministic slot placement;
- bounding-rectangle inspection;
- overlap and contact detection;
- layout validation;
- collision rules;
- expected-vs-actual geometry comparison.

This module should remain reusable across renderers.

### interaction

Shared interaction primitives.

Responsibilities may include:

- invisible interaction regions;
- pointer occlusion;
- hit-region registration;
- hover blocking;
- interaction ownership;
- target grouping;
- event routing.

The interaction layer should remain generic enough to support future renderers and host applications.

### debug

Programmer- and agent-facing inspection tools.

Responsibilities may include:

- state snapshots;
- geometry inspection;
- traces;
- invariant checks;
- diagnostics;
- source and capability inspection;
- renderer-specific validation.

Debugging should remain a first-class design concern rather than an afterthought.

### adapters

Optional integrations that translate external systems into Rolodex-compatible sources.

Examples may include:

- Cloudflare R2;
- filesystems;
- GitHub;
- databases;
- CMS platforms;
- custom APIs.

Adapters must remain separate from the core so Rolodex.js stays platform-agnostic.

---

## Adoption Model

Developers should be able to use only the modules they need.

For example, a contextual interface could use:

```js
import { RolodexCore } from "rolodex.js/core";
import { ContextMenu } from "rolodex.js/context-menu";
```

A full-page explorer could instead use:

```js
import { RolodexCore } from "rolodex.js/core";
import { LandingMenu } from "rolodex.js/landing";
```

A project that needs everything may use a higher-level package entry point.

The objective is to avoid forcing consumers to import renderer-specific code, debugging utilities, or adapters they do not need.

---

## Shared Model, Multiple Renderers

All renderers should consume the same underlying model.

```text
                 Rolodex Core
          data / state / navigation
                     │
        ┌────────────┼────────────┐
        │            │            │
  Context Menu    Landing     Future Renderers
```

This allows one data source to power multiple interfaces.

For example, a single Cloudflare source could support:

- right-click move/copy navigation;
- a full-page bucket explorer;
- a command-style interface;
- an agent-driven interface.

The hierarchy and data logic should not need to be rewritten for each renderer.

---

## API Consistency

Where possible, modules should use related method names and lifecycle concepts.

Common concepts may include:

```js
open()
close()
destroy()

navigate.to()
navigate.back()
navigate.forward()

inspect()
validate()
```

Renderer-specific APIs should live in renderer-specific namespaces rather than being added to the core indiscriminately.

Examples:

```js
contextMenu.position.*
contextMenu.rails.*
contextMenu.interaction.*

landing.layout.*
landing.panels.*
landing.preview.*
```

This keeps the public API predictable while preserving specialization.

---

## Versioning Strategy

Rolodex.js should maintain an overall project version while also tracking the maturity of major modules.

Example:

```text
Rolodex.js          v0.2
core                v0.2
context-menu        v0.2
landing             v0.1
interaction         v0.2
geometry            v0.2
debug               v0.2
```

This allows the project to progress as one system while still communicating that individual modules may be newer, more experimental, or more stable than others.

### Release Notes

Each project release should include module-level changes.

Example:

```text
Rolodex.js v0.3

Core
- Added cursor-aware source pagination
- Added abortable source requests

Context Menu
- Improved deep-stack compression
- Added keyboard navigation

Landing
- Added first public renderer
- Added persistent trail panels

Debug
- Added richer geometry snapshots
- Added interaction-region tracing
```

This makes upgrades easier to understand for both human developers and coding agents.

---

## Compatibility Goals

As the project grows:

- the semantic core should remain stable;
- renderer internals may evolve more aggressively;
- adapters should declare supported capabilities;
- breaking changes should be documented clearly;
- modules should avoid unnecessary cross-dependencies;
- public APIs should be small, explicit, and inspectable;
- source adapters should remain interchangeable;
- renderer-specific behavior should not leak into core data contracts.

---

## Long-Term Direction

Rolodex.js should remain one project with several reusable parts rather than becoming a collection of unrelated packages.

The intended evolution is:

1. stabilize the shared semantic core;
2. formalize the context-menu renderer;
3. introduce a landing/full-page renderer;
4. extract shared geometry and interaction primitives;
5. grow adapters around real use cases;
6. version modules clearly as their maturity changes.

The project should remain practical, composable, and understandable enough that developers can bring in only the pieces they need while still benefiting from a common model and API vocabulary.
