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

    let morton_code = morton_codes.data[i].x;
    let level_code = morton_code >> (3u * (10u - params.level));

    atomicStore(&node_flags.flags[level_code], 1u);
}