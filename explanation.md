# How This Codebase Works

This document explains the Fick's Law Diffusion Simulator — its architecture, the physics engine, and every critical section you'd need to understand before modifying it.

---

## Architecture at a Glance

The entire app is four files with zero build step. The browser loads `index.html`, which pulls Three.js and KaTeX from CDNs, then runs three ES modules:

```
index.html          ← Layout, CSS, UI structure (719 lines)
js/main.js          ← Orchestrator: wires controls → sim → renderers (133 lines)
js/simulation.js    ← Physics engine: atom movement + analytical math (156 lines)
js/renderer.js      ← Visual output: 3D scene + 2D concentration plot (292 lines)
```

Data flows in one direction every frame: **Controls → Simulation → Renderers**. There is no state management library, no framework — just a `requestAnimationFrame` loop in `main.js` that calls `sim.step()`, then tells both renderers to redraw.

---

## The Simulation Engine (`simulation.js`)

This is the brain of the app. The `DiffusionSim` class manages all physics.

### Constants that define the world

| Constant | Value | Meaning |
|---|---|---|
| `DOMAIN_LENGTH` | 100 µm | Total simulation space (mostly off-screen) |
| `VISIBLE_LENGTH` | 10 µm | What the user actually sees |
| `DOMAIN_WIDTH` | 4 µm | Width/height of the 3D box (y and z axes) |
| `NUM_BINS` | 40 | Histogram resolution for the concentration plot |
| `MAX_ATOMS` | 5000 | Hard upper limit on atom count |

The domain is intentionally 10× larger than the visible window. This prevents edge effects — atoms that diffuse beyond the viewport still exist in the simulation, they're just not rendered prominently. This is critical for physical accuracy.

### How atoms move: the `step()` method

This is the most important function in the codebase (~50 lines, starting at line 62). Here's what happens every frame:

1. **Sub-stepping.** The frame's time delta (`dt × speed`) is divided into sub-steps. The number of sub-steps equals `ceil(gamma × simDt)`, ensuring each sub-step has at most one expected jump per atom. This prevents atoms from "teleporting" when the jumping frequency or sim speed is high.

2. **Jump probability.** For each atom in each sub-step, a random number decides if it jumps: `if (Math.random() >= p) continue;` where `p = gamma × subDt`. This models a Poisson process — each atom independently attempts a jump with probability proportional to the frequency Γ.

3. **Random direction (3D isotropic).** When an atom does jump, it picks a uniformly random direction on a sphere using the standard method:
   - `cosθ` is uniform in [−1, 1]
   - `φ` is uniform in [0, 2π]
   - The atom moves by `λ` in that direction

   This produces physically correct isotropic diffusion in 3D — no axis is favored.

4. **Boundary conditions (case-dependent).** After moving, the atom's x-position is clamped based on which diffusion case is active:
   - **Case 1 (Semi-Infinite):** `x < 0 → x = 0`. Atoms bouncing back to x = 0 simulates a constant-concentration source at the surface. This is the key physical trick — it's equivalent to maintaining C = C₀ at x = 0.
   - **Case 2 (Planar Source):** Simple clamping at ±50 µm. Atoms start at x = 0 and spread symmetrically in both directions.
   - **Case 3 (Thin Film):** `x < 0 → x = −x` (reflection). The wall at x = 0 reflects atoms, modeling a sealed surface with no flux. Atoms only spread into the positive x direction.

5. **Periodic boundaries on y/z.** If an atom exits the 4 µm box laterally, it wraps around. This simulates an infinite medium in the transverse directions without needing infinite atoms.

### The diffusion coefficient

The getter `get D()` computes `D = Γλ²/6`. This is the Einstein relation for 3D random walks — the factor of 6 comes from 3 dimensions × 2 directions each. When you change the sliders for jump frequency (Γ) or jump length (λ), D updates immediately.

### Analytical solutions

`analyticalAt(x)` returns the exact mathematical solution for comparison:
- **Case 1:** `C₀ × erfc(x / 2√(Dt))` — the complementary error function solution to the semi-infinite diffusion equation.
- **Cases 2 & 3:** Gaussian probability density `exp(−x²/4Dt) / √(πDt)`, with a factor of 2 difference between them (Case 2 spreads both ways, Case 3 only one way).

The `erfc()` function at the top of the file is a polynomial approximation (Horner form with Abramowitz & Stegun coefficients), accurate to ~10⁻⁷.

---

## The 3D Renderer (`renderer.js` — `SceneManager`)

Uses Three.js with **instanced rendering** — a single `InstancedMesh` draws all 5000 atoms in one GPU draw call. Without instancing, 5000 separate spheres would be ~100× slower.

Key mechanics:
- **`updateAtoms()`** runs every frame. It loops through all atoms, sets each instance's position matrix and color. Atoms within the visible range get a warm-to-cool HSL gradient (orange → teal). Atoms outside the view are dimmed gray.
- **`setupForCase()`** rebuilds the environment (wireframe box, source plane, grid, arrow) when you switch diffusion cases. The source plane's color matches the sidebar buttons (pink/green/purple).
- Unused atom instances (when fewer than 5000 active) are hidden by translating them to position (9999, 9999, 9999) — off-screen.

---

## The 2D Plot (`renderer.js` — `PlotManager`)

Draws the concentration profile using raw Canvas 2D — no charting library.

Two datasets are plotted every frame:
1. **Orange histogram bars** — the simulated atom distribution. The simulation's `getHistogram()` bins atoms by x-position within the visible range. For Case 1, bars are normalized by the peak bin (giving C/C₀). For Cases 2 & 3, bars show probability density (count / total / bin-width).
2. **Cyan analytical curve** — the exact mathematical solution, evaluated at 200 points.

The y-axis uses **cached scaling** — it only recalculates the max value every 500ms (`lastYMaxTime`). This prevents the y-axis from jittering wildly when atom counts fluctuate frame-to-frame.

---

## The Orchestrator (`main.js`)

Wires everything together in ~130 lines:
- Reads slider values and feeds them to the simulation
- The `animate()` loop: `requestAnimationFrame` → `sim.step(dt)` → `scene.updateAtoms()` → `scene.render()` → `plot.draw()`
- Handles case-switching (sidebar buttons), play/pause, and reset
- Caps `dt` at 50ms (`Math.min(dt, 0.05)`) to prevent spiral-of-death when the browser tab is backgrounded and returns with a huge accumulated delta

---

## What You Can Safely Modify

| Want to... | Where to look |
|---|---|
| Add a new diffusion case (Case 4) | Add boundary logic in `simulation.js:step()`, analytical formula in `analyticalAt()`, a header block in `index.html`, and a sidebar button |
| Change atom appearance | `renderer.js` line 31 (geometry) and lines 103–110 (color gradient) |
| Adjust the visible domain size | `VISIBLE_LENGTH` in `simulation.js` (+ camera position in `renderer.js`) |
| Change histogram resolution | `NUM_BINS` in `simulation.js` |
| Add new controls | Add HTML slider in `index.html`, read it in `main.js:readControls()` |
| Modify the plot | `PlotManager.draw()` in `renderer.js` — it's all Canvas 2D API calls |
| Change max atom count | `MAX_ATOMS` in `simulation.js` (but the instanced mesh is also sized by this) |
