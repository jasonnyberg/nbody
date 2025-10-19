// Expands a 10-bit integer into 30 bits by inserting 2 zeros after each bit.
fn expandBits(v: u32) -> u32 {
    var x = v;
    x = (x * 0x00010001) & 0xFF0000FF;
    x = (x * 0x00000101) & 0x0F00F00F;
    x = (x * 0x00000011) & 0xC30C30C3;
    x = (x * 0x00000005) & 0x49249249;
    return x;
}

// Calculates a 30-bit Morton code for a 3D point.
fn mortonCode(p: vec3<f32>, scene_min: vec3<f32>, scene_max: vec3<f32>, level: u32) -> u32 {
    let res = 1u << level;
    let grid_max = f32(res - 1u);

    // scene_min and scene_max already define the cubical box
    let scene_size = scene_max - scene_min;
    let max_dim = scene_size.x; // All components of scene_size should be the same

    let normalized_p = (p - scene_min) / max_dim;

    let x = u32(normalized_p.x * grid_max);
    let y = u32(normalized_p.y * grid_max);
    let z = u32(normalized_p.z * grid_max);
    let xx = expandBits(x);
    let yy = expandBits(y);
    let zz = expandBits(z);
    return xx | (yy << 1) | (zz << 2);
}

struct Particles {
    data: array<vec4<f32>>,
};

// This buffer will store pairs of (morton_code, particle_index)
struct MortonCodes {
    data: array<vec2<u32>>,
};

struct Params {
    level: u32,
    _p0: u32, _p1: u32, _p2: u32, // padding
    scene_min: vec3<f32>,
    _p3: u32, // padding
    scene_max: vec3<f32>,
};

struct SimParamsUniform {
    particleCount: u32,
};

@group(0) @binding(0) var<storage, read> particles: Particles;
@group(0) @binding(1) var<storage, read_write> mortonCodes: MortonCodes;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<uniform> simParams: SimParamsUniform;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= simParams.particleCount) {
        return;
    }
    let p = particles.data[i].xyz;
    mortonCodes.data[i] = vec2<u32>(mortonCode(p, params.scene_min, params.scene_max, params.level), i);
}
