# Merge / Split Integration Plan for nbody3

This document tracks a staged replacement of the current fusion (pairwise merge) logic with a more general GPU merge→(optional cluster integration)→split pipeline inspired by particle collision stabilization / merging & splitting techniques.

## Phase 0 (Baseline / Safety)
- [x] Leave existing physics & fusion intact while scaffolding new resources (feature toggle disabled by default)
- [ ] Add feature toggle (Enable Merge/Split) in UI
- [ ] Add restitution slider (alpha 0..1)
- [ ] Allocate new buffers: labels, pairs, pairCount
- [ ] Implement Pair Detection pass (overlap + approaching) writing pairs & (optionally) seeding labels
- [ ] Gated dispatch (runs only if toggle ON)
- [ ] Debug counters in overlay: pairCount

## Phase 1 (Pair Based Elastic Response – No Clustering Yet)
- [ ] WGSL kernels:
  - pairDetectWGSL (already finds pairs, no velocity edits)
  - splitPairsWGSL (apply 1D elastic / inelastic collision impulse along normal for each stored pair; single-pass)
- [ ] Add atomic safety: if particle already processed once in split pass, skip further pairs (per-particle lock buffer)
- [ ] Integrate new passes order: integrate → (if enabled) detectPairs → splitPairs → render
- [ ] Validate momentum conservation (sum m*v pre/post) (optional CPU readback every N frames)

## Phase 2 (Label / Cluster Formation)
- [ ] Add labels buffer (u32) & initialize label[i] = i
- [ ] In pairDetect: atomicMin both labels with root = min(i,j)
- [ ] Add relaxLabelsWGSL (pointer jumping) loop (fixed 4–6 dispatches)
- [ ] Meta accumulation buffer (mass + m*pos + m*vel) (NOTE: WGSL float atomics not supported → use two-pass reduction or 64-bit emulation; initial version may skip cluster accel until redesign)
- [ ] Debug: count unique roots (active clusters)

## Phase 3 (Cluster COM Acceleration – Optional)
- [ ] Compute COM & aggregate velocity per root (two-pass reduction via workgroup shared memory + scatter)
- [ ] Integrate COM once per cluster OR compute common acceleration and apply to members
- [ ] Preserve relative offsets (optional: store pre-step offsetFromCom for improved fidelity)

## Phase 4 (Energy Budget / Controlled Restitution)
- [ ] Track per-pair kinetic energy along collision normal (ΔE)
- [ ] Aggregate cluster energy (sum ΔE) for later redistribution
- [ ] Split logic uses restitution alpha slider to re-inject fraction of ΔE
- [ ] Visual feedback: flash or color pulse based on energy release

## Phase 5 (Broad Phase Acceleration – Uniform Grid)
- [ ] Add grid params (min, cellSize, dims)
- [ ] Kernels: clearCells, countParticles, prefixScan (CPU or GPU), writeIndices
- [ ] Modify pairDetect to iterate only over neighbor cells (27) instead of full tile loops (enables scaling beyond current N)

## Phase 6 (Stability / Quality Enhancements)
- [ ] Symmetric repulsion: use average or max(rep_i, rep_j) so pair forces are momentum balanced
- [ ] Adaptive time step when pair density rises (limit velocity * dt / radius)
- [ ] Overflow handling: if pair buffer fills, set overflow flag & skip split (prevent OOB)
- [ ] Instrument total momentum & energy drift percentages

## Phase 7 (Cleanup & Decommission Old Fusion)
- [ ] Feature parity validation vs legacy fusion (mass conservation, qualitative behavior)
- [ ] Remove fusionWGSL, claims, fuseFlags (or repurpose fuseFlags as transient flash on split)
- [ ] Remove probability-based fusion slider OR reinterpret as merge probability throttle

## Data Structures (Initial Simplified Phase 1)
- labelsBuffer (u32 * N) – placeholder (unused until Phase 2)
- pairCountBuffer (u32 single) – atomic counter (reset each frame)
- pairBuffer (struct 32 bytes * MAX_PAIRS)
  struct Pair { a:u32; b:u32; nx:f32; ny:f32; nz:f32; pad:f32; }
  (Energy deferred to Phase 4; normals stored for split impulse)
- lockBuffer (u32 * N) – 0 = free, 1 = claimed during split (Phase 1 stability)

## WGSL Binding Additions (group 0)
(Reserve contiguous bindings beyond existing 0–8 for new passes.)
- detectPairs: positions, velocities, masses, simParams, pairCount, pairs
- splitPairs: velocities (read_write), masses, pairCount, pairs, restitution params, lockBuffer

## UI Additions
- Checkbox: Enable Merge/Split
- Slider: Restitution (alpha 0..1, default 0.5)
- Debug overlay lines: pairs=#### overflow=0/1

## Pass Order (Phase 1)
1. Physics integrate (existing computePipeline)
2. Fusion pass (legacy) [optional; keep until Phase 7]
3. If mergeSplitEnabled:
   a. Reset pairCount + lockBuffer
   b. DetectPairs
   c. SplitPairs (inelastic / elastic impulse)
4. Render

## Collision Criteria (Phase 1)
- Overlap: |p_j - p_i|^2 < (r_i + r_j)^2, with radius r = cbrt(mass) * radiusScale (clamp to min radius)
- Approaching: (p_j - p_i)·(v_j - v_i) < 0

## Impulse Resolution (1D along normal, coefficient e=alpha)
Given masses m1,m2, relative normal velocity v_rel_n = (v2 - v1)·n
If v_rel_n >= 0 → skip
Impulse scalar J = -(1+e) * v_rel_n / (1/m1 + 1/m2)
Apply: v1' = v1 - J * n / m1 ; v2' = v2 + J * n / m2

## Incremental Implementation Strategy
- Implement Phase 0/1 scaffolding (this PR)
- Validate no crashes & compile passes
- Measure drift & pair counts
- Proceed to clustering only if needed for many-body sticking artifacts

## Outstanding Questions
- Target maximum N for scaling path (inform grid decisions)
- Retain radiative damping interplay with collisions?
- Should existing repulsion be disabled when merge/split on (double counting)? (Probably reduce R when enabled.)

## Completion Criteria for Phase 1
- Toggle compiles & runs
- Pairs detected (pairCount > 0) in dense scenes
- Velocities modified (elastic response) without net momentum drift > 0.5% over 10k frames (test)

---
Update the checklist as phases progress.
