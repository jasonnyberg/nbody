particle_merging-and-splitting_tvcg2021.pdf
PDF
Read this paper about merging and splitting particles to avoid collision destabilization, and think about how it could apply to https://github.com/jasonnyberg/nbody/blob/main/nbody3.html
ChatGPT said:
Thought for 1m 0s

This paper’s core trick is simple and sturdy: when two particles intersect and are moving toward each other, temporarily merge them into a single “meta-particle” for the duration of the time-step, integrate as usual, then split them back so that (a) they no longer head into each other and (b) momentum and (optionally) kinetic energy are respected. That one-step “bond” prevents the force/velocity spikes that otherwise destabilize explicit integrators near collisions. 

particle_merging-and-splitting_…

Below is a drop-in way to graft this onto your nbody3.html (your WebGL/WebGPU/WebGL2 CPU-compute loop). I’m assuming your current loop is the classic:

for each time step:
  // accumulate forces
  for i<j: compute Fij; Fi += Fij; Fj -= Fij
  // integrate
  v += (F/m)*dt
  x += v*dt

What to add
0) Per-particle properties

Add radius r[i] (for collision) and keep your mass m[i]. You can default radii from mass (e.g., constant density) or set a fixed small radius for visual collisions.

1) Detect candidate pairs (same pass as forces)

During the pair loop, check the two collision rules from the paper:

Rule 1 (overlap): ||x2 - x1|| < r1 + r2.

Rule 2 (approaching): n · (v2 - v1) < 0 with n = x2 - x1.

Only pairs that satisfy both get merged in this stage. This prevents “forever-stuck” contacts and is the key to avoiding repeated merges when they’re already separating. 

particle_merging-and-splitting_…

Tip: The paper uses a CFL-style limiter so a particle doesn’t travel more than its radius per time-step (or use continuous collision detection if you prefer). 

particle_merging-and-splitting_…

2) Build meta-particles (union-find)

Pairs can chain (A with B, B with C, …). Use a small union-find to produce disjoint merge sets. For each set S:

Merge step (start of the time-step)
Compute the meta mass/COM/velocity:

𝑚
𝑆
=
∑
𝑘
∈
𝑆
𝑚
𝑘
m
S
	​

=∑
k∈S
	​

m
k
	​


𝑥
𝑆
=
∑
𝑘
𝑚
𝑘
𝑥
𝑘
𝑚
𝑆
x
S
	​

=
m
S
	​

∑
k
	​

m
k
	​

x
k
	​

	​


𝑣
𝑆
=
∑
𝑘
𝑚
𝑘
𝑣
𝑘
𝑚
𝑆
v
S
	​

=
m
S
	​

∑
k
	​

m
k
	​

v
k
	​

	​


For two-particle exposition the paper writes 
𝑚
12
,
𝑥
12
,
𝑣
12
m
12
	​

,x
12
	​

,v
12
	​

 as above. Momentum is conserved; kinetic energy typically drops (inelastic merge), and that drop is stored as a “virtual bond” 
Δ
𝐸
ΔE:

Δ
𝐸
=
𝑚
1
𝑚
2
2
𝑚
12
∥
𝑣
1
−
𝑣
2
∥
2
≥
0
ΔE=
2m
12
	​

m
1
	​

m
2
	​

	​

∥v
1
	​

−v
2
	​

∥
2
≥0.
Keep 
𝑛
=
𝑥
2
−
𝑥
1
n=x
2
	​

−x
1
	​

 from the beginning of the step. 

particle_merging-and-splitting_…

For sets with >2 particles, store pairwise bonds (or equivalently pick a spanning tree of bonds) and the set’s COM state. Starting with 2-body is perfectly fine.

3) Force evaluation while merged

Integrate the meta-particle like a normal particle (position/velocity at its COM). However, when computing forces from others on the members, you reconstruct each member’s position from the meta’s updated COM 
𝑥
12
′
x
12
′
	​

 using the frozen relative vector 
𝑛
n:

