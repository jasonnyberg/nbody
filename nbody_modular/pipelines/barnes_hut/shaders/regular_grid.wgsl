struct Particles {
    data: array<vec4<f32>>,
};

struct GridCell {
    particle_count: atomic<u32>,
};

struct Grid {
    cells: array<GridCell>,
};

struct GridParams {
    resolution: u32,
    scene_min: vec3<f32>,
    scene_max: vec3<f32>,
    num_particles: u32,
};

@group(0) @binding(0) var<storage, read> particles: Particles;
@group(0) @binding(1) var<storage, read_write> grid: Grid;
@group(0) @binding(2) var<uniform> params: GridParams;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= params.num_particles) {
        return;
    }

    let p = particles.data[i].xyz;
    let normalized_p = (p - params.scene_min) / (params.scene_max - params.scene_min);
    let grid_coord = vec3<u32>(normalized_p * vec3<f32>(f32(params.resolution)));

    let cell_index = grid_coord.x + grid_coord.y * params.resolution + grid_coord.z * params.resolution * params.resolution;
    atomicAdd(&grid.cells[cell_index].particle_count, 1u);
}
