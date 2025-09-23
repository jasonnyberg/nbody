struct VSOut { @builtin(position) pos: vec4f, @location(0) col: vec4f };
@group(0) @binding(0) var<storage, read> nodeBuf: array<vec4f>;
struct UBO { proj: mat4x4f, view: mat4x4f, vp: vec4f };
@group(0) @binding(1) var<uniform> ubo: UBO;

const EDGES : array<u32, 24> = array<u32,24>(
  0u,1u, 1u,3u, 3u,2u, 2u,0u,  // bottom
  4u,5u, 5u,7u, 7u,6u, 6u,4u,  // top
  0u,4u, 1u,5u, 2u,6u, 3u,7u   // verticals
);

fn cornerPos(c: u32, mn: vec3f, mx: vec3f) -> vec3f {
  let bx = f32((c & 1u));
  let by = f32(((c >> 1u) & 1u));
  let bz = f32(((c >> 2u) & 1u));
  return mn + vec3f(bx, by, bz) * (mx - mn);
}

@vertex fn vs(@builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32) -> VSOut {
  var o: VSOut;
  let edge = vid / 2u;
  if (u32(iid) >= ${bucketCount}u) {
    o.pos = vec4f(2.0,2.0,2.0,1.0);
    o.col = vec4f(0.0);
    return o;
  }
  let a = nodeBuf[2u*iid].xyz;
  let b = nodeBuf[2u*iid+1u].xyz;
  let ea = EDGES[edge*2u + 0u];
  let eb = EDGES[edge*2u + 1u];
  let endpoint = vid % 2u;
  let ci = select(ea, eb, endpoint == 1u);
  let P = cornerPos(ci, a, b);
  let vp4 = ubo.proj * ubo.view * vec4f(P, 1.0);
  o.pos = vp4;
  // color by depth approximation: use teal
  o.col = vec4f(0.0, 0.8, 1.0, 0.8);
  return o;
}

@fragment fn fs(inp: VSOut) -> @location(0) vec4f { return inp.col; }