𝑥
1
′
=
𝑥
12
′
−
(
𝑚
2
/
𝑚
12
)
 
𝑛
,
𝑥
2
′
=
𝑥
12
′
+
(
𝑚
1
/
𝑚
12
)
 
𝑛
x
1
′
	​

=x
12
′
	​

−(m
2
	​

/m
12
	​

)n,x
2
′
	​

=x
12
′
	​

+(m
1
	​

/m
12
	​

)n.
That “rigid bond during the step” is the hack that eliminates local blow-ups yet keeps neighbors “feeling” the two bodies where they ought to be. 

particle_merging-and-splitting_…

Minimal change to your CPU path: accumulate external forces to the meta at COM (good first pass). Higher fidelity (and what the paper describes) computes interactions against the reconstructed 
𝑥
1
′
,
𝑥
2
′
x
1
′
	​

,x
2
′
	​

 during the step to better distribute forces. Start simple; you can refine after it works.

4) Split at the end of the step

At the end of integration for the step you split, returning a fraction 
𝛼
∈
[
0
,
1
]
α∈[0,1] of the stored 
Δ
𝐸
ΔE back to kinetic energy (the paper defaults 
𝛼
=
1
α=1, i.e., fully elastic). Let 
𝑣
12
′
v
12
′
	​

 be the meta velocity after integration. Solve for the final component velocities 
𝑣
1
′
,
𝑣
2
′
v
1
′
	​

,v
2
′
	​

 from conservation of momentum and (partial) energy:

𝑚
12
 
𝑣
12
′
=
𝑚
1
𝑣
1
′
+
𝑚
2
𝑣
2
′
m
12
	​

v
12
′
	​

=m
1
	​

v
1
′
	​

+m
2
	​

v
2
′
	​

1
2
𝑚
1
∥
𝑣
1
′
∥
2
+
1
2
𝑚
2
∥
𝑣
2
′
∥
2
=
1
2
𝑚
12
∥
𝑣
12
′
∥
2
+
𝛼
 
Δ
𝐸
2
1
	​

m
1
	​

∥v
1
′
	​

∥
2
+
2
1
	​

m
2
	​

∥v
2
′
	​

∥
2
=
2
1
	​

m
12
	​

∥v
12
′
	​

∥
2
+αΔE

This reduces to:

∥
 
𝑣
12
′
−
𝑣
1
′
 
∥
2
=
𝑠
2
,
𝑠
2
=
2
𝛼
 
Δ
𝐸
𝑚
12
(
𝑚
1
/
𝑚
2
)
.
∥v
12
′
	​

−v
1
′
	​

∥
2
=s
2
,s
2
=
m
12
	​

(m
1
	​

/m
2
	​

)
2αΔE
	​

. 

particle_merging-and-splitting_…

Choose 
𝑣
1
′
v
1
′
	​

 along the collision normal 
𝑛
^
n
^
 (plus an orthogonal correction only if strictly needed), pick the smaller root so that the two bodies separate: 
(
𝑣
2
′
−
𝑣
1
′
)
⋅
𝑛
^
≥
0
(v
2
′
	​

−v
1
′
	​

)⋅
n
^
≥0. If the “pure-along-normal” quadratic has no real root, take the closest point on the energy sphere, which adds the minimal orthogonal tweak 
𝜀
ε. The paper gives the closed-form for 
𝜇
μ and 
𝜀
ε. 

particle_merging-and-splitting_…

Important practical: Split after the position update (i.e., end of step), not before; otherwise multi-step contacts can still interpenetrate. Combine this with the two-rule detector above. 

particle_merging-and-splitting_…

5) Optional “second pass” for resting contact

For “rest-in-contact” situations, they do a two-stage integration: first pass merges only approaching pairs; mark separating-but-overlapping pairs. If at end of the pass those marked pairs are again approaching, rerun the step merging them from the start. In practice, two passes suffice. If that’s too expensive in JS, you can skip this until you hit a test that needs it. 

particle_merging-and-splitting_…

Minimal JS scaffolding for your nbody3.html

