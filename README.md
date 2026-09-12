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

## Project layout

```
index.html      the page structure
style.css       styling
data/shapes.js  ALL game data — reactor/generator grids, component shapes
solver.js       the placement search algorithm (the "engine")
app.js          UI wiring: renders lists, tracks selections, calls the solver
```

Nothing except `data/shapes.js` should need touching when the game
updates a shape. If the *rules* change (e.g. mirroring becomes allowed,
or a new grid size shows up), `solver.js` and `app.js` are where that
logic lives.

## How the data is encoded

**Reactors and generators** are 8-columns-wide blocks that get stacked to
build the full 8x8 grid (one reactor, 4 rows, on top of up to two
generators, 2 rows each). Cell values:

| value | meaning |
|---|---|
| `0`  | open / powered cell — a component can sit here |
| `-1` | blocked — nothing can be placed here |
| `-2` | shielded / protected cell — also usable, and immune to random power loss (see below) |

**Components** are small binary matrices:

| value | meaning |
|---|---|
| `1` | this cell of the piece must land on a non-blocked grid cell (`0` or `-2`), and can't overlap another piece |
| `0` | empty space inside the piece's own bounding box (for L/T-shaped pieces) — doesn't need to align to anything |

Row 0 of a matrix is always the top row. See the comment block at the top
of `data/shapes.js` for the full walkthrough.

## Updating a shape when the game changes it

1. Open `data/shapes.js`.
2. Find the reactor/generator/component by name (or add a new entry —
   copy the shape of a similar one as a template).
3. Edit the `matrix`. Count rows top to bottom, columns left to right.
4. Save, reload `index.html` in your browser. No build step, no restart.

If you're not sure of the exact new shape, an easy way to reverse it out is
to open the browser dev tools console on this page and log the matrix
while you experiment, or just count cells against a screenshot of the
in-game grid.

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
- Reactor/generator ordering is auto-corrected (reactors always stack
  above generators) rather than depending on click order, since that
  matches how the ship is actually built.
- There's no persistence — refreshing the page clears your loadout. If
  that becomes annoying, `app.js` is where to add `localStorage`.

## Running it

There's nothing to install. Open `index.html` directly in a browser, or
serve the folder with any static file server if you'd rather not use
`file://` URLs:

```
npx serve .
```
