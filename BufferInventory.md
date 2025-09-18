# GPU Buffer Inventory

This document lists every GPU buffer allocated by `nbody5debug.html`, its intended usage, and where it is bound in WGSL shaders. It also includes a shader-indexed table showing which buffers each shader expects in group 0 bindings.

## Global notes
- All WGSL shaders use `@group(0)` bindings for the buffers listed below. The bind group layouts in `nbody5debug.html` explicitly match these group 0 bindings for pipelines that require more than the default storage buffer limit.
- Buffer sizes are shown as allocated in `nbody5debug.html` (in bytes or expressions). Usage flags are taken from the `device.createBuffer` calls.
- `MAX_PAIRS` is computed as `Math.min(particleCount * 8, 262144)` in the code; `pair` structs are 16 bytes (vec4<u32>) unless otherwise noted.

---

## Buffer inventory (alphabetical)

- `clComBuf` (Cluster Centers of Mass)
  - Allocated: `device.createBuffer({ size: maxClusters * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })`
  - Purpose: Store cluster center-of-mass positions as vec4<f32> per cluster (x,y,z,pad). Written by `clusterReduce` and read by `integrateBH` and `lines` (for visualizing cluster COM endpoints).
  - Shader bindings:
    - `clusterReduce.wgsl` @binding(5) OutCom (storage, read_write)
    - `integrateBH.wgsl` @binding(14) ClCom (storage, read)
    - `lines.wgsl` @binding(4) clComBuf (storage, read)

- `clMassBuf` (Cluster masses)
  - Allocated: `device.createBuffer({ size: maxClusters * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })`
  - Purpose: Cluster masses (float per cluster). Written by `clusterReduce` and read by `integrateBH`.
  - Shader bindings:
    - `clusterReduce.wgsl` @binding(4) OutMass (storage, read_write)
    - `integrateBH.wgsl` @binding(13) ClMass (storage, read)

- `claims` (per-particle claim flags)
  - Allocated: `device.createBuffer({ size: particleCount * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })`
  - Purpose: Used by the `split` pipeline to avoid multiple concurrent claims on a particle during splitting.
  - Shader bindings:
    - `split.wgsl` @binding(6) C: Claims (storage, read_write)

- `dampBuf` (Damping uniform)
  - Allocated: `device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })`
  - Purpose: Small uniform (vec4) carrying damping factor and padding.
  - Shader bindings:
    - `integrate.wgsl` / `integrateBH.wgsl` @binding(6) D: Damp (uniform)

- `outPairBuf` (Outgoing visualization pair buffer)
  - Allocated: `device.createBuffer({ size: MAX_PAIRS * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST })`
  - Purpose: Written by `integrateBH` as a compact list of emitted force visualization pairs (vec4<u32> per pair). Later copied or inspected by visualization stages.
  - Shader bindings:
    - `integrateBH.wgsl` @binding(15) outPairs (storage, read_write)
    - `lines.wgsl` usage: `lines` reads `visPairBuf` (a separate buffer) in @binding(1). Note: `outPairBuf` is the producer; the code copies it to `visPairBuf` when appropriate.

- `outPairCount` (Outgoing visualization pair atomic counter)
  - Allocated: `device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC })`
  - Purpose: Atomic uint counter written by `integrateBH` when emitting visualization pairs.
  - Shader bindings:
    - `integrateBH.wgsl` @binding(16) outPairCount (storage, read_write)
    - `lines.wgsl` @binding(3) pc: PairCount (storage, read)

- `pairBuf` (Collision pair buffer)
  - Allocated: `device.createBuffer({ size: MAX_PAIRS * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST })`
  - Purpose: Written by `detectMorton` (collision discovery) as vec4<u32> pairs (i, j, flags, pad). Consumed by `split` and optionally copied to `visPairBuf` for rendering.
  - Shader bindings:
    - `detectMorton.wgsl` @binding(5) pb: Pairs (storage, read_write)
    - `split.wgsl` @binding(3) pb: Pairs (storage, read)

- `pairBufReadback` (CPU readback buffer for debugging pairs)
  - Allocated: `device.createBuffer({ size: DUMP_PAIRS_N * 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })`
  - Purpose: Temporary CPU-mapped buffer used by the Dump Pairs button to inspect the first N pairs.
  - Shader bindings: none (COPY_DST only)

