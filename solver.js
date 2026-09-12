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
 * may share a cell. Question: does ANY arrangement exist that places
 * every selected component? If yes, show one.
 *
 * This is a 2D packing / constraint-satisfaction problem, not something
 * solvable by a formula — so this file does a backtracking search:
 * repeatedly pick the component that currently has the fewest legal
 * spots left (this is the classic "most constrained variable first"
 * heuristic — it makes dead ends surface almost immediately instead of
 * after exploring huge unrelated branches) and try each of its legal
 * placements, undoing and trying the next if a later component gets
 * stuck. It stops the moment it finds one full valid layout.
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
          if (ok) placements.push({ cells: absoluteCells, shieldCount });
        }
      }
    }
    // If this piece prefers shielded cells, try those placements first —
    // this is purely a search-order hint (find a "nicer" solution sooner),
    // it never affects whether a solution is found at all.
    if (piece.preferShield) {
      placements.sort((a, b) => b.shieldCount - a.shieldCount);
    }
    return placements;
  }

  /**
   * @param {number[][]} background  rows x 8 grid of 0 / -2 / -1
   * @param {Array} componentInstances  one entry per physical piece to place:
   *        { id, name, matrix, allowedRotations?, preferShield? }
   *        Include the same component twice if you're placing two copies.
   * @param {Object} [options]
   * @param {number} [options.maxNodes=300000]  safety cap on search steps
   * @returns {{
   *   feasible: boolean,
   *   resultGrid?: number[][],      // background with pieces stamped in as (index+1)
   *   legend?: Array<{id:number,name:string}>,
   *   limitReached?: boolean,
   *   unplaceable?: string[],       // pieces that don't fit the grid at all, ignoring other pieces
   *   stuckOn?: string,             // best-effort hint: where a full search failed
   *   nodesExplored: number
   * }}
   */
  function solve(background, componentInstances, options) {
    const maxNodes = (options && options.maxNodes) || 300000;
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
    let nodesExplored = 0;
    let limitReached = false;
    let deepestStuckPiece = null;

    function place(cells, pieceIndex) {
      for (const { r, c } of cells) occupied[r][c] = pieceIndex;
    }
    function unplace(cells) {
      for (const { r, c } of cells) occupied[r][c] = null;
    }

    function backtrack(remainingIndices) {
      if (nodesExplored > maxNodes) { limitReached = true; return false; }
      if (remainingIndices.length === 0) return true;

      // Most-constrained-variable: try the piece with the fewest legal
      // spots left first, so hopeless branches die fast.
      let bestPos = -1, bestPlacements = null;
      for (let i = 0; i < remainingIndices.length; i++) {
        const p = pieces[remainingIndices[i]];
        const placements = candidatePlacements(p, background, occupied);
        if (placements.length === 0) {
          deepestStuckPiece = p.name;
          return false; // this piece has nowhere left to go — dead end
        }
        if (!bestPlacements || placements.length < bestPlacements.length) {
          bestPos = i;
          bestPlacements = placements;
          if (placements.length === 1) break; // can't do better than "forced"
        }
      }

      const pieceIndex = remainingIndices[bestPos];
      const rest = remainingIndices.slice(0, bestPos).concat(remainingIndices.slice(bestPos + 1));

      for (const placement of bestPlacements) {
        nodesExplored++;
        place(placement.cells, pieceIndex);
        placedAt[pieceIndex] = placement.cells;
        if (backtrack(rest)) return true;
        unplace(placement.cells);
        placedAt[pieceIndex] = null;
        if (limitReached) return false;
      }
      return false;
    }

    const allIndices = pieces.map((_, i) => i);
    const found = backtrack(allIndices);

    if (found) {
      const resultGrid = background.map(row => row.slice());
      for (let i = 0; i < pieces.length; i++) {
        for (const { r, c } of placedAt[i]) resultGrid[r][c] = i + 1;
      }
      return {
        feasible: true,
        resultGrid,
        legend: pieces.map((p, i) => ({ id: i + 1, name: p.name })),
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
