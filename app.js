/**
 * app.js — UI wiring only. All game data is in data/shapes.js, all
 * placement logic is in solver.js. This file just renders lists, tracks
 * what the user has clicked, and calls JumpSpaceSolver.solve().
 */

(function () {
  const { reactors, components } = window.JUMPSPACE_DATA;
  const GRID_ROWS = 8, GRID_COLS = 8;

  // ---- state -------------------------------------------------------
  const selectedReactorIds = new Set();      // insertion order preserved
  let selectedInstances = [];                // [{ key, componentId, preferShield }]
  let instanceCounter = 0;

  // ---- helpers -------------------------------------------------------
  function componentById(id) { return components.find(c => c.id === id); }

  function renderMiniShape(matrix) {
    const wrap = document.createElement("div");
    wrap.className = "mini-shape";
    wrap.style.gridTemplateColumns = `repeat(${matrix[0].length}, 8px)`;
    for (const row of matrix) {
      for (const v of row) {
        const cell = document.createElement("div");
        cell.className = "cell" + (v === 1 ? " filled" : "");
        wrap.appendChild(cell);
      }
    }
    return wrap;
  }

  function cellClass(value) {
    if (value === -2) return "shielded";
    if (value === -1) return "blocked";
    return "open";
  }

  // Build the 8x8 background grid from currently-selected reactor parts.
  // Reactors (4 rows) always stack above generators (2 rows), regardless
  // of click order, because that's how the ship actually works.
  function buildGrid() {
    const selected = reactors.filter(r => selectedReactorIds.has(r.id));
    const ordered = selected.filter(r => r.kind === "reactor")
      .concat(selected.filter(r => r.kind === "generator"));

    const grid = Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(-1));
    let rowOffset = 0;
    let overflow = false;
    for (const part of ordered) {
      for (let r = 0; r < part.matrix.length; r++) {
        if (rowOffset >= GRID_ROWS) { overflow = true; break; }
        for (let c = 0; c < GRID_COLS; c++) grid[rowOffset][c] = part.matrix[r][c];
        rowOffset++;
      }
    }
    return { grid, totalRows: ordered.reduce((s, p) => s + p.matrix.length, 0), overflow };
  }

  function renderGridInto(container, grid, pieceColorFor) {
    container.innerHTML = "";
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const v = grid[r][c];
        const cell = document.createElement("div");
        if (v > 0) {
          cell.className = "cell piece";
          cell.style.background = pieceColorFor(v);
          cell.textContent = v;
        } else {
          cell.className = "cell " + cellClass(v);
        }
        container.appendChild(cell);
      }
    }
  }

  const PIECE_COLORS = ["#e05252", "#e0a852", "#d9d652", "#7fd952", "#52d9c5", "#5279d9", "#a552d9", "#d952a0"];
  function colorForPieceId(id) { return PIECE_COLORS[(id - 1) % PIECE_COLORS.length]; }

  // ---- reactor / generator panel -------------------------------------
  function renderReactorList() {
    const list = document.getElementById("reactor-list");
    list.innerHTML = "";
    for (const r of reactors) {
      const item = document.createElement("div");
      item.className = "item" + (selectedReactorIds.has(r.id) ? " selected" : "");
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = r.name;
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = `${r.kind} · ${r.matrix.length} rows`;
      item.appendChild(name);
      item.appendChild(meta);
      item.addEventListener("click", () => {
        if (selectedReactorIds.has(r.id)) selectedReactorIds.delete(r.id);
        else selectedReactorIds.add(r.id);
        renderReactorList();
        refreshGridPreview();
      });
      list.appendChild(item);
    }
  }

  function refreshGridPreview() {
    const { grid, totalRows, overflow } = buildGrid();
    renderGridInto(document.getElementById("preview-grid"), grid, colorForPieceId);
    const totalEl = document.getElementById("row-total");
    if (totalRows === 8 && !overflow) {
      totalEl.textContent = `${totalRows} / 8 rows filled — ready.`;
      totalEl.className = "row-total ok";
    } else if (overflow) {
      totalEl.textContent = `${totalRows} rows selected, but the grid is only 8 tall — extra rows were dropped. Remove something.`;
      totalEl.className = "row-total warn";
    } else {
      totalEl.textContent = `${totalRows} / 8 rows filled — pick more reactors/generators to fill the grid.`;
      totalEl.className = "row-total warn";
    }
  }

  // ---- component panel -------------------------------------------------
  function renderComponentList() {
    const list = document.getElementById("component-list");
    list.innerHTML = "";
    let lastType = null;
    for (const c of components) {
      if (c.type !== lastType) {
        const header = document.createElement("div");
        header.className = "meta";
        header.style.marginTop = "8px";
        header.textContent = c.type;
        list.appendChild(header);
        lastType = c.type;
      }
      const item = document.createElement("div");
      item.className = "item";
      item.appendChild(renderMiniShape(c.matrix));
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = c.name;
      item.appendChild(name);
      item.addEventListener("click", () => {
        selectedInstances.push({ key: ++instanceCounter, componentId: c.id, preferShield: false });
        renderSelectedList();
      });
      list.appendChild(item);
    }
  }

  // ---- selected loadout panel -------------------------------------------
  function renderSelectedList() {
    const list = document.getElementById("selected-list");
    list.innerHTML = "";
    if (selectedInstances.length === 0) {
      const empty = document.createElement("div");
      empty.className = "hint";
      empty.textContent = "Nothing selected yet — click components on the left to add them.";
      list.appendChild(empty);
    }
    for (const inst of selectedInstances) {
      const c = componentById(inst.componentId);
      const row = document.createElement("div");
      row.className = "selected-item";
      row.appendChild(renderMiniShape(c.matrix));
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = c.name;
      row.appendChild(name);

      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = inst.preferShield;
      checkbox.addEventListener("change", () => { inst.preferShield = checkbox.checked; });
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode("prefer shielded"));
      row.appendChild(label);

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "remove";
      removeBtn.addEventListener("click", () => {
        selectedInstances = selectedInstances.filter(i => i.key !== inst.key);
        renderSelectedList();
      });
      row.appendChild(removeBtn);

      list.appendChild(row);
    }
    document.getElementById("solve-btn").disabled = selectedInstances.length === 0;
  }

  // ---- solve -------------------------------------------------------
  function runSolve() {
    const { grid } = buildGrid();
    const instances = selectedInstances.map(inst => {
      const c = componentById(inst.componentId);
      return { id: c.id, name: c.name, matrix: c.matrix, allowedRotations: c.allowedRotations, preferShield: inst.preferShield };
    });

    const result = window.JumpSpaceSolver.solve(grid, instances);

    const panel = document.getElementById("result-panel");
    panel.hidden = false;
    const summary = document.getElementById("result-summary");
    const resultGridEl = document.getElementById("result-grid");
    const legendEl = document.getElementById("result-legend");
    legendEl.innerHTML = "";

    if (result.feasible) {
      summary.className = "feasible";
      summary.textContent = `✅ Yes — all ${instances.length} components fit. (search explored ${result.nodesExplored} arrangement${result.nodesExplored === 1 ? "" : "s"})`;
      renderGridInto(resultGridEl, result.resultGrid, colorForPieceId);
      for (const entry of result.legend) {
        const span = document.createElement("span");
        const swatch = document.createElement("i");
        swatch.className = "swatch";
        swatch.style.background = colorForPieceId(entry.id);
        span.appendChild(swatch);
        span.appendChild(document.createTextNode(`${entry.id}: ${entry.name}`));
        legendEl.appendChild(span);
      }
    } else {
      summary.className = "infeasible";
      resultGridEl.innerHTML = "";
      if (result.unplaceable && result.unplaceable.length) {
        summary.textContent = `❌ No — this can never fit: ${result.unplaceable.join(", ")} — the shape doesn't fit anywhere on this grid at all, regardless of the other components.`;
      } else if (result.limitReached) {
        summary.textContent = `⚠️ Search gave up after ${result.nodesExplored} steps without finding a layout (or ruling it out). Try fewer components, or raise maxNodes in solver.js.`;
      } else {
        summary.textContent = `❌ No valid arrangement fits all ${instances.length} components on this grid` +
          (result.stuckOn ? ` — it kept getting stuck placing "${result.stuckOn}" no matter what else went where first.` : ".");
      }
    }
  }

  // ---- init -------------------------------------------------------
  renderReactorList();
  renderComponentList();
  renderSelectedList();
  refreshGridPreview();
  document.getElementById("solve-btn").addEventListener("click", runSolve);
})();
