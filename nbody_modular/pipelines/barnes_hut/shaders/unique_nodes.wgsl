struct MortonCodes {
    data: array<vec2<u32>>,
};

struct NodeFlags {
    flags: array<atomic<u32>>,
};

struct Params {
    level: u32,
    num_particles: u32,
};

@group(0) @binding(0) var<storage, read> morton_codes: MortonCodes;
@group(0) @binding(1) var<storage, read_write> node_flags: NodeFlags;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= params.num_particles) {
        return;
    }

    let current_code = morton_codes.data[i].x;

    if (i == 0u) {
        atomicStore(&node_flags.flags[current_code], 1u);
        return;
    }

    let prev_code = morton_codes.data[i - 1u].x;

    if (current_code != prev_code) {
        atomicStore(&node_flags.flags[current_code], 1u);
    }
}