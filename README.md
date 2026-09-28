# Rolodex.js

**v0.1**

Rolodex.js is a small UI experiment about making deep menus, saved paths, and spatial navigation feel a little more physical.

The current prototype grew out of a simple question: what if nested menus did not have to vanish behind one another? Instead, paths can leave behind little vertical tabs, saved branches can be starred, deep stacks can compress into a readable map, and the interface can keep a sense of *where you came from* without filling the screen with permanent panels.

It is deliberately a hobby project right now. The fun part is polishing the interaction until it feels obvious, then seeing whether the ideas are reusable enough to become a real JavaScript UI format/library later on.

## What v0.1 contains

- **Pop-out menu trails** that preserve a visible sense of depth.
- **Vertical Rolodex-style rails** for branch navigation and saved paths.
- **Starred/bookmarked tabs** for keeping useful points in a trail.
- **Top and bottom rail windowing** so large tab histories remain bounded instead of stretching forever.
- **Deep-stack compression** for long navigation paths.
- A **three-card depth lens** for inspecting compressed history without expanding the whole stack.
- **Deterministic rail geometry** with explicit slots rather than letting logical depth become physical drift.
- **Interaction overlays**: invisible hit/occlusion regions that can sit over one element or a group of elements without changing their visual layout.
- **Debugging APIs** for inspecting rail state, expected geometry, overlap/contact, arrow placement, and layout invariants.
- A small **Settings** surface for motion, optional guidance, the depth HUD, and visible-tail behavior.

The demo is still intentionally compact and a little playful. v0.1 is the first baseline where the navigation model, rail behavior, and debugging hooks feel coherent enough to build outward from.

## The idea beyond the demo

Rolodex.js is not trying to be a React replacement today. React is a much larger programming model and ecosystem.

The longer-term idea is smaller and more practical: see whether Rolodex.js can grow from an aesthetic interaction prototype into a reusable **format for spatial UI navigation** — something an application could adopt the way it adopts a menu library, layout system, or component toolkit.

Possible directions include:

- a small core package with framework-agnostic state and geometry;
- React, Vue, Svelte, or vanilla-JS adapters;
- headless navigation primitives with custom renderers;
- persistent trail/bookmark storage;
- configurable rails, tabs, depth lenses, and collision rules;
- keyboard and accessibility work;
- plugin hooks for custom containers and interaction overlays;
- reusable geometry contracts so agents and programmers can inspect the same UI state mathematically.

None of that is promised for v0.1. It is simply the direction that makes the experiment interesting.

## Debugging is part of the design

A recurring lesson while building the prototype was that complex spatial UI becomes painful when geometry exists only in CSS and screenshots.

So Rolodex.js exposes its rail and interaction state programmatically. The prototype includes APIs such as:

```js
REDOWN_RAILS.inspect('bottom')
REDOWN_RAILS.validate('bottom')
REDOWN_RAILS.expected('bottom')
REDOWN_RAILS.diff('bottom')
REDOWN_RAILS.relayoutAndAssert('bottom')

REDOWN_INTERACTION.inspect('rail:bottom')
REDOWN_INTERACTION.relation('rail:top', 'rail:bottom')
REDOWN_INTERACTION.overlaps('rail:top', 'rail:bottom')
REDOWN_INTERACTION.blocksUnderlyingHoverAt(x, y)
```

The names still reflect some prototype history and will probably be cleaned up as the public API settles.

The goal is simple: if a tab, arrow, or container is in the wrong place, a programmer — or a coding agent — should be able to ask the interface what it thinks its geometry is instead of reverse-engineering it from pixels.

## Friendly rivals and neighboring ideas

Rolodex.js sits near several excellent projects, each solving a different part of the UI problem. They are useful references, friendly competition, and occasionally the projects we would happily consider our “arch-nemeses” in the least dramatic possible sense.

- **Floating UI** — excellent positioning, collision detection, and floating-element primitives. A natural benchmark for geometry work.
- **Radix UI** — composable interaction primitives with a strong accessibility focus.
- **React Aria** — deep behavior and accessibility primitives for application UI.
- **Headless UI** — a good example of separating interaction behavior from visual styling.
- **Golden Layout** — a neighboring example of treating interface layout as a real system rather than a pile of panels.

React itself is more inspiration than competitor here: the interesting lesson is how a focused idea can become a reusable vocabulary that other applications build on.

Rolodex.js is much earlier, much smaller, and currently much weirder — which is a perfectly good place for a hobby project to be.

## Running v0.1

There is no build step yet.

Open `index.html` in a modern browser and explore the prototype.

The current file intentionally keeps the HTML, CSS, state model, geometry logic, debugging helpers, and interaction prototype together. Splitting that into modules is a later milestone, once the public boundaries are clearer.

## Version

This repository begins at **v0.1**.

The v0.1 baseline is the approved Rolodex.js prototype with:

- clean default Explore UI;
- Settings-based motion/guidance/depth controls;
- visible-tail controls moved into Settings;
- fixed root rail geometry;
- saved tab counts;
- top/bottom rail windowing;
- programmer/agent geometry APIs;
- interaction-overlay support;
- bottom-right-arrow hover occlusion.

From here, changes should build outward from this baseline rather than rewriting the basic interaction model.

---

Made for the joy of seeing how far a very particular menu idea can go.
