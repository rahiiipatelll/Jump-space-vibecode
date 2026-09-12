/**
 * solver.js — the actual "is this configuration possible" engine.
 *
 * This is the piece that the original site never actually shipped: it just
 * forwarded your grid + components to an external API. Everything here
 * runs locally in the browser, is plain readable JS, and is the file to
 * open if the answer the tool gives you ever looks wrong and you want to
 * fix the *logic* rather than the *data* (for data, see data/shapes.js).
 *
 * ---------------------------------------------------------------------
 * THE PROBLEM, PRECISELY
 * ---------------------------------------------------------------------
 * You have an 8-wide grid (rows come from stacking a reactor + generators,
 * see data/shapes.js). Each cell is:
 *    0  open          -2  shielded (also open, just "special")
 *   -1  blocked / unusable
 *
 * You have a list of component instances to place. Each has a small
 * binary matrix ("1" = must sit on a non-blocked cell, "0" = empty space
 * inside its own bounding box). A component may be rotated in 90-degree
 * steps (unless you've restricted that in shapes.js). No two components
 * may share a cell.
 *
 * There are actually two questions, not one:
 *   1. Does ANY arrangement exist that places every selected component?
 *   2. Among all such arrangements, which one uses the most shielded
 *      (-2) cells — since shielded cells are immune to the random
 *      power-loss events the game throws at your grid, more shielded
 *      coverage means fewer things randomly cut out mid-fight?
 *
 * This is a 2D packing / constraint-satisfaction-with-an-objective
 * problem, not something solvable by a formula — so this file does a
 * branch-and-bound backtracking search: repeatedly pick the component
 * that currently has the fewest legal spots left (this is the classic
 * "most constrained variable first" heuristic — it makes dead ends
 * surface almost immediately instead of after exploring huge unrelated
 * branches), try each of its legal placements best-shielded-first, and
 * keep searching even after finding a valid layout — because a *better*
 * (more-shielded) layout might still be out there. It prunes any branch
 * that provably can't beat the best layout found so far, and stops
 * early only when it runs out of search budget, in which case it still
 * hands back the best layout it found (just not provably the best
 * possible one — see `optimal` in the result).
 * ---------------------------------------------------------------------
 */

