// lines.wgsl
// Render detected pairs as line segments. Vertex shader reads pair indices
// from a storage buffer and particle positions from a storage buffer. It uses
// the same `mats` uniform (proj/view) layout as the main renderer.

struct Vec4Buf { data: array<vec4<f32>> }
struct UIntBuf { data: array<u32> }
struct Mats { m: array<vec4<f32>, 10> }

@group(0) @binding(0) var<storage, read> posBuf: Vec4Buf;
@group(0) @binding(1) var<storage, read> pairBuf: array<vec4<u32>>;
@group(0) @binding(2) var<uniform> U: Mats;

fn loadMat(idx: u32) -> mat4x4<f32> {
  let b = idx * 4u;
  return mat4x4<f32>(U.m[b+0u], U.m[b+1u], U.m[b+2u], U.m[b+3u]);
}

@vertex
fn vs(@builtin(vertex_index) v_idx: u32, @builtin(instance_index) inst: u32) -> @builtin(position) vec4<f32> {
  // Read pair for this instance. We don't trust pairCount on some drivers,
  // so cull instances whose indices are equal (likely uninitialized).
  let p = pairBuf[inst];
  if (p.x == p.y) {
    return vec4<f32>(2.0, 0.0, 0.0, 1.0);
  }
  var id: u32 = 0u;
  if (v_idx == 0u) { id = p.x; } else { id = p.y; }
  let pos4 = posBuf.data[id];
  let pos = pos4.xyz;
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