- `pairCount` (Collision pair atomic counter)
  - Allocated: `device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC })`
  - Purpose: Atomic uint counter written by `detectMorton` when discovering collision pairs. Read by `split` and optionally readback for debugging.
  - Shader bindings:
    - `detectMorton.wgsl` @binding(4) pc: PairCount (storage, read_write)
    - `split.wgsl` @binding(2) pc: PairCount (storage, read_write)

- `pairCountReadback` (CPU readback for pair count)
  - Allocated: `device.createBuffer({ size: 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })`
  - Purpose: Small CPU-mapped buffer used to inspect the pairCount for debugging.
  - Shader bindings: none (COPY_DST only)

- `matsBuf` (Matrices + viewport params)
  - Allocated: `device.createBuffer({ size: mats.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })` where `mats` is Float32Array of length 40 (10 vec4s) => 160 bytes
  - Purpose: Projection, view, viewport size, and some render params used by render and lines shaders.
  - Shader bindings:
    - `render.wgsl` @binding(2) U: Mats (uniform)
    - `lines.wgsl` @binding(2) U: Mats (uniform)

- `mortonIdx` (Sorted particle indices after Morton key sort)
  - Allocated: `device.createBuffer({ size: particleCount * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })`
  - Purpose: Sorted indices produced by Morton and bitonic sort; read by clusterReduce, integrateBH, detectMorton, etc.
  - Shader bindings (read-only in most shaders):
    - `morton.wgsl` @binding(2) idx (storage, read_write)
    - `clusterReduce.wgsl` @binding(2) idx: Keys (storage, read)
    - `detectMorton.wgsl` @binding(7) idx: Keys (storage, read)
    - `integrateBH.wgsl` @binding(11) idx: Keys (storage, read)

- `mortonKeys` (Morton keys per particle)
  - Allocated: `device.createBuffer({ size: particleCount * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })`
  - Purpose: Temporary Morton key values computed from positions; used by bitonic sort.
  - Shader bindings:
    - `morton.wgsl` @binding(0) Ppos (storage, read) **(Note: some shaders use Ppos; mortonKeys is bound to binding(1) in morton pipeline)**
    - `morton.wgsl` @binding(1) keys (storage, read_write)

- `mats` (see `matsBuf`) - referenced above

- `mortonParamsBuf` (Morton extent uniform)
  - Allocated: `device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })`
  - Purpose: Morton grid extent (float) and padding.
  - Shader bindings:
    - `morton.wgsl` @binding(4) M: Morton (uniform)

- `outPairBuf` (see above) - listed earlier

- `pairBuf` (see above) - listed earlier

- `posA`, `posB` (double-buffered particle positions)
  - Allocated:
    - `posA` := `bufFrom(posInit, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC)` (mapped initial data)
    - `posB` := `makeBuf(stateBytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC)`
  - Purpose: Particle positions (vec4<f32>) double-buffered for integration.
  - Shader bindings:
    - `integrate.wgsl` / `integrateBH.wgsl` @binding(0) posIn (storage, read)
    - `integrate.wgsl` / `integrateBH.wgsl` @binding(2) posOut (storage, read_write)
    - `render.wgsl` @binding(0) Ppos (storage, read)
    - `lines.wgsl` @binding(0) posBuf (storage, read)
    - `morton.wgsl` @binding(0) Ppos (storage, read)
    - `detectMorton.wgsl` @binding(0) Ppos (storage, read)

- `posReadback` (CPU readback for single particle)
  - Allocated: `device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })`
  - Purpose: Debug helper to read the first particle's position on demand.
  - Shader bindings: none (COPY_DST only)

- `repulseBuf` (Repulsion uniform R)
  - Allocated: `device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })`
  - Purpose: Short-range repulsion parameter used in the integrator.
  - Shader bindings:
    - `integrateBH.wgsl` @binding(7) Rp: Repulse (uniform)

- `restBuf` (Restitution / collision restitution uniform)
  - Allocated: `device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })`
  - Purpose: Restitution parameter (alpha) for collision responses consumed by `split`.
  - Shader bindings:
    - `split.wgsl` @binding(4) R: Rest (uniform)

