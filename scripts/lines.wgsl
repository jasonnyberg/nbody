// lines.wgsl
// Render detected pairs as line segments. Vertex shader reads pair indices
// from a storage buffer and particle positions from a storage buffer. It uses
// the same `mats` uniform (proj/view) layout as the main renderer.

struct Vec4Buf { data: array<vec4<f32>> }
struct UIntBuf { data: array<u32> }
struct Mats { m: array<vec4<f32>, 10> }
struct PairCount { value: atomic<u32>, }


@group(0) @binding(0) var<storage, read> posBuf: Vec4Buf;
@group(0) @binding(1) var<storage, read> pairBuf: array<vec4<u32>>;
@group(0) @binding(2) var<uniform> U: Mats;
@group(0) @binding(3) var<storage, read> pc: PairCount;
@group(0) @binding(4) var<storage, read> clComBuf: Vec4Buf;

fn loadMat(idx: u32) -> mat4x4<f32> {
  let b = idx * 4u;
  return mat4x4<f32>(U.m[b+0u], U.m[b+1u], U.m[b+2u], U.m[b+3u]);
}

@vertex
fn vs(@builtin(vertex_index) v_idx: u32, @builtin(instance_index) inst: u32) -> @builtin(position) vec4<f32> {
  // Read pair for this instance. We don't trust pairCount on some drivers,
  // Read pair for this instance. Use atomic pair count to cull instances
  // beyond the produced pair count, and treat pairs with equal indices as
  // also culled.
  let cnt = atomicLoad(&pc.value);
  if (inst >= cnt) {
    return vec4<f32>(2.0, 0.0, 0.0, 1.0);
  }
  let p = pairBuf[inst];
  if (p.x == p.y) { return vec4<f32>(2.0, 0.0, 0.0, 1.0); }
  var id: u32 = 0u;
  if (v_idx == 0u) { id = p.x; } else { id = p.y; }
  // If id refers to a cluster COM it will be encoded as (particleCount + c).
  // We can't rely on a CPU-side particleCount here so we'll assume cluster
  // COM indices are stored >= 0x80000000u as a flag, otherwise they're
  // particle indices. To keep things simple, we instead use a sentinel: if
  // id < 0x80000000u treat as particle index; if id has the high bit set,
  // the low bits store the cluster index.
  var pos = vec3<f32>(0.0);
  if ((id & 0x80000000u) == 0u) {
    let pos4 = posBuf.data[id];
    pos = pos4.xyz;
  } else {
    let cidx = id & 0x7FFFFFFFu;
    let pos4 = clComBuf.data[cidx];
    pos = pos4.xyz;
  }
  let world = vec4<f32>(pos, 1.0);
  let proj = loadMat(0u);
  let view = loadMat(1u);
  let mvp = proj * view;
  return mvp * world;
}

@fragment
fn fs() -> @location(0) vec4<f32> {
  return vec4<f32>(0.0, 1.0, 0.0, 0.85);
}
