/**
 * app.js — UI wiring only. Component shape data is in data/shapes.js, all
 * placement logic is in solver.js. This file just renders lists, tracks
 * what the user has clicked (including painting the power grid itself —
 * see "grid editor" below), and calls JumpSpaceSolver.solve().
 *
 * NOTE on `reactors` in data/shapes.js: that data is no longer used here.
 * The grid used to be assembled automatically by stacking preset reactor
 * + generator shapes, but the game's reactor/generator layouts change
 * often enough (and this rebuild has no way to auto-detect that) that
 * it's simpler to just paint the grid by hand each time — see the click
 * handler in renderEditableGrid() below. The old reactor/generator shape
 * data is still sitting in data/shapes.js, unused, in case you want to
 * bring back quick presets later (e.g. a dropdown that pre-paints the
 * grid from one of those shapes as a starting point).
 */

(function () {
  const { components } = window.JUMPSPACE_DATA;
  const GRID_ROWS = 8, GRID_COLS = 8;

  // ---- state -------------------------------------------------------
  // The power grid the user has painted by hand: -1 blocked, 0 open, -2
  // shielded. Starts fully blocked — click cells to open them up.
  let gridState = Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(-1));
  let selectedInstances = [];                // [{ key, componentId, preferShield }]
  let instanceCounter = 0;

  // Custom components the user has painted themselves, persisted in this
  // browser via localStorage so they're still here next time this page is
  // opened (on THIS device — localStorage doesn't sync between browsers,
  // computers, or a phone vs. this machine). See saveCustomComponents().
  const CUSTOM_COMPONENTS_KEY = "jumpSpaceCustomComponents";

  function loadCustomComponents() {
    try {
      const raw = localStorage.getItem(CUSTOM_COMPONENTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      // Private browsing, storage disabled, or corrupted data — fall back
      // to an empty list rather than breaking the page.
      return [];
    }
  }
  function saveCustomComponents() {
    try {
      localStorage.setItem(CUSTOM_COMPONENTS_KEY, JSON.stringify(customComponents));
    } catch (e) {
      // Best-effort only — e.g. storage full or disabled. The component
      // still works for this session, it just won't persist.
    }
  }
  let customComponents = loadCustomComponents(); // [{ id, name, type, matrix, custom: true }]

  // ---- helpers -------------------------------------------------------
  function componentById(id) {
    return components.find(c => c.id === id) || customComponents.find(c => c.id === id);
  }

  // Built-ins keep their curated display order (grouped by type, in the
  // order data/shapes.js lists them — NOT alphabetical). Custom components
  // slot into an existing type's group if the name matches one, or start
  // a brand new group (in the order you first used that section name)
  // otherwise. Returns a Map so insertion order is preserved: type -> [components].
  function groupedComponentList() {
    const groups = new Map();
    for (const c of components) {
      if (!groups.has(c.type)) groups.set(c.type, []);
      groups.get(c.type).push(c);
    }
    for (const c of customComponents) {
      if (!groups.has(c.type)) groups.set(c.type, []);
      groups.get(c.type).push(c);
    }
    return groups;
  }

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

  // True if the cell at (r, c) belongs to the same placed piece `id`
  // (used to figure out which edges of a piece's footprint are "outer"
  // edges — i.e. touch something else — versus internal joins between
  // two cells of the same piece).
  function sameOwner(grid, r, c, id) {
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return false;
    return grid[r][c] === id;
  }

  // `backgroundGrid` is optional and only matters for a SOLVED grid: once a
  // piece is stamped over a cell, the cell's own value no longer says
  // whether it used to be shielded. Passing the original background lets us
  // mark those cells (a small white dot, high-contrast against any piece
  // color) so shielded coverage stays visible even once it's hidden
  // underneath a component's color.
  function renderGridInto(container, grid, pieceColorFor, backgroundGrid) {
    container.innerHTML = "";
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const v = grid[r][c];
        const cell = document.createElement("div");
        if (v > 0) {
          const onShield = backgroundGrid && backgroundGrid[r][c] === -2;
          cell.className = "cell piece" + (onShield ? " on-shield" : "");
          cell.style.background = pieceColorFor(v);
          cell.textContent = v;
          if (onShield) cell.title = "On a shielded slot";

          // Outline only the OUTER edges of each piece's footprint (skip
          // the border between two cells of the same piece) so multi-cell
          // components read as one clearly-bounded shape at a glance,
          // in a color distinct from — but paired with — its fill color.
          const outline = `2px solid ${outlineColorForPieceId(v)}`;
          cell.style.borderTop = sameOwner(grid, r - 1, c, v) ? "none" : outline;
          cell.style.borderBottom = sameOwner(grid, r + 1, c, v) ? "none" : outline;
          cell.style.borderLeft = sameOwner(grid, r, c - 1, v) ? "none" : outline;
          cell.style.borderRight = sameOwner(grid, r, c + 1, v) ? "none" : outline;
        } else {
          cell.className = "cell " + cellClass(v);
        }
        container.appendChild(cell);
      }
    }
  }

  const PIECE_COLORS = ["#e05252", "#e0a852", "#d9d652", "#7fd952", "#52d9c5", "#5279d9", "#a552d9", "#d952a0"];
  function colorForPieceId(id) { return PIECE_COLORS[(id - 1) % PIECE_COLORS.length]; }

  // Each piece's outline is a darkened version of its own fill color —
  // "unique per piece" like the fill, but dark enough to stay visible even
  // when the fill color itself is close to the shielded-slot blue.
  function darken(hex, factor) {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.round(((num >> 16) & 255) * factor);
    const g = Math.round(((num >> 8) & 255) * factor);
    const b = Math.round((num & 255) * factor);
    return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
  }
  function outlineColorForPieceId(id) { return darken(colorForPieceId(id), 0.5); }

  // ---- grid editor -------------------------------------------------
  // Click a cell to cycle it: blocked (-1) -> open (0) -> shielded (-2)
  // -> back to blocked. This IS the grid — there's no separate "preview"
  // anymore, what you see here is exactly what gets solved against.
  function cycleGridValue(v) {
    if (v === -1) return 0;
    if (v === 0) return -2;
    return -1; // v === -2
  }

  function renderEditableGrid() {
    const container = document.getElementById("preview-grid");
    container.innerHTML = "";
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const cell = document.createElement("div");
        cell.className = "cell " + cellClass(gridState[r][c]);
        cell.title = "Click to change this cell's state";
        cell.addEventListener("click", () => {
          gridState[r][c] = cycleGridValue(gridState[r][c]);
          cell.className = "cell " + cellClass(gridState[r][c]);
        });
        container.appendChild(cell);
      }
    }
  }

  // ---- component panel -------------------------------------------------
  function renderComponentList() {
    const list = document.getElementById("component-list");
    list.innerHTML = "";
    for (const [type, items] of groupedComponentList()) {
      const header = document.createElement("div");
      header.className = "meta";
      header.style.marginTop = "8px";
      header.textContent = type;
      list.appendChild(header);

      for (const c of items) {
        const item = document.createElement("div");
        item.className = "item";
        item.appendChild(renderMiniShape(c.matrix));
        const name = document.createElement("div");
        name.className = "name";
        name.textContent = c.name;
        item.appendChild(name);

        if (c.custom) {
          const badge = document.createElement("span");
          badge.className = "meta";
          badge.textContent = "custom";
          item.appendChild(badge);

          const deleteBtn = document.createElement("button");
          deleteBtn.className = "small-delete";
          deleteBtn.textContent = "delete";
          deleteBtn.addEventListener("click", (e) => {
            e.stopPropagation(); // don't also trigger the item's "add to loadout" click
            deleteCustomComponent(c.id);
          });
          item.appendChild(deleteBtn);
        }

        item.addEventListener("click", () => {
          selectedInstances.push({ key: ++instanceCounter, componentId: c.id, preferShield: false });
          renderSelectedList();
        });
        list.appendChild(item);
      }
    }
  }

  function deleteCustomComponent(id) {
    const c = customComponents.find(c => c.id === id);
    if (!c) return;
    if (!confirm(`Delete "${c.name}"? This can't be undone.`)) return;
    customComponents = customComponents.filter(c => c.id !== id);
    // Also drop any copies of it already sitting in the current loadout —
    // otherwise the loadout would reference a component that no longer exists.
    selectedInstances = selectedInstances.filter(inst => inst.componentId !== id);
    saveCustomComponents();
    renderComponentList();
    renderSelectedList();
    refreshTypeOptions();
  }

  // ---- "add a custom component" editor ----------------------------------
  // A small 4x4 paint grid (max size any known component uses) for defining
  // a brand-new component shape by hand, with a name and a section to file
  // it under. Saved ones are stored via saveCustomComponents() above and
  // render through the exact same renderMiniShape() icon as built-ins —
  // there's nothing special about a custom component once it's saved.
  let newComponentMatrix = Array.from({ length: 4 }, () => new Array(4).fill(0));

  function renderShapeEditor() {
    const container = document.getElementById("new-component-grid");
    container.innerHTML = "";
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const cell = document.createElement("div");
        cell.className = "cell" + (newComponentMatrix[r][c] ? " filled" : "");
        cell.addEventListener("click", () => {
          newComponentMatrix[r][c] = newComponentMatrix[r][c] ? 0 : 1;
          cell.className = "cell" + (newComponentMatrix[r][c] ? " filled" : "");
        });
        container.appendChild(cell);
      }
    }
  }

  // Shrinks a matrix down to the smallest bounding box that still contains
  // every filled cell. This matters, not just tidiness: the solver treats
  // a matrix's full width/height as the piece's footprint for placement
  // purposes, so an untrimmed 4x4 matrix with a real shape tucked in one
  // corner would wrongly refuse to place it flush against a grid edge.
  // Returns null if the matrix has no filled cells at all.
  function trimMatrix(matrix) {
    let minR = Infinity, maxR = -1, minC = Infinity, maxC = -1;
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c] === 1) {
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
          if (c < minC) minC = c;
          if (c > maxC) maxC = c;
        }
      }
    }
    if (maxR === -1) return null;
    const trimmed = [];
    for (let r = minR; r <= maxR; r++) trimmed.push(matrix[r].slice(minC, maxC + 1));
    return trimmed;
  }

  function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "component";
  }

  function showAddComponentError(message) {
    const el = document.getElementById("add-component-error");
    el.textContent = message;
    el.hidden = false;
  }

  function refreshTypeOptions() {
    const datalist = document.getElementById("type-options");
    datalist.innerHTML = "";
    const types = new Set(components.map(c => c.type).concat(customComponents.map(c => c.type)));
    for (const t of types) {
      const opt = document.createElement("option");
      opt.value = t;
      datalist.appendChild(opt);
    }
  }

  function saveNewComponent() {
    document.getElementById("add-component-error").hidden = true;
    const name = document.getElementById("new-component-name").value.trim();
    const type = document.getElementById("new-component-type").value.trim() || "Custom";
    const trimmed = trimMatrix(newComponentMatrix);

    if (!name) { showAddComponentError("Give it a name first."); return; }
    if (!trimmed) { showAddComponentError("Paint at least one filled cell to define its shape."); return; }

    const id = `custom-${slugify(name)}-${Date.now().toString(36)}`;
    customComponents.push({ id, name, type, matrix: trimmed, custom: true });
    saveCustomComponents();

    // Reset the form for the next one, but leave the panel open in case
    // you're adding several after a game update.
    newComponentMatrix = Array.from({ length: 4 }, () => new Array(4).fill(0));
    document.getElementById("new-component-name").value = "";
    renderShapeEditor();
    renderComponentList();
    refreshTypeOptions();
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
    const grid = gridState.map(row => row.slice()); // defensive copy
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

    const shieldStatsEl = document.getElementById("shield-stats");

    if (result.feasible) {
      summary.className = "feasible";
      const optimalNote = result.optimal
        ? "shielding fully optimized"
        : "search budget ran out — best layout found, not guaranteed the most-shielded possible";
      summary.textContent = `✅ Yes — all ${instances.length} components fit. (${optimalNote}, ${result.nodesExplored} arrangement${result.nodesExplored === 1 ? "" : "s"} explored)`;
      renderGridInto(resultGridEl, result.resultGrid, colorForPieceId, grid);
      for (const entry of result.legend) {
        const span = document.createElement("span");
        const swatch = document.createElement("i");
        swatch.className = "swatch";
        swatch.style.background = colorForPieceId(entry.id);
        swatch.style.boxShadow = `inset 0 0 0 2px ${outlineColorForPieceId(entry.id)}`;
        span.appendChild(swatch);
        span.appendChild(document.createTextNode(`${entry.id}: ${entry.name}`));
        legendEl.appendChild(span);
      }

      const { total, covered, percent } = result.shieldStats;
      shieldStatsEl.hidden = false;
      shieldStatsEl.textContent = total === 0
        ? "This grid has no shielded slots at all."
        : `Shielded slots covered by components: ${covered} / ${total} (${percent}%). ` +
          `A small white dot on a numbered cell above marks a component sitting on a shielded slot.`;
    } else {
      shieldStatsEl.hidden = true;
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
  renderEditableGrid();
  renderComponentList();
  renderSelectedList();
  renderShapeEditor();
  refreshTypeOptions();

  document.getElementById("solve-btn").addEventListener("click", runSolve);
  document.getElementById("clear-grid-btn").addEventListener("click", () => {
    gridState = Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(-1));
    renderEditableGrid();
  });

  document.getElementById("toggle-add-component-btn").addEventListener("click", () => {
    document.getElementById("add-component-form").hidden = false;
    document.getElementById("toggle-add-component-btn").hidden = true;
  });
  document.getElementById("cancel-add-component-btn").addEventListener("click", () => {
    document.getElementById("add-component-form").hidden = true;
    document.getElementById("toggle-add-component-btn").hidden = false;
  });
  document.getElementById("save-component-btn").addEventListener("click", saveNewComponent);
})();