Add a small collision/merge manager you call around your existing loop:

// Data you likely already have:
const N = pos.length; // Float32Array vec3s or vec2s
// add:
const rad = new Float32Array(N); // radii
const merged = new Int32Array(N).fill(-1); // id of meta set or -1
// For two-body merges store bookkeeping in a Map<key, bond>
const bonds = new Map(); // key "i,j" -> {m1,m2,n:[...], dE, alpha}

// ---------- 1) detect and union ----------
function detectMerges(dt) {
  // Optionally: CFL clamp dt so max(|v|*dt) <= r_i (paper’s suggestion)
  // First clear:
  bonds.clear();
  merged.fill(-1);
  // Union-find simplified for two-body merges to start:
  for (let i=0;i<N;i++){
    for (let j=i+1;j<N;j++){
      const n = sub(pos[j], pos[i]); // x2-x1 at *start* of step
      const dist2 = dot(n,n);
      const R = rad[i]+rad[j];
      if (dist2 >= R*R) continue; // Rule 1
      const relv = sub(vel[j], vel[i]);
      if (dot(n, relv) >= 0) continue; // Rule 2 (approaching)
      // Merge i,j  (record bond)
      const mi=m[i], mj=m[j], m12=mi+mj;
      const v12 = scale(add(scale(vel[i],mi), scale(vel[j],mj)), 1/m12);
      const dv = sub(vel[i], vel[j]);
      const dE = (mi*mj/(2*m12)) * dot(dv,dv); // paper Eq. (4)
      bonds.set(`${i},${j}`, {i,j, mi,mj, m12, n:[...n], dE, alpha:1.0, v12:[...v12]});
      merged[i]=i; merged[j]=i; // crude set id = root i
    }
  }
}

// ---------- 2) integrate metas ----------
function integrateWithMerges(dt) {
  // Replace each merged pair (i,j) by one meta at COM/COM-vel,
  // integrate COM through your usual force pipeline.
  // Easiest first pass: remove j from active list, move i to COM.
  for (const bond of bonds.values()) {
    const {i,j, mi,mj,m12} = bond;
    // set COM state
    const x12 = scale(add(scale(pos[i],mi), scale(pos[j],mj)),1/m12);
    const v12 = scale(add(scale(vel[i],mi), scale(vel[j],mj)),1/m12);
    pos[i].set(x12); vel[i].set(v12); m[i]=m12;
    // mark j inactive for this step (e.g., m[j]=0 or a separate active mask)
    m[j]=0;
  }
  // … run your regular force + integrate step on active particles …
}

// ---------- 3) split ----------
function splitAfterStep() {
  for (const bond of bonds.values()) {
    const {i,j, mi,mj, m12, n, dE, alpha} = bond;

    // meta after integration lives at slot i:
    const x12p = pos[i], v12p = vel[i];

    // reconstruct positions for rendering/next step (optional now)
    // x1' = x12' - (m2/m12) n ;  x2' = x12' + (m1/m12) n
    addInPlace(pos[i], scale(n, -mj/m12)); // x1'
    pos[j] = add(x12p, scale(n,  mi/m12)); // x2'

    // Solve velocities (project along n-hat; minimal orthogonal correction if needed)
    const nhat = normalize(n);
    const s2 = (2*alpha*dE) / (m12*(mi/mj)); // paper Eq. (11)
    // Find v1' on the energy sphere around v12', favor smaller root so they separate:
    const v1 = vel[i]; // pre-merge v1 at step start (cache if needed)
    const v12 = bond.v12; // v12 at merge time
    // Simplest stable choice per paper:
    const mu = dot(nhat, sub(v12, v1));    // Eq. (15)
    const w  = sub(sub(v12, v1), scale(nhat, mu));
    let eps = 0;
    const wlen = length(w);
    if (Math.abs(wlen*wlen - s2) > 1e-9) { // if ray misses the sphere:
      eps = (Math.sqrt(s2) - wlen);        // Eq. (16) direction = w/|w|
    }
    const v1p = add(v1, add(scale(nhat, mu), scale(normalize(w), eps)));
    // momentum gives v2'
    const v2p = scale(sub(scale(v12p, m12), scale(v1p, mi)), 1/mj);

    vel[i].set(v1p);
    vel[j] = v2p;
    m[i]=mi; m[j]=mj; // restore masses
  }
  bonds.clear();
}


