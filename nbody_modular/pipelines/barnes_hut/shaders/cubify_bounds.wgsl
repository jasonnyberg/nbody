struct GlobalBounds {
    min: vec4<f32>,
    max: vec4<f32>,
};

@group(0) @binding(0) var<storage, read_write> global_bounds: GlobalBounds;

@compute @workgroup_size(1)
fn main() {
    let scene_min = global_bounds.min.xyz;
    let scene_max = global_bounds.max.xyz;

    let scene_size = scene_max - scene_min;
    let max_dim = max(scene_size.x, max(scene_size.y, scene_size.z));

    let center = (scene_min + scene_max) / 2.0;
    let new_half_size = vec3<f32>(max_dim / 2.0);

    global_bounds.min = vec4<f32>(center - new_half_size, 0.0);
    global_bounds.max = vec4<f32>(center + new_half_size, 0.0);
}
