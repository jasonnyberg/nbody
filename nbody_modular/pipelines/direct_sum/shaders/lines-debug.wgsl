struct VSOut { @builtin(position) pos: vec4f, @location(0) col: vec4f };
struct Vec4Buf { data: array<vec4f>, };
struct Mats { m: array<vec4f, 10>, };
struct PairCount { count: u32, }

@group(0) @binding(0) var<storage, read> posBuf: Vec4Buf;
@group(0) @binding(1) var<storage, read> pairBuf: array<vec4u>;
@group(0) @binding(2) var<uniform> U: Mats;
@group(0) @binding(3) var<storage, read> pc: PairCount;

fn loadMat(idx: u32) -> mat4x4<f32> {
  let b = idx * 4u;
  return mat4x4<f32>(U.m[b+0u], U.m[b+1u], U.m[b+2u], U.m[b+3u]);
}

@vertex
fn vs(@builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32) -> VSOut {
  var o: VSOut;
  if (iid >= pc.count) {
    o.pos = vec4f(2.0, 2.0, 2.0, 1.0); // off-screen
    o.col = vec4f(0.0);
    return o;
  }

  let pair = pairBuf[iid];
  let p_idx = select(pair.x, pair.y, (vid % 2u) == 1u);
  let P = posBuf.data[p_idx].xyz;

  let proj = loadMat(0u);
  let view = loadMat(1u);
  o.pos = proj * view * vec4f(P, 1.0);
  o.col = vec4f(1.0, 1.0, 0.0, 1.0); // Dim gray for pairs
  return o;
}

@fragment
fn fs(inp: VSOut) -> @location(0) vec4f {
  return inp.col;
}
