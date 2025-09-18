// detectMorton.wgsl
// Purpose: Detects close particle pairs for collision using Morton-sorted indices and a fixed neighbor window.
// Structure: One compute entry point. Scans sorted window, checks pairwise distances, encodes collision normal, writes pairs to output buffer.
struct Vec4Buf { data: array<vec4<f32>>, }
struct FloatBuf { data: array<f32>, }
struct PairCount { value: atomic<u32>, }
struct Pairs { data: array<vec4<u32>>, }
struct Keys { data: array<u32>, }
struct SimParams { dt: f32, G: f32, eps: f32, numParticlesF: f32 }
struct Coll { rf: f32, approach: f32, _pad1: f32, _pad2: f32 }
struct Window { w: u32, _p1: u32, _p2: u32, _p3: u32 }

@group(0) @binding(0) var<storage, read> Ppos: Vec4Buf;
// Verlet: prevPos buffer replaces explicit velocities
@group(0) @binding(1) var<storage, read> prevPos: Vec4Buf;
@group(0) @binding(2) var<storage, read> M: FloatBuf;
@group(0) @binding(3) var<uniform> S: SimParams;
@group(0) @binding(4) var<storage, read_write> pc: PairCount; // read_write for atomicAdd
@group(0) @binding(5) var<storage, read_write> pb: Pairs;
@group(0) @binding(6) var<uniform> C: Coll;
@group(0) @binding(7) var<storage, read> idx: Keys; // sorted indices
@group(0) @binding(8) var<uniform> W: Window;       // neighbor window

fn encodeNormal(n: vec3<f32>) -> vec2<u32> {
	let nx = clamp(n.x * 32767.0, -32767.0, 32767.0);
	let ny = clamp(n.y * 32767.0, -32767.0, 32767.0);
	let p0 = (u32(i32(nx) & 0xFFFF) | (u32(i32(ny) & 0xFFFF) << 16));
	let p1 = select(0u, 1u, n.z < 0.0);
	return vec2<u32>(p0, p1);
}

@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
	let k = gid.x;
	let n = u32(S.numParticlesF);
	if (k >= n) { return; }
	let i = idx.data[k]; // actual particle index
	let mi = M.data[i];
	if (mi <= 0.0) { return; }
	let pi = Ppos.data[i].xyz;
	// compute velocity from current and previous positions
	let vi = (Ppos.data[i].xyz - prevPos.data[i].xyz) / S.dt;
	let w = W.w;

	// Scan a window in sorted order around k
	var start: u32 = 0u;
	if (k > w) { start = k - w; }
	let end = min(n - 1u, k + w);
	for (var t: u32 = start; t <= end; t = t + 1u) {
		if (t == k) { continue; }
		let j = idx.data[t];
		if (j <= i) { continue; } // de-dup
		let mj = M.data[j];
		if (mj <= 0.0) { continue; }
		let dp = Ppos.data[j].xyz - pi;
		let d2 = dot(dp, dp);
		let rf = max(C.rf, 0.0);
		let ri = rf * max(1.0, pow(mi, 0.3333));
		let rj = rf * max(1.0, pow(mj, 0.3333));
		let R = ri + rj;
		if (d2 < R*R) {
		let vj = (Ppos.data[j].xyz - prevPos.data[j].xyz) / S.dt;
		let relv = vj - vi;
			// approach flag: if C.approach >= 0.5 we only record approaching pairs,
			// otherwise record any proximal pair (useful for visualization/debug).
			let approachOK = (C.approach < 0.5) || (dot(dp, relv) < 0.0);
			if (approachOK) {
				let invL = inverseSqrt(max(d2, 1e-12));
				let nhat = dp * invL;
				let packed = encodeNormal(nhat);
				let idxPair = atomicAdd(&pc.value, 1u);
				if (idxPair < 262144u) {
					pb.data[idxPair] = vec4<u32>(i, j, packed.x, packed.y);
				}
			}
		}
	}
}