(function () {

  /** Rotate a 2D matrix 90 degrees clockwise. */
  function rotate90(matrix) {
    const rows = matrix.length, cols = matrix[0].length;
    const out = Array.from({ length: cols }, () => new Array(rows).fill(0));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        out[c][rows - 1 - r] = matrix[r][c];
      }
    }
    return out;
  }

  function matrixKey(matrix) {
    return matrix.map(row => row.join(",")).join("|");
  }

  /**
   * All distinct orientations of a shape, restricted to `allowedRotations`
   * (an array containing any of 0, 90, 180, 270). Identical rotations
   * (symmetric pieces) are de-duplicated so the search doesn't waste time
   * trying the "same" placement twice.
   */
  function getOrientations(matrix, allowedRotations) {
    const angles = allowedRotations && allowedRotations.length ? allowedRotations : [0, 90, 180, 270];
    const seen = new Set();
    const orientations = [];
    let current = matrix;
    for (const angle of [0, 90, 180, 270]) {
      if (angle !== 0) current = rotate90(current);
      if (!angles.includes(angle)) continue;
      const key = matrixKey(current);
      if (!seen.has(key)) {
        seen.add(key);
        orientations.push(current);
      }
    }
    return orientations;
  }

  /** Cell coordinates of the "1"s in a shape matrix, plus its bounding box. */
  function filledCells(matrix) {
    const cells = [];
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c] === 1) cells.push({ r, c });
      }
    }
    return { cells, height: matrix.length, width: matrix[0].length };
  }

  // A component with "prefer shielded" ticked gets its shielded-cell
  // coverage weighted this much more heavily in the optimizer's scoring,
  // so any leftover shielded capacity gets spent on flagged components
  // first, before it's used to (also, for free) shield anything else.
  const SHIELD_PRIORITY_WEIGHT = 1000;

  /**
   * Every legal placement of one piece against the CURRENT occupancy grid.
   * A placement is legal if every filled cell lands inside the grid, on a
   * non-blocked background cell (0 or -2), and on a cell no other placed
   * piece currently occupies.
   */
  function candidatePlacements(piece, background, occupied) {
    const rows = background.length, cols = background[0].length;
    const placements = [];
    for (const orientation of piece.orientations) {
      const { cells, height, width } = filledCells(orientation);
      for (let top = 0; top <= rows - height; top++) {
        for (let left = 0; left <= cols - width; left++) {
          let ok = true;
          let shieldCount = 0;
          const absoluteCells = [];
          for (const cell of cells) {
            const r = top + cell.r, c = left + cell.c;
            const bg = background[r][c];
            if (bg === -1 || occupied[r][c] !== null) { ok = false; break; }
            if (bg === -2) shieldCount++;
            absoluteCells.push({ r, c });
          }
          if (ok) {
            const weight = piece.preferShield ? SHIELD_PRIORITY_WEIGHT : 1;
            placements.push({ cells: absoluteCells, shieldCount, weightedShield: shieldCount * weight });
          }
        }
      }
    }
    // Try the best-for-shielding placements first. This is a search-order
    // hint, not a hard rule: it makes the optimizer land on a good answer
    // early (which also makes pruning kick in sooner), it never decides
    // what counts as "best" — the score comparison in solve() does that.
    placements.sort((a, b) => b.weightedShield - a.weightedShield);
    return placements;
  }

  /**
   * @param {number[][]} background  rows x 8 grid of 0 / -2 / -1
   * @param {Array} componentInstances  one entry per physical piece to place:
   *        { id, name, matrix, allowedRotations?, preferShield? }
   *        Include the same component twice if you're placing two copies.
   * @param {Object} [options]
   * @param {number} [options.maxNodes=500000]  safety cap on search steps
   * @returns {{
   *   feasible: boolean,
   *   resultGrid?: number[][],      // background with pieces stamped in as (index+1)
   *   legend?: Array<{id:number,name:string}>,
   *   optimal?: boolean,            // true = proven best possible shield coverage;
   *                                 // false = search budget ran out first, this is
   *                                 // just the best layout found so far
   *   shieldStats?: { total: number, covered: number, percent: number|null },
   *   limitReached?: boolean,
   *   unplaceable?: string[],       // pieces that don't fit the grid at all, ignoring other pieces
   *   stuckOn?: string,             // best-effort hint: where the search kept failing
   *   nodesExplored: number
   * }}
   */
  function solve(background, componentInstances, options) {
    const maxNodes = (options && options.maxNodes) || 500000;
    const rows = background.length, cols = background[0].length;

    const pieces = componentInstances.map((c, idx) => ({
      index: idx,
      id: c.id,
      name: c.name,
      preferShield: !!c.preferShield,
      orientations: getOrientations(c.matrix, c.allowedRotations)
    }));

    // Quick rejection: does this piece fit *anywhere* on the background,
    // completely ignoring every other piece? If not, no amount of search
    // will help — report it immediately instead of burning search time.
    const occupiedEmpty = Array.from({ length: rows }, () => new Array(cols).fill(null));
    const unplaceable = pieces
      .filter(p => candidatePlacements(p, background, occupiedEmpty).length === 0)
      .map(p => p.name);
    if (unplaceable.length) {
      return { feasible: false, unplaceable, nodesExplored: 0 };
    }

    const occupied = Array.from({ length: rows }, () => new Array(cols).fill(null));
    const placedAt = new Array(pieces.length).fill(null);
    const placedWeightedShield = new Array(pieces.length).fill(0);

    let nodesExplored = 0;
    let limitReached = false;
    let deepestStuckPiece = null;

    let bestScore = -1;
    let bestPlacedAt = null;

    function place(cells, pieceIndex) { for (const { r, c } of cells) occupied[r][c] = pieceIndex; }
    function unplace(cells) { for (const { r, c } of cells) occupied[r][c] = null; }

    function currentScore() {
      let total = 0;
      for (const w of placedWeightedShield) total += w;
      return total;
    }

    function recordIfBest() {
      const score = currentScore();
      if (score > bestScore) {
        bestScore = score;
        bestPlacedAt = placedAt.map(cells => cells.slice());
      }
    }

    // Unlike a plain feasibility search, this does NOT stop at the first
    // full layout it finds — a better (more-shielded) one might still be
    // out there. It keeps exploring, but prunes hard: at every node it
    // computes an upper bound on the best score reachable from here (what
    // we've already locked in, plus the best-case shielding every
    // remaining piece could still add), and abandons the branch the
    // moment that bound can't beat the best full layout found so far.
    function backtrack(remainingIndices) {
      if (nodesExplored > maxNodes) { limitReached = true; return; }
      if (remainingIndices.length === 0) { recordIfBest(); return; }

      const optionsByPiece = new Map();
      let bound = currentScore();
      let bestPos = -1, fewestCount = Infinity;

      for (let i = 0; i < remainingIndices.length; i++) {
        const p = pieces[remainingIndices[i]];
        const placements = candidatePlacements(p, background, occupied);
        if (placements.length === 0) {
          deepestStuckPiece = p.name;
          return; // dead end down this branch — backtrack to try something else
        }
        optionsByPiece.set(remainingIndices[i], placements);
        bound += placements[0].weightedShield; // best-case contribution (list is sorted)
        if (placements.length < fewestCount) {
          fewestCount = placements.length;
          bestPos = i;
        }
      }

      if (bound <= bestScore) return; // can't beat the best we already have — prune

      const pieceIndex = remainingIndices[bestPos];
      const rest = remainingIndices.slice(0, bestPos).concat(remainingIndices.slice(bestPos + 1));
      const placements = optionsByPiece.get(pieceIndex);

      for (const placement of placements) {
        if (nodesExplored > maxNodes) { limitReached = true; return; }
        nodesExplored++;
        place(placement.cells, pieceIndex);
        placedAt[pieceIndex] = placement.cells;
        placedWeightedShield[pieceIndex] = placement.weightedShield;
        backtrack(rest);
        unplace(placement.cells);
        placedAt[pieceIndex] = null;
        placedWeightedShield[pieceIndex] = 0;
        if (limitReached) return;
      }
    }

    backtrack(pieces.map((_, i) => i));

    if (bestPlacedAt) {
      const resultGrid = background.map(row => row.slice());
      for (let i = 0; i < pieces.length; i++) {
        for (const { r, c } of bestPlacedAt[i]) resultGrid[r][c] = i + 1;
      }

      let total = 0, covered = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (background[r][c] === -2) {
            total++;
            if (resultGrid[r][c] > 0) covered++;
          }
        }
      }

      return {
        feasible: true,
        resultGrid,
        legend: pieces.map((p, i) => ({ id: i + 1, name: p.name })),
        optimal: !limitReached,
        shieldStats: { total, covered, percent: total === 0 ? null : Math.round((covered / total) * 100) },
        nodesExplored
      };
    }

    return {
      feasible: false,
      limitReached,
      stuckOn: deepestStuckPiece || undefined,
      nodesExplored
    };
  }

  window.JumpSpaceSolver = { solve, rotate90, getOrientations };
})();