- `sortParamsBuf` (bitonic sort parameters)
  - Allocated: `device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })`
  - Purpose: j,k,n parameters for each bitonic stage iteration.
  - Shader bindings:
    - `bitonic.wgsl` @binding(2) SP: Params (uniform)

- `spinBuf` (Spin uniform)
  - Allocated: `device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })`
  - Purpose: Tangential velocity injection rate used by the integrator.
  - Shader bindings:
    - `integrateBH.wgsl` @binding(9) Sp: Spin (uniform)

- `velA`, `velB` (double-buffered particle velocities)
  - Allocated:
    - `velA` := `bufFrom(velInit, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST)`
    - `velB` := `makeBuf(stateBytes, GPUBufferUsage.STORAGE)`
  - Purpose: Particle velocities (vec4<f32>) double-buffered for integration.
  - Shader bindings:
    - `integrateBH.wgsl` @binding(1) velIn (storage, read)
    - `integrateBH.wgsl` @binding(3) velOut (storage, read_write)
    - `detectMorton.wgsl` @binding(1) Pvel (storage, read)
    - `split.wgsl` @binding(0) V: Vec4Buf (storage, read_write)

- `visPairBuf` (Visualization pair buffer)
  - Allocated: `device.createBuffer({ size: MAX_PAIRS * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })`
  - Purpose: Dedicated visualization-only pair buffer that the lines pipeline reads; populated by copying from `pairBuf` or `outPairBuf` as needed.
  - Shader bindings:
    - `lines.wgsl` @binding(1) pairBuf: array<vec4<u32>> (storage, read)

- `locks` (per-particle lock flags)
  - Allocated: `device.createBuffer({ size: particleCount * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })`
  - Purpose: Locks used by `split` to mediate concurrent modifications when performing particle splits.
  - Shader bindings:
    - `split.wgsl` @binding(5) L: Locks (storage, read_write)

- `matsBuf` repeated (see above)

---

## Shader-indexed tables

Below are tables indexed by shader filename. Each table lists the group-0 bindings (binding number → buffer name and usage in the shader) as seen in the WGSL files under `scripts/*.wgsl`.

### scripts/integrateBH.wgsl (compute)
- @binding(0) posIn : Vec4Buf (storage, read) → `posA` or `posB` depending on phase
- @binding(1) velIn : Vec4Buf (storage, read) → `velA` or `velB`
- @binding(2) posOut: Vec4Buf (storage, read_write) → `posB` or `posA`
- @binding(3) velOut: Vec4Buf (storage, read_write) → `velB` or `velA`
- @binding(4) P: SimParams (uniform) → `simParamsBuf`
- @binding(5) M: FloatBuf (storage, read) → `masses`
- @binding(6) D: Damp (uniform) → `dampBuf`
- @binding(7) Rp: Repulse (uniform) → `repulseBuf`
- @binding(8) Rd: Rad (uniform) → `radBuf`
- @binding(9) Sp: Spin (uniform) → `spinBuf`
- @binding(10) B: BH (uniform) → `bhBuf`
- @binding(11) idx: Keys (storage, read) → `mortonIdx`
- @binding(12) C: Cl (uniform) → `clBuf`
- @binding(13) CM: ClMass (storage, read) → `clMassBuf`
- @binding(14) CC: ClCom (storage, read) → `clComBuf`
- @binding(15) outPairs: Pairs (storage, read_write) → `outPairBuf`
- @binding(16) outPairCount: PairCount (storage, read_write atomic) → `outPairCount`

### scripts/lines.wgsl (render)
- @binding(0) posBuf : Vec4Buf (storage, read) → `posA` or `posB`
- @binding(1) pairBuf: array<vec4<u32>> (storage, read) → `visPairBuf`
- @binding(2) U: Mats (uniform) → `matsBuf`
- @binding(3) pc: PairCount (storage, read) → `outPairCount`
- @binding(4) clComBuf: Vec4Buf (storage, read) → `clComBuf`

