# Jump Space Power Grid Optimizer (local, modifiable)

A from-scratch rebuild of the "will these components fit on this power grid"
tool for Jump Space. Plain HTML/CSS/JS, no build step, no server, no
external API — open `index.html` and it works.

## Why this exists

The original tool at
[jump-space-grid-optimizer.vercel.app](https://jump-space-grid-optimizer.vercel.app/)
went stale because the game's component shapes changed. Digging into its
bundled JS turned up two things worth knowing:

1. **All shape data is just a plain array of JS objects** baked into the
   frontend — reactors/generators as small numeric grids, components as
   1/0 footprint matrices. There's no hidden complexity there, just data
   that needs updating.
2. **The actual "is this possible" logic was never in the frontend at
   all.** Clicking "Optimize" sends your grid + components to an external
   API (`hamzafiverr.onrender.com`), which — as of this writing — doesn't
   respond to requests at all. So there was no existing solver to fork;
   this project writes one from scratch instead.

That means this rebuild fixes both problems at once: the shape data lives
in one file you can edit, and the solver runs entirely in your browser,
so there's no third-party service that can disappear on you again.

**Update:** the game later changed its reactor/generator layouts too, on
top of the component shapes. Rather than chase that a second time with
another data table that can go stale again, the power grid is now
painted by hand directly in the UI (see "The grid editor" below) —
there's no reactor/generator picker anymore.

**Update 2:** editing `data/shapes.js` by hand to add or fix a component
still works, but there's now also an in-page way to do it — see "Adding
components from the UI" below — which is generally the easier path
unless you're comfortable with the raw JSON-ish syntax.

## Project layout

```
index.html      the page structure
style.css       styling
data/shapes.js  component shape data (+ unused legacy reactor/generator data, see below)
solver.js       the placement search algorithm (the "engine")
app.js          UI wiring: grid editor, component list + custom-component
                editor, loadout tracking, calls the solver
```

You don't need to touch `data/shapes.js` at all for a one-off new or
changed component anymore — see "Adding components from the UI" below.
Editing that file directly is still there for bulk changes, or for a
component you want built into the project itself rather than saved per
browser. If the *rules* change (e.g. mirroring becomes allowed, or the
grid stops being 8x8), `solver.js` and `app.js` are where that logic
lives.

## The grid editor

The power grid isn't assembled from any preset data anymore — you paint
it by hand. Click a cell in the "Power grid" panel and it cycles:

```
blocked (gray) -> open (green) -> shielded (blue) -> blocked (gray) -> ...
```

It starts fully blocked. Paint it to match whatever your ship's reactor
+ generators currently produce in-game, then move on to picking
components below. "Clear grid" resets every cell back to blocked if you
want to start over. This state lives only in memory (`gridState` in
`app.js`) — refreshing the page resets it, same as your component
loadout.

## How the data is encoded

**The grid** (whether hand-painted or, historically, assembled from the
now-unused reactor/generator data in `data/shapes.js`) uses these cell
values:

| value | meaning |
|---|---|
| `0`  | open / powered cell — a component can sit here |
| `-1` | blocked — nothing can be placed here |
| `-2` | shielded / protected cell — also usable, and immune to random power loss (see below) |

**Components** (in `data/shapes.js`) are small binary matrices:

| value | meaning |
|---|---|
| `1` | this cell of the piece must land on a non-blocked grid cell (`0` or `-2`), and can't overlap another piece |
| `0` | empty space inside the piece's own bounding box (for L/T-shaped pieces) — doesn't need to align to anything |

Row 0 of a matrix is always the top row. See the comment block at the top
of `data/shapes.js` for the full walkthrough.

## Updating a component shape when the game changes it

1. Open `data/shapes.js`.
2. Find the component by name (or add a new entry — copy the shape of a
   similar one as a template).
3. Edit the `matrix`. Count rows top to bottom, columns left to right.
4. Save, reload `index.html` in your browser. No build step, no restart.

If you're not sure of the exact new shape, an easy way to reverse it out is
to open the browser dev tools console on this page and log the matrix
while you experiment, or just count cells against a screenshot of the
in-game grid.

(There's nothing to update for the grid layout itself anymore — just
paint it by hand each session.)

## Adding components from the UI

You don't have to hand-edit `data/shapes.js` to add a new or changed
component — there's a built-in editor for that:

1. Under the Components panel, click "+ Add custom component."
2. Paint the shape on the 4x4 grid (4x4 is the largest footprint any
   known component uses — click a cell to toggle it filled/empty).
3. Give it a name, and a section — type an existing one (e.g. "Engines")
   to slot it in alongside the built-ins of that type, or a brand new
   name (e.g. "Prototype Weapons") to start a new section for it. The
   text field autocompletes from sections that already exist.
4. Click "Save component." It immediately shows up in the components
   list with the same shape-grid icon every other component gets — that
   icon is always generated straight from the matrix (`renderMiniShape()`
   in `app.js`), so there's nothing special to draw for a custom one.

**Where it's stored:** in this browser's `localStorage`, under the key
`jumpSpaceCustomComponents` — not in `data/shapes.js`, and not on any
server. That means it'll still be there the next time you open this page
*in this same browser, on this same device* — closing the tab, closing
the browser, restarting your computer, none of that clears it. What it
does **not** do is follow you: open the page in a different browser,
a different computer, or (importantly) after committing this project to
GitHub Pages and opening the live URL from your phone, and your custom
components won't be there, because `localStorage` never leaves the
browser it was written in. If you want a custom component to be
available everywhere, add it to `data/shapes.js` instead (or in addition
— nothing stops you doing both) so it ships with the project itself.

One more `localStorage` quirk worth knowing: it needs a stable origin to
key itself against, and some browsers treat every `file://` page as its
own origin (or an origin that resets between sessions), which can make
custom components fail to persist when you open `index.html` by
double-clicking it. If that happens, serve the folder instead of opening
it directly — `npx serve .` (see "Running it" below) or GitHub Pages both
give the page a real, consistent origin and `localStorage` behaves
normally.

**Deleting a custom component:** click "delete" next to it in the
components list (only custom ones have this button — built-ins can only
be changed by editing `data/shapes.js`). You'll get a confirmation
prompt first since it can't be undone. Deleting one also removes any
copies of it currently sitting in your loadout, so you're never left
with a "ghost" component the solver can't find data for.

Under the hood, a saved component looks exactly like a built-in one —
`{ id, name, type, matrix, custom: true }` — plus the `custom` flag,
which is only there so the UI knows to show the delete button and the
"custom" label next to it. The shape you paint gets trimmed down to its
smallest bounding box before saving (`trimMatrix()` in `app.js`): if you
paint a single dot in the corner of the 4x4 editor, it's stored as a 1x1
matrix, not a mostly-empty 4x4 one. This isn't just tidiness — an
untrimmed matrix would make the solver reserve a larger footprint than
the shape actually needs and wrongly refuse placements flush against a
grid edge.

## How the solver works (`solver.js`)

This is a classic 2D packing / constraint-satisfaction problem — there's
no formula for "will N irregular shapes fit in a grid with holes," so it
does a **backtracking search**. But it's not just a yes/no search: among
every arrangement that fits, it also tries to find the one that covers
the most shielded (`-2`) slots, since those are immune to the random
power-loss events the game throws at your grid (see below). So it's a
small branch-and-bound optimizer:

1. For each component, precompute every legal placement (position +
   rotation) against the *current* board state, sorted best-shielded-first.
2. Pick whichever unplaced component currently has the **fewest** legal
   spots left, and try each of its placements in turn (this "most
   constrained variable first" heuristic is what keeps the search fast —
   a piece with only one legal spot left gets nailed down immediately
   instead of the search wandering off exploring unrelated pieces first).
3. If a component ever has **zero** legal spots left, that branch is a
   dead end — back up and try a different placement for whatever was
   placed just before it.
4. When every component has a placement, that's a valid full layout —
   but instead of stopping there, remember it (if it beats the best one
   seen so far) and keep searching, because a more-shielded layout might
   still exist elsewhere in the search space.
5. To keep that from being hopelessly slow, at every step it computes an
   upper bound — "even in the best case, how much more shielding could
   the remaining pieces possibly add?" — and abandons a branch outright
   the moment that bound can't beat the best layout already found. This
   is what makes "search everything" practical instead of exponential.

There's a safety cap (`maxNodes`, default 500,000 search steps) so a
pathological input can't hang the browser tab. If it's hit, the solver
still returns the best layout found so far — it just marks `optimal:
false` on the result (surfaced in the UI as "search budget ran out")
rather than claiming that layout is provably the most-shielded possible.
Plain feasibility (question 1) is always answered correctly and quickly
regardless — the cap only affects how hard it keeps looking for a
*better* answer to question 2 after a valid one is already in hand.

**Rotations:** every component can be rotated in 90° steps by default.
If you learn a specific component can't rotate in-game (or can't rotate
freely), set `allowedRotations: [0]` (or whichever angles are legal) on
that component in `shapes.js`.

