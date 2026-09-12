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
| `-2` | shielded / protected cell — also usable, but "special" |

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
does a **backtracking search**:

1. For each component, precompute every legal placement (position +
   rotation) against the *current* board state.
2. Pick whichever unplaced component currently has the **fewest** legal
   spots left, and try each of them in turn (this "most constrained
   variable first" heuristic is what keeps the search fast — a piece
   with only one legal spot left gets nailed down immediately instead of
   the search wandering off exploring unrelated pieces first).
3. If a component ever has **zero** legal spots left, that branch is a
   dead end — back up and try a different placement for whatever was
   placed just before it.
4. Stop the instant every component has a placement. That's your answer:
   yes it fits, and here's one way to do it.

There's a safety cap (`maxNodes`, default 300,000 search steps) so a
pathological input can't hang the browser tab; it'll tell you if it hit
the cap without a definitive answer, which should be rare for an 8x8
grid with a normal-sized loadout.

**Rotations:** every component can be rotated in 90° steps by default.
If you learn a specific component can't rotate in-game (or can't rotate
freely), set `allowedRotations: [0]` (or whichever angles are legal) on
that component in `shapes.js`.

**Mirroring:** not implemented. If it turns out the real minigame allows
flipping a piece (not just rotating it), that would need a
`mirrorVertical`/`getMirroredOrientations` addition alongside
`rotate90` in `solver.js` — flagging it here since it's the one geometric
operation this version doesn't attempt.

**"Prefer shielded" is a soft preference, not a hard rule.** Ticking it
for a component just makes the search try shield-covering placements for
that piece *first* — it can never make an otherwise-fitting loadout fail,
and it doesn't run a full optimization pass over every possible solution
to find the one with maximum shield coverage (that would be much slower
for very little practical benefit). If you want a stricter or smarter
shield rule, that logic lives in `candidatePlacements()` in `solver.js`.

## Known simplifications / things worth revisiting

- The original tool didn't document (and its dead backend can't be
  inspected for) all of the actual in-game placement rules, so some of
  the above — especially "prefer shielded" semantics and whether any
  component genuinely cannot rotate — is a best-effort interpretation.
  Treat mismatches with the real game as things to tune in `solver.js`
  and `shapes.js`, not bugs in some deeper sense.
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