### scripts/clusterReduce.wgsl (compute)
- @binding(0) Ppos: Vec4Buf (storage, read) → `posA` or `posB`
- @binding(1) M: FloatBuf (storage, read) → `masses`
- @binding(2) idx: Keys (storage, read) → `mortonIdx`
- @binding(3) C: Cl (uniform) → `clBuf`
- @binding(4) CM: OutMass (storage, read_write) → `clMassBuf`
- @binding(5) CC: OutCom (storage, read_write) → `clComBuf`
- @binding(6) S: SimParams (uniform) → `simParamsBuf`

### scripts/bitonic.wgsl (compute)
- @binding(0) keys: Keys (storage, read_write) → `mortonKeys`
- @binding(1) idx: Keys (storage, read_write) → `mortonIdx`
- @binding(2) SP: Params (uniform) → `sortParamsBuf`

### scripts/render.wgsl (render)
- @binding(0) Ppos: Vec4Buf (storage, read) → `posA` or `posB`
- @binding(1) M: FloatBuf (storage, read) → `masses`
- @binding(2) U: Mats (uniform) → `matsBuf`

### scripts/split.wgsl (compute)
- @binding(0) V: Vec4Buf (storage, read_write) → `velA` or `velB`
- @binding(1) M: FloatBuf (storage, read) → `masses`
- @binding(2) pc: PairCount (storage, read_write) → `pairCount`
- @binding(3) pb: Pairs (storage, read) → `pairBuf`
- @binding(4) R: Rest (uniform) → `restBuf`
- @binding(5) L: Locks (storage, read_write) → `locks`
- @binding(6) C: Claims (storage, read_write) → `claims`

### scripts/detectPairs.wgsl (not used in this build)
- Legacy; skip listing.

### scripts/detectMorton.wgsl (compute)
- @binding(0) Ppos: Vec4Buf (storage, read) → `posA` or `posB`
- @binding(1) Pvel: Vec4Buf (storage, read) → `velA` or `velB`
- @binding(2) M: FloatBuf (storage, read) → `masses`
- @binding(3) S: SimParams (uniform) → `simParamsBuf`
- @binding(4) pc: PairCount (storage, read_write) → `pairCount`
- @binding(5) pb: Pairs (storage, read_write) → `pairBuf`
- @binding(6) C: Coll (uniform) → `radiusBuf`
- @binding(7) idx: Keys (storage, read) → `mortonIdx`
- @binding(8) W: Window (uniform) → `windowBuf`

### scripts/morton.wgsl (compute)
- @binding(0) Ppos: Vec4Buf (storage, read) → `posA` or `posB`
- @binding(1) keys: Keys (storage, read_write) → `mortonKeys`
- @binding(2) idx: Keys (storage, read_write) → `mortonIdx`
- @binding(3) P: SimParams (uniform) → `simParamsBuf`
- @binding(4) M: Morton (uniform) → `mortonParamsBuf`

---

## Notes and mapping caveats
- `posA/posB` and `velA/velB` are double-buffered; the producer/consumer roles swap each integration step. When seeing a WGSL binding named `posIn/posOut` or `velIn/velOut`, the HTML code chooses `posA`/`posB` or vice-versa depending on which buffer is the current source.
- The `lines` pipeline reads `outPairCount` (@binding(3)) to determine how many pairs were emitted by `integrateBH`. However, the render pass in `nbody5debug.html` draws `MAX_PAIRS` instances unconditionally; the shader uses the atomic pair count to avoid rendering garbage (the WGSL code bounds an index against the atomic value).
- There are several small CPU readback buffers used only for developer debugging (`pairBufReadback`, `pairCountReadback`, `posReadback`). These are COPY_DST / MAP_READ only and are not bound to shaders.
- The explicit `integrateBH` and `lines` bind group layouts in `nbody5debug.html` were added to match the more-than-default storage buffer usage in the `integrateBH` shader. Other pipelines use `layout: 'auto'` and rely on the implementation to infer layouts that match the WGSL `@binding` declarations.

---

## Quick checklist for future changes
- When adding new storage buffers consumed by `integrateBH`, remember to update `integrateBHBindGroupLayout` entries and the two A->B / B->A bind groups.
- If you add more than 8 storage buffers to a single shader stage, ensure the adapter/device supports higher `maxStorageBuffersPerShaderStage` or request it at `requestDevice` time.

---

Generated from repository state on 2025-09-18.
