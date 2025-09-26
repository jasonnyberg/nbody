// Expands a 10-bit integer into 30 bits by inserting 2 zeros after each bit.
fn expandBits(v: u32) -> u32 {
    var x = v & 0x3ffu; // v is a 10-bit integer
    x = (x | (x << 10)) & 0x3f03fu;
    x = (x | (x << 5)) & 0x30c30c3u;
    x = (x | (x << 2)) & 0x9249249u;
    return x;
}

// Calculates a 30-bit Morton code for a 3D point.
fn mortonCode(p: vec3<f32>, scene_min: vec3<f32>, scene_max: vec3<f32>) -> u32 {
    let grid_max = 1023.0;
    let normalized_p = (p - scene_min) / (scene_max - scene_min);
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

struct BoundsBuffer {
    data: array<vec4<f32>>, // min, max
};

struct SimParamsUniform {
    particleCount: u32,
};

@group(0) @binding(0) var<storage, read> particles: Particles;
@group(0) @binding(1) var<storage, read_write> mortonCodes: MortonCodes;
@group(0) @binding(2) var<storage, read> globalBounds: BoundsBuffer;
@group(0) @binding(3) var<uniform> params: SimParamsUniform;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= params.particleCount) {
        return;
    }
    let p = particles.data[i].xyz;
    let scene_min = globalBounds.data[0].xyz;
    let scene_max = globalBounds.data[1].xyz;
    mortonCodes.data[i] = vec2<u32>(mortonCode(p, scene_min, scene_max), i);
}
