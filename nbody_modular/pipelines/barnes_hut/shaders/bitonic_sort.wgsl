struct MortonCodes {
    data: array<vec2<u32>>,
};

struct SortParams {
    j: u32,
    k: u32,
};

@group(0) @binding(0) var<storage, read_write> morton_codes: MortonCodes;
@group(0) @binding(1) var<uniform> params: SortParams;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;

    let j = params.j;
    let k = params.k;

    let ixj = i ^ j;

    if (ixj > i) {
        if ((i & k) == 0) {
            // ascending
            if (morton_codes.data[i].x > morton_codes.data[ixj].x) {
                let temp = morton_codes.data[i];
                morton_codes.data[i] = morton_codes.data[ixj];
                morton_codes.data[ixj] = temp;
            }
        } else {
            // descending
            if (morton_codes.data[i].x < morton_codes.data[ixj].x) {
                let temp = morton_codes.data[i];
                morton_codes.data[i] = morton_codes.data[ixj];
                morton_codes.data[ixj] = temp;
            }
        }
    }
}