**Mirroring:** not implemented. If it turns out the real minigame allows
flipping a piece (not just rotating it), that would need a
`mirrorVertical`/`getMirroredOrientations` addition alongside
`rotate90` in `solver.js` — flagging it here since it's the one geometric
operation this version doesn't attempt.

**What "shielded" actually means in-game** (confirmed by the developer on
the Steam forums, not guessed): when your ship takes damage or hits an
event like radiation, random grid squares can get knocked offline,
cutting power to whatever's plugged into them. Blue/protected (`-2`)
squares are immune to that — a component sitting fully on protected
cells stays powered no matter what; one on a normal (`0`) cell can
randomly drop mid-fight. So "prefer shielded" isn't a performance
optimization, it's a reliability one: it's for components you can't
afford to have cut out unexpectedly (weapons, sensors you depend on),
not just a generic bonus to chase for every piece.

**Shielding is optimized automatically, for everything, even with no
boxes ticked.** You don't have to mark anything "prefer shielded" for the
solver to make use of leftover shielded capacity — by default it already
finds the fittable layout that covers the most shielded cells overall.
Ticking "prefer shielded" on a specific component instance doesn't turn
shielding on, it just makes that component's coverage count 1000x more
in the scoring (`SHIELD_PRIORITY_WEIGHT` in `solver.js`), so if there's
ever a tradeoff — only enough shielded cells for some components, not
all — the flagged ones win that tradeoff first, and whatever shielded
capacity is left over still gets used on everything else. It's still not
a hard requirement (a flagged component can still be placed off-shield
if that's the only way anything fits at all — feasibility always wins
over shielding). If you want a genuine hard rule instead — e.g. a
component must be *entirely* on protected cells or the layout should be
rejected outright — that logic lives in `candidatePlacements()` in
`solver.js`, and would mean filtering out any placement for that piece
where `shieldCount` doesn't equal the piece's total cell count.