That’s the whole control-flow you need:

detectMerges(dt)

integrateWithMerges(dt) (treat metas)

splitAfterStep()

If you later want the two-stage pass for resting contact: run 1–3; if any marked but not merged overlaps end the step with approaching velocities, rerun the same step with those pairs merged from the start (only then move to the next frame). 

particle_merging-and-splitting_…

Why this helps your N-body (gravity) demo

Near-collisions in Newtonian gravity blow up accelerations (even with softening) and punch numerical energy into your system. The merge-then-split step removes the singular local impulse while still letting neighbors “feel” the two bodies at their relative positions during the step. The stored bond energy 
Δ
𝐸
ΔE guarantees you can hand the kinetic energy back at split (with 
𝛼
=
1
α=1 you fully conserve it), avoiding the drift you’ve seen in some versions. 

particle_merging-and-splitting_…

Because the post-split velocities are constructed to separate along the collision normal, you don’t get the classic “stuck penetrations” even when visual radii overlap. 

particle_merging-and-splitting_…

It’s minimally invasive to your current architecture: union-find + a COM placeholder and a small solve at split.

Practical knobs for your scene

Radii: start with 
𝑟
∝
𝑚
1
/
3
r∝m
1/3
 (constant density spheres) so visual size and merge criterion feel consistent.

Softening: keep your existing gravitational softening; this scheme complements it.

Energy restitution 
𝛼
α: set 
𝛼
=
1
α=1 to conserve (paper default), or <1 if you want slight damping of grazing contacts. 

particle_merging-and-splitting_…

Performance: collisions are rare; piggyback detection on your 
𝑂
(
𝑁
2
)
O(N
2
) force loop. If you later run big 
𝑁
N, add a uniform-grid hash only for radii checks.

If you want, I can tailor the glue code to the exact structures in nbody3.html (arrays vs typed arrays, WebGL uniforms, etc.). But the flow above is the faithful adaptation of the paper’s method to your browser-based N-body.

Key formula references: merging/COM and virtual-bond energy (Eqs. 1–7, 4), split constraints (Eqs. 8–11), construction of post-split velocities (Eqs. 12–16), the two collision rules (Eqs. 21–22), and the “split after position update + two-stage integration” detail. 

particle_merging-and-splitting_…

 

particle_merging-and-splitting_…

 

particle_merging-and-splitting_…

 

particle_merging-and-splitting_…

If you’d like, next I’ll wire this into your specific file, keeping your rendering path intact and showing exactly where to insert detectMerges, the union-find, and the split solve.

Sources
You said:
Can this be integrated into the webgpu components of this script? This is where performance optimization is critical
ChatGPT said:
Thought for 15s

Yes—here’s a WebGPU-native way to do merge→integrate→split on-GPU, keeping your render path intact and avoiding CPU round-trips. The design uses standard GPU patterns (grid binning, label-propagation clustering, reductions) so it scales past the 
𝑂
(
𝑁
2
)
O(N
2
) force loop you already have.

I’ll give you:

the pipeline order,

the buffer layouts, and

compact WGSL kernels you can drop into your compute passes.

This assumes your current loop is: accumulateForces → integrate → render.

1) Compute pass order (per frame)

Build uniform grid (binning).
Hash each particle to a cell; produce cell offsets (prefix sum). This gives you near-linear collision candidates.

Find collision candidates + initial labels.
For each particle, scan its 27 neighbor cells; if overlap && approaching, emit a “bond” and set a label to min(i, j) (atomicMin). Initialize label[i]=i before this pass.

Label propagation (cluster union).
Iteratively relax labels so all particles in a chain of contacts share the same root label (parallel disjoint-set via pointer-jumping / atomicMin). 3–6 iterations usually suffice for sparse contacts.

