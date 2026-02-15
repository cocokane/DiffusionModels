import { DiffusionSim } from './simulation.js';
import { SceneManager, PlotManager } from './renderer.js';

// ── Case metadata ──
const CASE_META = {
    1: { title: 'Semi-Infinite Diffusion', analyticsLabel: 'Analytical erfc' },
    2: { title: 'Planar Source — Infinite Medium', analyticsLabel: 'Analytical Gaussian' },
    3: { title: 'Thin Film — Semi-Infinite Body', analyticsLabel: 'Analytical Gaussian' },
};

// ── DOM refs ──
const viewport = document.getElementById('viewport');
const plotCanvas = document.getElementById('plotCanvas');
const gammaSlider = document.getElementById('gammaSlider');
const lambdaSlider = document.getElementById('lambdaSlider');
const atomsSlider = document.getElementById('atomsSlider');
const speedSlider = document.getElementById('speedSlider');
const gammaVal = document.getElementById('gammaVal');
const lambdaVal = document.getElementById('lambdaVal');
const atomsVal = document.getElementById('atomsVal');
const speedVal = document.getElementById('speedVal');
const dVal = document.getElementById('dVal');
const diffLenVal = document.getElementById('diffLenVal');
const timeDisplay = document.getElementById('timeDisplay');
const atomCountEl = document.getElementById('atomCount');
const btnPlay = document.getElementById('btnPlay');
const btnReset = document.getElementById('btnReset');
const legendAnalLabel = document.getElementById('legendAnalLabel');
const atomsLabel = document.getElementById('atomsLabel');

// ── Init ──
const sim = new DiffusionSim();
const scene = new SceneManager(viewport);
const plot = new PlotManager(plotCanvas);

// ── Case switching ──
const caseBtns = document.querySelectorAll('.case-btn');
const caseHeaders = document.querySelectorAll('.case-header');
const caseDetails = document.querySelectorAll('.case-details');

function switchCase(n) {
    sim.setCase(n);
    scene.setupForCase(n);
    scene.updateAtoms(sim);

    // Sidebar active state
    caseBtns.forEach(b => b.classList.toggle('active', parseInt(b.dataset.case) === n));

    // Header visibility
    caseHeaders.forEach(h => h.style.display = parseInt(h.dataset.case) === n ? '' : 'none');
    caseDetails.forEach(d => d.style.display = parseInt(d.dataset.case) === n ? '' : 'none');

    legendAnalLabel.textContent = CASE_META[n].analyticsLabel;

    // Slider label: Case 1 = concentration, Cases 2&3 = atom count
    atomsLabel.textContent = n === 1 ? 'Surface Conc. (C₀)' : 'Number of Atoms';

    // Pause on switch
    sim.running = false;
    btnPlay.textContent = '▶ Play';
    btnPlay.classList.remove('active');

    updateUI();
}

caseBtns.forEach(b => b.addEventListener('click', () => switchCase(parseInt(b.dataset.case))));

// ── Controls ──
function readControls() {
    sim.gamma = parseFloat(gammaSlider.value);
    sim.lambda = parseFloat(lambdaSlider.value) / 100;
    sim.speed = parseFloat(speedSlider.value) / 10;
    const newN = parseInt(atomsSlider.value);
    if (newN !== sim.numAtoms) sim.setNumAtoms(newN);
}

function updateUI() {
    readControls();
    gammaVal.textContent = sim.gamma + ' Hz';
    lambdaVal.textContent = sim.lambda.toFixed(2) + ' µm';
    if (sim.caseNum === 1) {
        // Show as relative concentration
        const pct = (sim.numAtoms / 5000 * 100).toFixed(0);
        atomsVal.textContent = pct + '%';
    } else {
        atomsVal.textContent = sim.numAtoms;
    }
    speedVal.textContent = sim.speed.toFixed(1) + '×';
    dVal.textContent = sim.D.toFixed(4) + ' µm²/s';
    const dl = sim.time > 0 ? Math.sqrt(2 * sim.D * sim.time).toFixed(2) : '0.00';
    diffLenVal.textContent = dl + ' µm';
    timeDisplay.textContent = `t = ${sim.time.toFixed(2)} s`;
    const inView = sim.countInView();
    atomCountEl.textContent = `${inView} in view / ${sim.numAtoms} total`;
}

gammaSlider.addEventListener('input', updateUI);
lambdaSlider.addEventListener('input', updateUI);
atomsSlider.addEventListener('input', updateUI);
speedSlider.addEventListener('input', updateUI);

btnPlay.addEventListener('click', () => {
    sim.running = !sim.running;
    btnPlay.textContent = sim.running ? '⏸ Pause' : '▶ Play';
    btnPlay.classList.toggle('active', sim.running);
});

btnReset.addEventListener('click', () => {
    sim.reset();
    updateUI();
    scene.updateAtoms(sim);
});

// ── Resize ──
function onResize() { scene.resize(); plot.resize(); }
window.addEventListener('resize', onResize);

// ── Animation loop ──
let lastTime = 0;
function animate(ts) {
    requestAnimationFrame(animate);
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    sim.step(dt);
    readControls();
    updateUI();
    scene.updateAtoms(sim);
    scene.render();
    plot.draw(sim);
}

// ── Boot ──
switchCase(1);
requestAnimationFrame(animate);
