struct VSOut { @builtin(position) pos: vec4f, @location(0) col: vec4f };

struct MortonCodes {
    data: array<vec2<u32>>,
};

struct UBO {
    proj: mat4x4f,
    view: mat4x4f,
    vp: vec4f,
};

struct Params {
    level: u32,
    _p0: u32, _p1: u32, _p2: u32, // padding
    scene_min: vec3<f32>,
    _p3: u32, // padding
    scene_max: vec3<f32>,
};

@group(0) @binding(0) var<storage, read> morton_codes: MortonCodes;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<uniform> ubo: UBO;

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

fn deinterleave(x: u32) -> u32 {
    var v = x & 0x9249249u;
    v = (v | (v >> 2)) & 0x30c30c3u;
    v = (v | (v >> 5)) & 0x03f03f03u;
    v = (v | (v >> 10)) & 0x3ffu;
    return v;
}

fn decodeMorton(code: u32) -> vec3<u32> {
    return vec3<u32>(
        deinterleave(code),
        deinterleave(code >> 1u),
        deinterleave(code >> 2u)
    );
}

@vertex fn vs(@builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32) -> VSOut {
    var o: VSOut;

    let morton_code = morton_codes.data[iid].x;
    let level_code = morton_code >> (3u * (10u - params.level));

    let grid_coord = decodeMorton(level_code);
    let res = 1u << params.level;

    let scene_size = params.scene_max - params.scene_min;
    let cell_size = scene_size / f32(res);

    let mn = params.scene_min + vec3<f32>(grid_coord) * cell_size;
    let mx = mn + cell_size;

    let edge = vid / 2u;
    let ea = EDGES[edge*2u + 0u];
    let eb = EDGES[edge*2u + 1u];
    let endpoint = vid % 2u;
    let ci = select(ea, eb, endpoint == 1u);
    let P = cornerPos(ci, mn, mx);

    o.pos = ubo.proj * ubo.view * vec4f(P, 1.0);
    o.col = vec4f(0.0, 0.8, 1.0, 0.25);
    return o;
}

@fragment fn fs(inp: VSOut) -> @location(0) vec4f { return inp.col; }