Build meta sets (reductions by label).
For each particle, atomically accumulate into its root label’s meta accumulator:

𝑚
𝑆
m
S
	​

, 
𝑚
𝑆
𝑥
𝑆
m
S
	​

x
S
	​

, 
𝑚
𝑆
𝑣
𝑆
m
S
	​

v
S
	​

 (i.e., sum mass, masspos, massvel)

Optionally track pairwise bond energy 
Δ
𝐸
ΔE per (i,j) or approximate with a per-cluster scalar (see note below).

Integrate metas.
For every active label (one with nonzero mass), compute COM and integrate one step with your existing force kernels (you can either: A) integrate each original member using the COM acceleration; or B) integrate the COM once and reconstruct members; see “two fidelity modes” below).

Split.
For every particle with label ≠ its index (i.e., merged), construct post-split velocities along the stored collision normal 
𝑛
^
n
^
 (or COM-radial if you store one per pair) while conserving momentum and returning 
𝛼
 
Δ
𝐸
αΔE (α=1 for elastic). Then clear labels for the next frame.

Render.

This keeps all heavy work on GPU. The CPU only kicks off dispatches.

2) Buffers (SSBOs)
struct SimParams {
  dt: f32;
  gridMin: vec3<f32>;
  invCell: f32;      // 1/cellSize
  dims: vec3<u32>;   // grid dims
  alpha: f32;        // restitution [0..1]
  radiusBase: f32;   // base radius or density constant
  softening: f32;    // your gravity epsilon
};

struct Particle {
  pos: vec4<f32>;    // w unused or mass
  vel: vec4<f32>;
  mass: f32;
  radius: f32;
  label: atomic<u32>; // cluster label (root id)
  _pad: vec2<f32>;
};

struct GridEntry { idx: u32; }
struct GridHeads  { head: atomic<u32>; }    // optional linked-lists per cell
struct CellRange  { start: u32; count: u32; }

struct MetaAcc {
  mass: atomic<f32>;
  mx: atomic<f32>;
  my: atomic<f32>;
  mz: atomic<f32>;
  mvx: atomic<f32>;
  mvy: atomic<f32>;
  mvz: atomic<f32>;
  // Optional: approximate cumulative ΔE per label:
  dE: atomic<f32>;
};

struct Pair { a: u32; b: u32; nx: f32; ny: f32; nz: f32; dE: f32; }


You’ll keep particles[N], gridIndices[N], cellRanges[numCells], meta[numParticles] (sized to N since labels are ≤ N), and a pairs[maxPairs] ring buffer with an atomic counter if you want per-pair accurate 
Δ
𝐸
ΔE.

3) WGSL kernels (compact, drop-in)
A) Binning (uniform grid)
@group(0) @binding(0) var<storage, read> params: SimParams;
@group(0) @binding(1) var<storage, read> particles: array<Particle>;
@group(0) @binding(2) var<storage, read_write> cellRanges: array<CellRange>;
@group(0) @binding(3) var<storage, read_write> gridIndices: array<u32>;

@compute @workgroup_size(256)
fn clearCells(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x < params.dims.x * params.dims.y * params.dims.z) {
    cellRanges[gid.x].start = 0u;
    cellRanges[gid.x].count = 0u;
  }
}

@compute @workgroup_size(256)
fn countParticles(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&particles)) { return; }
  let p = particles[i].pos.xyz;
  let g = clamp(u32((p - params.gridMin) * params.invCell), vec3<u32>(0u),
                params.dims - vec3<u32>(1u));
  let cell = (g.z * params.dims.y + g.y) * params.dims.x + g.x;
  atomicAdd(&cellRanges[cell].count, 1u);
}

// Prefix-sum cellRanges.count on CPU or a small scan kernel,
// then:

