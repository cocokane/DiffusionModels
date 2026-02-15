// ── Math utilities ──
export function erfc(x) {
    const ax = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * ax);
    const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    const r = poly * Math.exp(-ax * ax);
    return x >= 0 ? r : 2 - r;
}

// ── Constants ──
export const DOMAIN_LENGTH = 100; // µm — full simulation domain (10× visible)
export const VISIBLE_LENGTH = 10;  // µm — shown in viewport & plot
export const DOMAIN_WIDTH = 4;   // µm
export const NUM_BINS = 40;
export const MAX_ATOMS = 5000;

// ── Simulation engine ──
export class DiffusionSim {
    constructor() {
        this.caseNum = 1;
        this.gamma = 20;      // Hz
        this.lambda = 0.50;    // µm
        this.numAtoms = 2000;
        this.time = 0;       // s
        this.running = false;
        this.speed = 1.0;
        this.atoms = new Float32Array(MAX_ATOMS * 3);
        this.reset();
    }

    get D() { return this.gamma * this.lambda * this.lambda / 6; }
    get domainMin() { return this.caseNum === 2 ? -DOMAIN_LENGTH / 2 : 0; }
    get domainMax() { return this.caseNum === 2 ? DOMAIN_LENGTH / 2 : DOMAIN_LENGTH; }
    get visibleMin() { return this.caseNum === 2 ? -VISIBLE_LENGTH / 2 : 0; }
    get visibleMax() { return this.caseNum === 2 ? VISIBLE_LENGTH / 2 : VISIBLE_LENGTH; }

    setCase(n) { this.caseNum = n; this.reset(); }

    reset() {
        this.time = 0;
        const W = DOMAIN_WIDTH;
        for (let i = 0; i < this.numAtoms; i++) {
            this.atoms[i * 3] = 0;
            this.atoms[i * 3 + 1] = (Math.random() - 0.5) * W;
            this.atoms[i * 3 + 2] = (Math.random() - 0.5) * W;
        }
    }

    setNumAtoms(n) {
        const old = this.numAtoms;
        this.numAtoms = n;
        if (n > old) {
            const W = DOMAIN_WIDTH;
            for (let i = old; i < n; i++) {
                this.atoms[i * 3] = 0;
                this.atoms[i * 3 + 1] = (Math.random() - 0.5) * W;
                this.atoms[i * 3 + 2] = (Math.random() - 0.5) * W;
            }
        }
    }

    step(dt) {
        if (!this.running) return;
        const simDt = dt * this.speed;
        const subSteps = Math.max(1, Math.ceil(this.gamma * simDt));
        const subDt = simDt / subSteps;
        const lam = this.lambda;
        const xMin = this.domainMin;
        const xMax = this.domainMax;
        const hw = DOMAIN_WIDTH / 2;
        const n = this.numAtoms;
        const caseNum = this.caseNum;

        for (let s = 0; s < subSteps; s++) {
            const p = this.gamma * subDt;
            for (let i = 0; i < n; i++) {
                if (Math.random() >= p) continue;
                const idx = i * 3;
                const cosT = 2 * Math.random() - 1;
                const sinT = Math.sqrt(1 - cosT * cosT);
                const phi = 6.283185307 * Math.random();
                this.atoms[idx] += lam * sinT * Math.cos(phi);
                this.atoms[idx + 1] += lam * sinT * Math.sin(phi);
                this.atoms[idx + 2] += lam * cosT;

                let x = this.atoms[idx];
                if (caseNum === 1) {
                    if (x < 0) x = 0;        // constant-C source
                    if (x > xMax) x = xMax;   // clamp at 100 µm (far enough)
                } else if (caseNum === 2) {
                    if (x < xMin) x = xMin;   // clamp at ±50 µm
                    if (x > xMax) x = xMax;
                } else {
                    if (x < 0) x = -x;        // reflecting wall
                    if (x > xMax) x = xMax;   // clamp at 100 µm
                }
                this.atoms[idx] = x;

                // Periodic boundary conditions on y and z
                let y = this.atoms[idx + 1];
                let z = this.atoms[idx + 2];
                if (y < -hw) y += DOMAIN_WIDTH;
                else if (y > hw) y -= DOMAIN_WIDTH;
                if (z < -hw) z += DOMAIN_WIDTH;
                else if (z > hw) z -= DOMAIN_WIDTH;
                this.atoms[idx + 1] = y;
                this.atoms[idx + 2] = z;
            }
        }
        this.time += simDt;
    }

    /** Histogram of atoms within VISIBLE range only. Returns raw counts. */
    getHistogram() {
        const bins = new Float32Array(NUM_BINS);
        const lo = this.visibleMin;
        const hi = this.visibleMax;
        const binW = (hi - lo) / NUM_BINS;
        for (let i = 0; i < this.numAtoms; i++) {
            const x = this.atoms[i * 3];
            if (x < lo || x >= hi) continue;
            const b = Math.min(Math.floor((x - lo) / binW), NUM_BINS - 1);
            bins[b]++;
        }
        return bins;
    }

    /** Count atoms within the visible window. */
    countInView() {
        let c = 0;
        const lo = this.visibleMin, hi = this.visibleMax;
        for (let i = 0; i < this.numAtoms; i++) {
            const x = this.atoms[i * 3];
            if (x >= lo && x <= hi) c++;
        }
        return c;
    }

    /** Analytical solution.
     *  Case 1: returns C/C₀ (0–1 range).
     *  Cases 2&3: returns probability density (peak decreases with time). */
    analyticalAt(x) {
        const Dt = this.D * this.time;
        if (this.caseNum === 1) {
            if (Dt < 1e-9) return x < 0.01 ? 1 : 0;
            return erfc(x / (2 * Math.sqrt(Dt)));
        }
        if (Dt < 1e-9) return 0;
        const gauss = Math.exp(-(x * x) / (4 * Dt));
        const pre = this.caseNum === 2
            ? 1 / (2 * Math.sqrt(Math.PI * Dt))
            : 1 / Math.sqrt(Math.PI * Dt);
        return pre * gauss;
    }
}
