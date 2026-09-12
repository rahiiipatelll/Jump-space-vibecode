/**
 * shapes.js — All game data lives here, and ONLY here.
 *
 * This is the file you edit when the game updates a component or reactor
 * shape. Nothing else in the project needs to change for a shape edit.
 *
 * ---------------------------------------------------------------------
 * REACTOR / GENERATOR grids
 * ---------------------------------------------------------------------
 * Each reactor/generator is a fixed-width (8 columns) block of rows that
 * gets stacked with others to build the full 8x8 power grid. A "reactor"
 * is 4 rows tall, a "generator" is 2 rows tall. In the real game you pick
 * exactly one reactor plus up to two generators, which is why 4 + 2 + 2 = 8.
 *
 * Cell values in a reactor/generator matrix:
 *    0  -> open / powered cell. A component's filled cell CAN be placed here.
 *   -1  -> blocked / unpowered cell. Nothing can be placed here.
 *   -2  -> shielded (protected) cell. Also usable, but "special" — some
 *          components prefer to sit on these (see preferShield below).
 *
 * ---------------------------------------------------------------------
 * COMPONENTS
 * ---------------------------------------------------------------------
 * Each component is a small binary matrix:
 *    1 -> this cell of the component's footprint must land on a non-blocked
 *         grid cell (0 or -2) and must not overlap another component.
 *    0 -> this cell is just empty space inside the component's bounding
 *         box (an L/T/plus shape etc.) — it does not need to align to
 *         anything and does not block other components from using that
 *         grid cell.
 *
 * `type` is just a UI grouping label (matches the game's own categories).
 * `imageUrl` (optional) is a game-wiki icon, purely cosmetic.
 * `allowedRotations` (optional) restricts which of the 4 quarter-turns
 * (0, 90, 180, 270) are legal for this piece. Omit it to allow all four.
 * If you discover the real minigame doesn't let a piece rotate at all,
 * set this to [0] for that component.
 *
 * ---------------------------------------------------------------------
 * WHEN THE GAME UPDATES A SHAPE
 * ---------------------------------------------------------------------
 * 1. Find the new footprint (in-game screenshot, or the wiki at
 *    https://jumpship.wiki.gg/ — most component icons here came from there).
 * 2. Edit (or add) the matrix below. Row 0 is the top row.
 * 3. Save and reload index.html — there is no build step.
 */