@compute @workgroup_size(256)
fn writeIndices(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&particles)) { return; }
  let p = particles[i].pos.xyz;
  let g = clamp(u32((p - params.gridMin) * params.invCell), vec3<u32>(0u),
                params.dims - vec3<u32>(1u));
  let cell = (g.z * params.dims.y + g.y) * params.dims.x + g.x;
  let dst = atomicAdd(&cellRanges[cell].start, 1u); // start already set to prefix offsets
  gridIndices[dst] = i;
}


(If you prefer linked lists, use GridHeads + a next[N] array. Ranges are usually faster for scan-based builds.)

B) Collision candidates + initial labels (+ optional ΔE)
@group(0) @binding(0) var<storage, read> params: SimParams;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(2) var<storage, read> cellRanges: array<CellRange>;
@group(0) @binding(3) var<storage, read> gridIndices: array<u32>;
@group(0) @binding(4) var<storage, read_write> pairs: array<Pair>;
@group(0) @binding(5) var<storage, read_write> pairCount: atomic<u32>;

fn cellIndex(g: vec3<u32>) -> u32 {
  return (g.z * params.dims.y + g.y) * params.dims.x + g.x;
}

@compute @workgroup_size(128)
fn findPairs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&particles)) { return; }
  // init label to self once per frame (can be separate pass)
  atomicStore(&particles[i].label, i);

  // particle data
  let pi = particles[i].pos.xyz;
  let vi = particles[i].vel.xyz;
  let ri = particles[i].radius;

  // locate cell coords for i
  let gi = clamp(u32((pi - params.gridMin) * params.invCell), vec3<u32>(0u), params.dims - vec3<u32>(1u));

  // scan 27 neighbors
  for (dz = i32(-1); dz <= 1; dz++) {
    for (dy = -1; dy <= 1; dy++) {
      for (dx = -1; dx <= 1; dx++) {
        let ng = vec3<i32>(gi) + vec3<i32>(dx,dy,dz);
        if (any(ng < vec3<i32>(0)) || any(ng >= vec3<i32>(params.dims))) { continue; }
        let cell = cellIndex(vec3<u32>(ng));
        let start = cellRanges[cell].start;
        let count = cellRanges[cell].count;
        for (var k:u32=0u; k<count; k++) {
          let j = gridIndices[start + k];
          if (j <= i) { continue; }
          let pj = particles[j].pos.xyz;
          let vj = particles[j].vel.xyz;
          let rj = particles[j].radius;

          let n = pj - pi;
          let dist2 = dot(n,n);
          let R = ri + rj;
          if (dist2 >= R*R) { continue; }                 // overlap
          let relv = vj - vi;
          if (dot(n, relv) >= 0.0) { continue; }          // approaching

          // seed labels by atomicMin on both
          let root = min(i, j);
          _ = atomicMin(&particles[i].label, root);
          _ = atomicMin(&particles[j].label, root);

          // optional: store pair (for exact ΔE and normal)
          let dv = vi - vj;
          let mi = particles[i].mass;
          let mj = particles[j].mass;
          let m12 = mi + mj;
          let dE = (mi*mj/(2.0*m12)) * dot(dv,dv);
          let invN = inverseSqrt(max(dist2, 1e-12));
          let nhat = n * invN;

          let idx = atomicAdd(&pairCount, 1u);
          if (idx < arrayLength(&pairs)) {
            pairs[idx].a = i; pairs[idx].b = j;
            pairs[idx].nx = nhat.x; pairs[idx].ny = nhat.y; pairs[idx].nz = nhat.z;
            pairs[idx].dE = dE;
          }
        }
      }
    }
  }
}

C) Label propagation (parallel union-find via pointer-jumping)
@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;

@compute @workgroup_size(256)
fn relaxLabels(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&particles)) { return; }
  var l = atomicLoad(&particles[i].label);
  let parent = atomicLoad(&particles[l].label);
  if (parent < l) {
    _ = atomicMin(&particles[i].label, parent);
  }
}


Dispatch this kernel ~4–6 times (or until a small “changed” flag stops toggling if you add one).

D) Meta accumulation (reductions by label)
@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> metas: array<MetaAcc>;
@group(0) @binding(2) var<storage, read> pairs: array<Pair>;
@group(0) @binding(3) var<storage, read> pairCount: atomic<u32>;

