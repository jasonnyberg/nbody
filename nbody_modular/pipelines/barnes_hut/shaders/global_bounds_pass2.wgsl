struct BoundsBuffer {
    data: array<vec4<f32>>,
};

struct SimParamsUniform {
    num_items: u32,
};

@group(0) @binding(0) var<storage, read> partial_bounds: BoundsBuffer;
@group(0) @binding(1) var<storage, read_write> global_bounds: BoundsBuffer;
@group(0) @binding(2) var<uniform> params: SimParamsUniform;

var<workgroup> local_min: array<vec3<f32>, 256>;
var<workgroup> local_max: array<vec3<f32>, 256>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
    let i = gid.x;

    var my_min = vec3<f32>(1e30, 1e30, 1e30);
    var my_max = vec3<f32>(-1e30, -1e30, -1e30);

    if (i < params.num_items) {
        my_min = partial_bounds.data[i * 2].xyz;
        my_max = partial_bounds.data[i * 2 + 1].xyz;
    }

    local_min[lid.x] = my_min;
    local_max[lid.x] = my_max;
    workgroupBarrier();

    for (var s: u32 = 128; s > 0; s = s / 2) {
        if (lid.x < s) {
            local_min[lid.x] = min(local_min[lid.x], local_min[lid.x + s]);
            local_max[lid.x] = max(local_max[lid.x], local_max[lid.x + s]);
        }
        workgroupBarrier();
    }

    if (lid.x == 0) {
        global_bounds.data[0] = vec4<f32>(local_min[0], 0.0);
        global_bounds.data[1] = vec4<f32>(local_max[0], 0.0);
    }
}