window.JUMPSPACE_DATA = {
  reactors: [
    // --- 4-row main reactors ---
    { id: "mk1-split-reactor", name: "MK1 Split Reactor", kind: "reactor",
      matrix: [[0,0,-1,-1,-1,-1,0,0],[0,0,0,-1,-1,0,0,0],[0,0,0,-1,-1,0,0,0],[0,0,0,-1,-1,0,0,0]] },
    { id: "mk2-split-reactor", name: "MK2 Split Reactor", kind: "reactor",
      matrix: [[0,0,-1,-1,-1,-1,0,0],[0,0,0,-1,-1,0,0,0],[-2,0,0,-1,-1,0,0,-2],[-2,0,0,-1,-1,0,0,-2]] },
    { id: "mk3-split-reactor", name: "MK3 Split Reactor", kind: "reactor",
      matrix: [[0,0,-1,-1,-1,-1,0,0],[0,0,0,-1,-1,0,0,0],[-2,-2,0,-1,-1,0,-2,-2],[-2,-2,0,-1,-1,0,-2,-2]] },

    { id: "mk1-solid-state-reactor", name: "MK1 Solid State Reactor", kind: "reactor",
      matrix: [[-1,-1,0,0,0,0,-1,-1],[-1,-1,0,0,0,0,-1,-1],[-1,-1,-2,-2,-2,-2,-1,-1],[-1,-1,-2,-2,-2,-2,-1,-1]] },
    { id: "mk2-solid-state-reactor", name: "MK2 Solid State Reactor", kind: "reactor",
      matrix: [[-1,-1,0,0,0,0,-1,-1],[-1,-1,-2,-2,-2,-2,-1,-1],[-1,-1,-2,-2,-2,-2,-1,-1],[-1,-1,-2,-2,-2,-2,-1,-1]] },
    { id: "mk3-solid-state-reactor", name: "MK3 Solid State Reactor", kind: "reactor",
      matrix: [[-1,-1,-2,-2,-2,-2,-1,-1],[-1,-1,-2,-2,-2,-2,-1,-1],[-1,-1,-2,-2,-2,-2,-1,-1],[-1,-1,-2,-2,-2,-2,-1,-1]] },

    { id: "mk1-null-wave-reactor", name: "MK1 Null Wave Reactor", kind: "reactor",
      matrix: [[0,0,-1,-1,-1,-1,0,0],[0,0,0,-1,-1,0,0,0],[-1,-2,-2,0,0,-2,-2,-1],[-1,-1,-2,0,0,-2,-1,-1]] },
    { id: "mk2-null-wave-reactor", name: "MK2 Null Wave Reactor", kind: "reactor",
      matrix: [[-2,0,-1,-1,-1,-1,0,-2],[-2,0,0,-1,-1,0,0,-2],[-1,-2,-2,0,0,-2,-2,-1],[-1,-1,-2,0,0,-2,-1,-1]] },
    { id: "mk3-null-wave-reactor", name: "MK3 Null Wave Reactor", kind: "reactor",
      matrix: [[-2,-2,-1,-1,-1,-1,-2,-2],[-2,-2,0,-1,-1,0,-2,-2],[-1,-2,-2,0,0,-2,-2,-1],[-1,-1,-2,0,0,-2,-1,-1]] },

    { id: "mk1-materia-scatter-reactor", name: "MK1 Materia Scatter Reactor", kind: "reactor",
      matrix: [[0,0,0,0,0,0,0,0],[-1,0,-1,0,0,-1,0,-1],[0,0,0,0,0,0,0,0],[-2,-1,-2,-1,-1,-2,-1,-2]] },
    { id: "mk2-materia-scatter-reactor", name: "MK2 Materia Scatter Reactor", kind: "reactor",
      matrix: [[0,0,0,0,0,0,0,0],[-1,0,-1,0,0,-1,0,-1],[0,-2,-2,0,0,-2,-2,0],[-2,-1,-2,-1,-1,-2,-1,-2]] },
    { id: "mk3-materia-scatter-reactor", name: "MK3 Materia Scatter Reactor", kind: "reactor",
      matrix: [[0,0,0,0,0,0,0,0],[-1,-2,-1,0,0,-1,-2,-1],[-2,-2,-2,-2,-2,-2,-2,-2],[-2,-1,-2,-1,-1,-2,-1,-2]] },

    // --- 2-row auxiliary generators ---
    { id: "mk1-bio-fission-generator", name: "MK1 Bio Fission Generator", kind: "generator",
      matrix: [[-1,-1,0,0,0,0,-1,-1],[-1,-1,0,-1,-1,0,-1,-1]] },
    { id: "mk2-bio-fission-generator", name: "MK2 Bio Fission Generator", kind: "generator",
      matrix: [[-1,0,0,0,0,0,0,-1],[-1,-2,-1,-1,-1,-1,-2,-1]] },
    { id: "mk3-bio-fission-generator", name: "MK3 Bio Fission Generator", kind: "generator",
      matrix: [[-2,0,0,0,0,0,0,-2],[-2,-1,-1,-1,-1,-1,-1,-2]] },

    { id: "mk1-materia-shift-generator", name: "MK1 Materia Shift Generator", kind: "generator",
      matrix: [[-1,0,0,-1,-1,0,0,-1],[-1,0,0,-1,-1,0,0,-1]] },
    { id: "mk2-materia-shift-generator", name: "MK2 Materia Shift Generator", kind: "generator",
      matrix: [[-1,0,-2,-1,-1,-2,0,-1],[-1,-2,0,-1,-1,0,-2,-1]] },
    { id: "mk3-materia-shift-generator", name: "MK3 Materia Shift Generator", kind: "generator",
      matrix: [[-1,0,-2,-1,-1,-2,0,-1],[-1,-2,-2,-1,-1,-2,-2,-1]] },

    { id: "mk1-null-tension-generator", name: "MK1 Null Tension Generator", kind: "generator",
      matrix: [[-1,-1,0,0,0,0,-1,-1],[-1,-1,0,0,0,0,-1,-1]] },
    { id: "mk2-null-tension-generator", name: "MK2 Null Tension Generator", kind: "generator",
      matrix: [[-1,-1,0,0,0,0,-1,-1],[-1,-1,-2,0,0,-2,-1,-1]] },
    { id: "mk3-null-tension-generator", name: "MK3 Null Tension Generator", kind: "generator",
      matrix: [[-1,-1,0,0,0,0,-1,-1],[-1,-1,-2,-2,-2,-2,-1,-1]] }
  ],

  components: [
    { id: "jump-drive", name: "Jump Drive", type: "Jump Drive", matrix: [[1,1],[1,0]] },

    { id: "sector-scanner", name: "Sector Scanner", type: "Sensors",
      imageUrl: "https://jumpship.wiki.gg/images/OculusPowerPlug.png?87ab43", matrix: [[1,1]] },
    { id: "vector-targetting-module", name: "Vector Targetting Module", type: "Sensors",
      matrix: [[1,1,1],[1,0,0]] },
    { id: "supply-uplink-unit", name: "Suppy Uplink Unit", type: "Sensors",
      imageUrl: "https://jumpship.wiki.gg/images/SupplyUplinkUnit.png?49f0ea", matrix: [[0,1,1],[1,1,0]] },

    { id: "mk1-fragment-cannon", name: "MK1 Fragment Cannon", type: "Pilot Canons",
      imageUrl: "https://jumpship.wiki.gg/images/FragPlug.png?9a439d", matrix: [[1,1,1]] },
    { id: "bolt-accelerator", name: "Bolt Accelerator", type: "Pilot Canons",
      imageUrl: "https://jumpship.wiki.gg/images/FragPlug.png?9a439d", matrix: [[1,1,1],[1,0,1]] },
    { id: "mk2-fragment-cannon", name: "MK2 Fragment Cannon", type: "Pilot Canons", matrix: [[1,1,1],[0,1,0]] },
    { id: "mk3-fragment-cannon", name: "MK3 Fragment Cannon", type: "Pilot Canons", matrix: [[1,1,1],[0,1,0]] },
    { id: "mk1-disruptor-laser", name: "MK1 Disruptor Laser", type: "Pilot Canons", matrix: [[1,1],[1,0]] },
    { id: "mk2-disruptor-laser", name: "MK2 Disruptor Laser", type: "Pilot Canons", matrix: [[1,1],[1,0]] },
    { id: "mk3-disruptor-laser", name: "MK3 Disruptor Laser", type: "Pilot Canons", matrix: [[1,1]] },
    { id: "rapid-pulse-cannon", name: "Rapid Pulse Cannon", type: "Pilot Canons",
      imageUrl: "https://jumpship.wiki.gg/images/RapidPulseCannon.png?84e695", matrix: [[1,1,1],[1,1,1]] },
    { id: "disruptor-laser", name: "Disruptor Laser", type: "Pilot Canons",
      imageUrl: "https://jumpship.wiki.gg/images/DisruptorLaser.png?9c0514", matrix: [[1,1],[1,0]] },

    { id: "assault-turrets", name: "Assault Turrets", type: "Multi Turret Systems",
      imageUrl: "https://jumpship.wiki.gg/images/AssaultTurrets.png?f5dc7d", matrix: [[1,1,1],[1,0,0]] },
    { id: "mk1-mining-lasers", name: "MK1 Mining Lasers", type: "Multi Turret Systems", matrix: [[1,1],[1,0]] },
    { id: "mk2-mining-lasers", name: "MK2 Mining Lasers", type: "Multi Turret Systems", matrix: [[1,1],[1,0]] },
    { id: "mk3-mining-lasers", name: "MK3 Mining Lasers", type: "Multi Turret Systems", matrix: [[1,1]] },
    { id: "gatling-turrets", name: "Gatling Turrets", type: "Multi Turret Systems",
      imageUrl: "https://jumpship.wiki.gg/images/GatlingTurrets.png?e96061", matrix: [[1,1,1],[1,1,1],[1,0,0]] },
    { id: "flak-launcher-turrets", name: "Flak Launcher Turrets", type: "Multi Turret Systems",
      imageUrl: "https://jumpship.wiki.gg/images/FlakLauncherTurretsMk2.png?8e16e8", matrix: [[1,1,1,1],[1,0,0,1]] },

    { id: "lance-rail-gun", name: "Lance Rail Gun", type: "Special Weapons",
      imageUrl: "https://jumpship.wiki.gg/images/LancePlug.png?9e7418", matrix: [[1,1,1],[1,0,1],[1,0,1]] },
    { id: "missile-launcher", name: "Missile Launcher", type: "Special Weapons", matrix: [[1,1,1],[1,1,1],[1,1,1]] },
    { id: "targeting-module", name: "Targeting Module", type: "Special Weapons",
      imageUrl: "https://jumpship.wiki.gg/images/TargetingModule.png?db2260", matrix: [[1,1]] },
    { id: "burst-shield", name: "Burst Shield", type: "Special Weapons", matrix: [[1,1],[1,1]] },

    { id: "drift-phase-engine", name: "Drift Phase Engine", type: "Engines",
      imageUrl: "https://jumpship.wiki.gg/images/EnginePlug.png?1252ce", matrix: [[1,1,1]] },
    { id: "mass-ejector-engine", name: "Mass Ejector Engine", type: "Engines",
      imageUrl: "https://jumpship.wiki.gg/images/MassEjectorEngine.png?24d696", matrix: [[1,1,1]] },
    { id: "nitro-pulse-engine", name: "Nitro Pulse Engine", type: "Engines",
      imageUrl: "https://jumpship.wiki.gg/images/MassEjectorEngine.png?24d696", matrix: [[1,1,1,1]] },
    { id: "microplasma-engine", name: "Microplasma Engine", type: "Engines",
      imageUrl: "https://jumpship.wiki.gg/images/MassEjectorEngine.png?24d696", matrix: [[1]] }
  ]
};