@compute @workgroup_size(256)
fn clearMetas(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&metas)) { return; }
  atomicStore(&metas[i].mass, 0.0);
  atomicStore(&metas[i].mx, 0.0);  atomicStore(&metas[i].my, 0.0);  atomicStore(&metas[i].mz, 0.0);
  atomicStore(&metas[i].mvx, 0.0); atomicStore(&metas[i].mvy, 0.0); atomicStore(&metas[i].mvz, 0.0);
  atomicStore(&metas[i].dE, 0.0);
}

@compute @workgroup_size(256)
fn accumulateMetas(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&particles)) { return; }
  let root = atomicLoad(&particles[i].label);
  if (root == i) { return; } // singletons don’t need meta (optional)
  let m  = particles[i].mass;
  let p  = particles[i].pos.xyz;
  let v  = particles[i].vel.xyz;

  atomicAdd(&metas[root].mass, m);
  atomicAdd(&metas[root].mx, m*p.x);
  atomicAdd(&metas[root].my, m*p.y);
  atomicAdd(&metas[root].mz, m*p.z);
  atomicAdd(&metas[root].mvx, m*v.x);
  atomicAdd(&metas[root].mvy, m*v.y);
  atomicAdd(&metas[root].mvz, m*v.z);
}

// Optional: accumulate exact ΔE from pairs into their root label (rough: use min(a,b) as root guess)
@compute @workgroup_size(256)
fn accumulateBondEnergy(@builtin(global_invocation_id) gid: vec3<u32>) {
  let k = gid.x;
  let total = atomicLoad(&pairCount);
  if (k >= total) { return; }
  let a = pairs[k].a;
  let b = pairs[k].b;
  let root = min(atomicLoad(&particles[a].label), atomicLoad(&particles[b].label));
  atomicAdd(&metas[root].dE, pairs[k].dE);
}

E) Integrate (two fidelity modes)

Mode 1 (fast/approx): compute COM accel once, apply to every member of the cluster. Good enough for stability and cheap.

@group(0) @binding(0) var<storage, read> params: SimParams;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(2) var<storage, read> metas: array<MetaAcc>;

// You already have a force kernel; here’s the integration sketch:
@compute @workgroup_size(256)
fn integrateMembers(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&particles)) { return; }
  let root = atomicLoad(&particles[i].label);
  // If not merged, do your usual path (v += a*dt; x += v*dt).
  if (root == i) {
    // ... normal integrate ...
    return;
  }
  // Use COM accel for this cluster:
  let mS = atomicLoad(&metas[root].mass);
  if (mS <= 0.0) { return; }
  let comP = vec3<f32>( atomicLoad(&metas[root].mx),
                        atomicLoad(&metas[root].my),
                        atomicLoad(&metas[root].mz)) / mS;
  let comV = vec3<f32>( atomicLoad(&metas[root].mvx),
                        atomicLoad(&metas[root].mvy),
                        atomicLoad(&metas[root].mvz)) / mS;

  // Compute acceleration at COM (call your existing field/force routine; here we assume you have it)
  let aS = computeAccelerationAt(comP); // <- plug your force field
  // Apply to each member as proxy:
  var v = particles[i].vel.xyz + aS * params.dt;
  var x = particles[i].pos.xyz + v * params.dt;
  particles[i].vel = vec4<f32>(v, 0.0);
  particles[i].pos = vec4<f32>(x, 1.0);
}


Mode 2 (higher fidelity): keep each member’s offset 
±
(
𝑚
𝑗
/
𝑚
12
)
 
𝑛
±(m
j
	​

/m
12
	​

)n frozen during the step while integrating COM (requires that you cached a normal per pair or per member; for multi-member clusters, store initial offset from COM before integration and re-add it after updating COM).

F) Split (momentum + energy restitution)

For each merged particle, we solve along 
𝑛
^
n
^
 using the cluster’s stored 
