import * as THREE from 'three';
import { DOMAIN_LENGTH, VISIBLE_LENGTH, DOMAIN_WIDTH, NUM_BINS, MAX_ATOMS } from './simulation.js';

const ATOM_RADIUS = 0.06;

// ────────────────────── 3D SCENE ──────────────────────
export class SceneManager {
    constructor(viewport) {
        this.viewport = viewport;
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x08081a);
        viewport.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const d = new THREE.DirectionalLight(0xffffff, 0.8);
        d.position.set(5, 10, 8);
        this.scene.add(d);

        this.dummy = new THREE.Object3D();
        this.tmpColor = new THREE.Color();
        this.hideMatrix = new THREE.Matrix4().makeTranslation(9999, 9999, 9999);

        this.envGroup = new THREE.Group();
        this.scene.add(this.envGroup);

        // Instanced mesh
        const geo = new THREE.SphereGeometry(ATOM_RADIUS, 8, 6);
        const mat = new THREE.MeshPhongMaterial();
        this.atomMesh = new THREE.InstancedMesh(geo, mat, MAX_ATOMS);
        this.atomMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        const ic = new Float32Array(MAX_ATOMS * 3);
        this.atomMesh.instanceColor = new THREE.InstancedBufferAttribute(ic, 3);
        this.atomMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.atomMesh);

        this.currentCase = 0;
        this.setupForCase(1);
        this.resize();
    }

    setupForCase(caseNum) {
        if (this.currentCase === caseNum) return;
        this.currentCase = caseNum;
        this.envGroup.clear();

        const V = VISIBLE_LENGTH; // box shows visible range only
        const W = DOMAIN_WIDTH;
        const vMin = caseNum === 2 ? -V / 2 : 0;
        const cx = caseNum === 2 ? 0 : V / 2;

        // Visible-range box
        const boxGeo = new THREE.BoxGeometry(V, W, W);
        const boxLine = new THREE.LineSegments(
            new THREE.EdgesGeometry(boxGeo),
            new THREE.LineBasicMaterial({ color: 0x334488, transparent: true, opacity: 0.5 }));
        boxLine.position.set(cx, 0, 0);
        this.envGroup.add(boxLine);

        // Source plane at x=0
        const planeGeo = new THREE.PlaneGeometry(W, W);
        const planeColor = caseNum === 1 ? 0xff6b9d : caseNum === 2 ? 0x2ecc71 : 0x9b59b6;
        const plane = new THREE.Mesh(planeGeo,
            new THREE.MeshBasicMaterial({ color: planeColor, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
        plane.rotation.y = Math.PI / 2;
        this.envGroup.add(plane);
        const ring = new THREE.LineSegments(
            new THREE.EdgesGeometry(planeGeo),
            new THREE.LineBasicMaterial({ color: planeColor, transparent: true, opacity: 0.6 }));
        ring.rotation.y = Math.PI / 2;
        this.envGroup.add(ring);

        // X-axis arrow
        this.envGroup.add(new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(vMin - 0.5, -W / 2 - 0.3, W / 2),
            V + 1, 0x4466aa, 0.3, 0.15));

        // Grid
        const grid = new THREE.GridHelper(V, 10, 0x223355, 0x1a2244);
        grid.position.set(cx, -W / 2, 0);
        this.envGroup.add(grid);

        // Camera
        this.camera.position.set(cx, 3.5, 10);
        this.camera.lookAt(cx, 0, 0);
    }

    updateAtoms(sim) {
        const n = sim.numAtoms;
        const vMin = sim.visibleMin;
        const vMax = sim.visibleMax;
        const vRange = vMax - vMin;
        for (let i = 0; i < n; i++) {
            const x = sim.atoms[i * 3];
            this.dummy.position.set(x, sim.atoms[i * 3 + 1], sim.atoms[i * 3 + 2]);
            this.dummy.updateMatrix();
            this.atomMesh.setMatrixAt(i, this.dummy.matrix);

            if (x >= vMin && x <= vMax) {
                // In view: warm→cool gradient
                const ratio = (x - vMin) / vRange;
                this.tmpColor.setHSL(0.08 + ratio * 0.55, 0.9, 0.55 + ratio * 0.1);
            } else {
                // Out of view: dim grey
                this.tmpColor.setHSL(0.6, 0.15, 0.25);
            }
            this.atomMesh.setColorAt(i, this.tmpColor);
        }
        for (let i = n; i < MAX_ATOMS; i++) {
            this.atomMesh.setMatrixAt(i, this.hideMatrix);
        }
        this.atomMesh.instanceMatrix.needsUpdate = true;
        this.atomMesh.instanceColor.needsUpdate = true;
    }

    render() { this.renderer.render(this.scene, this.camera); }

    resize() {
        const r = this.viewport.getBoundingClientRect();
        this.renderer.setSize(r.width, r.height);
        this.camera.aspect = r.width / r.height;
        this.camera.updateProjectionMatrix();
    }
}

// ────────────────────── 2D PLOT ──────────────────────
export class PlotManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.cachedYMax = 1;
        this.lastYMaxTime = 0;
        this.resize();
    }

    resize() {
        const wrap = this.canvas.parentElement;
        const dpr = Math.min(window.devicePixelRatio, 2);
        this.canvas.width = wrap.clientWidth * dpr;
        this.canvas.height = wrap.clientHeight * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    draw(sim) {
        const ctx = this.ctx;
        const dpr = Math.min(window.devicePixelRatio, 2);
        const w = this.canvas.width / dpr;
        const h = this.canvas.height / dpr;
        const pad = { top: 20, right: 25, bottom: 42, left: 58 };
        const pw = w - pad.left - pad.right;
        const ph = h - pad.top - pad.bottom;
        const xMin = sim.visibleMin;
        const xMax = sim.visibleMax;
        const xRange = xMax - xMin;
        const isCase1 = sim.caseNum === 1;

        // Clear
        ctx.fillStyle = '#0b0b20';
        ctx.fillRect(0, 0, w, h);

        // ── Prepare data ──
        const hist = sim.getHistogram(); // raw counts in visible range
        const binW_data = xRange / NUM_BINS; // µm per bin
        const N = sim.numAtoms;

        // Compute plot values: histogram bars & analytical curve
        let histPlot = new Float32Array(NUM_BINS);
        let analPoints = [];
        let yMax;

        if (isCase1) {
            // Case 1: normalize by bin[0] → C/C₀
            const peak = hist[0] || 1;
            for (let i = 0; i < NUM_BINS; i++) histPlot[i] = hist[i] / peak;
            for (let i = 0; i <= 200; i++) {
                const frac = i / 200;
                analPoints.push(sim.analyticalAt(xMin + frac * xRange));
            }
            yMax = 1.2;
        } else {
            // Cases 2&3: probability density — histogram density vs analytical PDF
            for (let i = 0; i < NUM_BINS; i++) {
                histPlot[i] = hist[i] / (N * binW_data);
            }
            for (let i = 0; i <= 200; i++) {
                const frac = i / 200;
                analPoints.push(sim.analyticalAt(xMin + frac * xRange));
            }
            // Auto-scale y — update cached value every 0.5s
            const now = performance.now();
            if (now - this.lastYMaxTime > 500) {
                let hMax = 0;
                for (let i = 0; i < NUM_BINS; i++) if (histPlot[i] > hMax) hMax = histPlot[i];
                let aMax = 0;
                for (let i = 0; i < analPoints.length; i++) if (analPoints[i] > aMax) aMax = analPoints[i];
                this.cachedYMax = Math.max(hMax, aMax) * 1.15;
                if (this.cachedYMax < 1e-6) this.cachedYMax = 1;
                this.lastYMaxTime = now;
            }
            yMax = this.cachedYMax;
        }

        // ── Grid ──
        ctx.strokeStyle = 'rgba(50,60,100,0.4)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 5; i++) {
            const y = pad.top + (i / 5) * ph;
            ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + pw, y); ctx.stroke();
        }
        for (let i = 0; i <= 10; i++) {
            const x = pad.left + (i / 10) * pw;
            ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + ph); ctx.stroke();
        }

        // ── Axes ──
        ctx.strokeStyle = 'rgba(100,120,200,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.left, pad.top);
        ctx.lineTo(pad.left, pad.top + ph);
        ctx.lineTo(pad.left + pw, pad.top + ph);
        ctx.stroke();

        // ── X-axis labels with tick marks ──
        ctx.fillStyle = '#8890b0';
        ctx.font = '11px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('Position x (µm)', pad.left + pw / 2, h - 5);
        ctx.strokeStyle = 'rgba(100,120,200,0.6)';
        ctx.lineWidth = 1;
        const nTicks = 10;
        for (let i = 0; i <= nTicks; i++) {
            const px = pad.left + (i / nTicks) * pw;
            const val = xMin + (i / nTicks) * xRange;
            // Tick mark
            ctx.beginPath(); ctx.moveTo(px, pad.top + ph); ctx.lineTo(px, pad.top + ph + 5); ctx.stroke();
            // Label: integer µm
            ctx.fillStyle = '#8890b0';
            const label = Number.isInteger(val) ? val + '' : val.toFixed(1);
            ctx.fillText(label, px, pad.top + ph + 17);
        }
        ctx.textAlign = 'right';
        for (let i = 0; i <= 5; i++) {
            const y = pad.top + ph - (i / 5) * ph;
            const yVal = (i / 5) * yMax;
            if (isCase1) {
                ctx.fillText(yVal.toFixed(1), pad.left - 8, y + 4);
            } else {
                ctx.fillText(yVal < 0.01 ? yVal.toExponential(1) : yVal.toFixed(2), pad.left - 8, y + 4);
            }
        }
        ctx.save();
        ctx.translate(13, pad.top + ph / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText(isCase1 ? 'C(x,t) / C₀' : 'Density (µm⁻¹)', 0, 0);
        ctx.restore();

        // ── Histogram bars ──
        const binW_px = pw / NUM_BINS;
        ctx.fillStyle = 'rgba(255, 159, 67, 0.45)';
        ctx.strokeStyle = 'rgba(255, 159, 67, 0.8)';
        ctx.lineWidth = 1;
        for (let i = 0; i < NUM_BINS; i++) {
            const bx = pad.left + i * binW_px;
            const bh = Math.min(histPlot[i] / yMax, 1) * ph;
            if (bh > 0.5) {
                ctx.fillRect(bx, pad.top + ph - bh, binW_px - 1, bh);
                ctx.strokeRect(bx, pad.top + ph - bh, binW_px - 1, bh);
            }
        }

        // ── Analytical curve ──
        ctx.beginPath();
        ctx.strokeStyle = '#00d4ff';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#00d4ff';
        ctx.shadowBlur = 6;
        for (let i = 0; i <= 200; i++) {
            const px = pad.left + (i / 200) * pw;
            const py = pad.top + ph - Math.min(analPoints[i] / yMax, 1) * ph;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
}