The result panel shows exactly how much of the grid's shielded capacity
got used (`covered / total`, as a %), and marks any placed component
that landed on a shielded cell with a small white dot — since once a
piece is drawn over a blue cell, the color underneath is otherwise
invisible.

**Reading the result grid at a glance:** each component keeps its own
fill color (cycling through `PIECE_COLORS` in `app.js`), and is also
outlined in a darkened version of that same color (`outlineColorForPieceId()`)
along only the *outer* edge of its footprint — the border between two
cells belonging to the same piece is deliberately left off, so a
multi-cell component reads as one clearly-bounded shape rather than a
row of same-colored squares. This is what makes it possible to tell two
adjacent components apart quickly even when their fill colors end up
close in hue (`PIECE_COLORS` only has 8 entries and cycles for bigger
loadouts).

## Known simplifications / things worth revisiting

- Placement geometry (shapes, rotation, overlap, blocked cells) is
  inferred directly from the original tool's bundled data, so it should
  be accurate. The shield mechanic's *meaning* is confirmed from the
  developer's own Steam posts (see above). What's still a best-effort
  guess is whether any specific component can't rotate freely in-game —
  treat mismatches there as things to tune via `allowedRotations` in
  `shapes.js`, not bugs in some deeper sense.
- There's no persistence — refreshing the page clears both your painted
  grid and your loadout. If that becomes annoying, `app.js` is where to
  add `localStorage` for `gridState` and `selectedInstances`.
- Component selection is still the original list-based mechanic (click a
  component to add an instance, tick "prefer shielded" per instance).
  That's the next thing likely to need a rework if the game changes how
  components are chosen or categorized — `renderComponentList()` and
  `renderSelectedList()` in `app.js` are where that logic lives.

## Running it

There's nothing to install. Open `index.html` directly in a browser, or
serve the folder with any static file server if you'd rather not use
`file://` URLs:

```
npx serve .
```