Δ
𝐸
ΔE. If you stored per-pair normals (recommended), do it per pair. For a cluster, you can distribute 
Δ
𝐸
ΔE evenly across incident bonds (simple and stable).

@group(0) @binding(0) var<storage, read> params: SimParams;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(2) var<storage, read> metas: array<MetaAcc>;
@group(0) @binding(3) var<storage, read> pairs: array<Pair>;
@group(0) @binding(4) var<storage, read> pairCount: atomic<u32>;

@compute @workgroup_size(256)
fn splitPairs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let k = gid.x;
  let total = atomicLoad(&pairCount);
  if (k >= total) { return; }

  let a = pairs[k].a; let b = pairs[k].b;
  // Skip if labels differ (should be same root), or if this pair no longer overlaps
  let la = atomicLoad(&particles[a].label);
  let lb = atomicLoad(&particles[b].label);
  if (la != lb) { return; }

  let mi = particles[a].mass; let mj = particles[b].mass;
  let m12 = mi + mj;

  // velocities *after* integration:
  let v1 = particles[a].vel.xyz;
  let v2 = particles[b].vel.xyz;
  // COM vel:
  let v12p = (mi*v1 + mj*v2)/m12;

  // energy to reintroduce:
  let dE = pairs[k].dE * params.alpha; // simple even split across bonds
  if (dE <= 0.0) { return; }

  let nhat = normalize(vec3<f32>(pairs[k].nx, pairs[k].ny, pairs[k].nz));
  // Solve the 1D along-normal component (minimal solution that separates)
  // v1' = v12' - (mj/m12)*u*nhat ; v2' = v12' + (mi/m12)*u*nhat
  // energy in relative motion along n: (1/2) * (mi*mj/m12) * u^2  = dE
  let coeff = (2.0 * dE) / (mi*mj/m12);
  let u = sqrt(max(coeff, 0.0));

  // Ensure separation: (v2' - v1')·nhat >= 0  => choose +u
  let v1p = v12p - (mj/m12)*u*nhat;
  let v2p = v12p + (mi/m12)*u*nhat;

  particles[a].vel = vec4<f32>(v1p, 0.0);
  particles[b].vel = vec4<f32>(v2p, 0.0);
}


Finally, clear pairCount and reset label[i]=i at the frame start.

Integration points in your script

Create the new buffers (labels, grid, pairs, metas).

Insert dispatches in this order each frame:

clearCells → countParticles → prefixScan(cellCounts) → setCellStarts
→ writeIndices
→ clear pairCount
→ findPairs
→ (repeat 3–6x) relaxLabels
→ clearMetas → accumulateMetas → accumulateBondEnergy
→ (your force pass) → integrateMembers
→ splitPairs
→ render


If you’re already doing tiled 
𝑂
(
𝑁
2
)
O(N
2
) force, you can initially skip the grid and use the same tiles for candidate generation (cheap to add the two tests “overlap + approaching”). Then upgrade to grid when you want larger N.

Notes, trade-offs, and fast paths

Two fidelity modes: Start with the COM accel for members (simple, very stable). If you need the paper’s stricter “frozen relative offsets during the step,” add a per-member offsetFromCom at merge start and re-add after integration.

Energy bookkeeping: Exact 
Δ
𝐸
ΔE per pair is best (you have it in pairs[k].dE). For big clusters, distributing 
∑
Δ
𝐸
∑ΔE evenly across bonds works well and is stable.

Iterations: Label propagation converges quickly in practice; fixed small loop avoids CPU-GPU sync.

Performance: All kernels are linear in N (plus neighbor checks). The only 
𝑂
(
𝐾
)
O(K) cost is over candidate pairs, which the grid bounds nicely.

If you share how you currently sequence your compute pipelines in nbody3.html (bind group layout, dispatch sizes), I’ll align binding indices and give you exact JS setup (buffer sizes, writeBuffer strides, and dispatch counts) to paste in. This slot-in design will give you the stabilization benefits of merge/split without leaving the GPU, and it plays nicely with your existing softening and integrator.
