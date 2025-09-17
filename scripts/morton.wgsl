// morton.wgsl
// Purpose: Computes Morton codes for spatial sorting of particles in 3D.
// Structure: One compute entry point. Maps positions to [0,1], encodes as 30-bit Morton code, writes keys and indices to output buffers.
struct Vec4Buf { data: array<vec4<f32>>, }
struct Keys { data: array<u32>, }
struct SimParams { dt: f32, G: f32, eps: f32, numParticlesF: f32 }
struct Morton { extent: f32, _pad0: f32, _pad1: f32, _pad2: f32 }
@group(0) @binding(0) var<storage, read> Ppos: Vec4Buf;
@group(0) @binding(1) var<storage, read_write> keys: Keys;
@group(0) @binding(2) var<storage, read_write> idx: Keys;
@group(0) @binding(3) var<uniform> P: SimParams;
@group(0) @binding(4) var<uniform> M: Morton;

fn part1by2(n: u32) -> u32 {
	var x = n & 0x000003ffu;        // 10 bits
	x = (x | (x << 16u)) & 0x030000FFu;
	x = (x | (x << 8u))  & 0x0300F00Fu;
	x = (x | (x << 4u))  & 0x030C30C3u;
	x = (x | (x << 2u))  & 0x09249249u;
	return x;
}

fn morton3D(x: u32, y: u32, z: u32) -> u32 {
	return (part1by2(z) << 2u) | (part1by2(y) << 1u) | part1by2(x);
}

@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
	let i = gid.x;
	let n = u32(P.numParticlesF);
	if (i >= n) { return; }
	let p = Ppos.data[i].xyz;
	let e = max(1e-6, M.extent);
	let qx = clamp((p.x / e) * 0.5 + 0.5, 0.0, 1.0);
	let qy = clamp((p.y / e) * 0.5 + 0.5, 0.0, 1.0);
	let qz = clamp((p.z / e) * 0.5 + 0.5, 0.0, 1.0);
	let X = u32(qx * 1023.0);
	let Y = u32(qy * 1023.0);
	let Z = u32(qz * 1023.0);
	keys.data[i] = morton3D(X,Y,Z);
	idx.data[i] = i;
}