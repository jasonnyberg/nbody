struct SimParams { dt: f32, G: f32, eps: f32, numParticlesF: f32 }
struct Vec4Buf { data: array<vec4<f32>>, }
struct FloatBuf { data: array<f32>, }
struct PairCount { value: atomic<u32>, }
struct Pairs { data: array<vec4<u32>>, }
struct Coll { rf: f32, _pad0: f32, _pad1: f32, _pad2: f32 }
@group(0) @binding(0) var<storage, read> Ppos: Vec4Buf;
@group(0) @binding(1) var<storage, read> Pvel: Vec4Buf;
@group(0) @binding(2) var<storage, read> M: FloatBuf;
@group(0) @binding(3) var<uniform> S: SimParams;
@group(0) @binding(4) var<storage, read_write> pc: PairCount;
@group(0) @binding(5) var<storage, read_write> pb: Pairs;
@group(0) @binding(6) var<uniform> C: Coll; // collision radius factor

const WG: u32 = 128u;
var<workgroup> tPos: array<vec4<f32>, WG>;
var<workgroup> tVel: array<vec4<f32>, WG>;
var<workgroup> tMass: array<f32, WG>;

fn encodeNormal(n: vec3<f32>) -> vec2<u32> {
	let nx = clamp(n.x * 32767.0, -32767.0, 32767.0);
	let ny = clamp(n.y * 32767.0, -32767.0, 32767.0);
	let p0 = (u32(i32(nx) & 0xFFFF) | (u32(i32(ny) & 0xFFFF) << 16));
	let p1 = select(0u, 1u, n.z < 0.0);
	return vec2<u32>(p0, p1);
}

@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
	let i = gid.x;
	let n = u32(S.numParticlesF);
	let isActive = i < n;
	var mi: f32 = 0.0;
	if (isActive) { mi = M.data[i]; }
	let alive = isActive && (mi > 0.0);
	var pi = vec3<f32>(0.0);
	var vi = vec3<f32>(0.0);
	if (alive) { pi = Ppos.data[i].xyz; vi = Pvel.data[i].xyz; }

	var base: u32 = 0u;
	loop {
		if (base >= n) { break; }
		let jg = base + lid.x;
		if (jg < n) {
			tPos[lid.x] = Ppos.data[jg];
			tVel[lid.x] = Pvel.data[jg];
			tMass[lid.x] = M.data[jg];
		} else {
			tPos[lid.x] = vec4<f32>(0.0);
			tVel[lid.x] = vec4<f32>(0.0);
			tMass[lid.x] = 0.0;
		}
		workgroupBarrier();

		let remain = n - base;
		var count: u32 = WG;
		if (remain < WG) { count = remain; }
		if (alive) {
			var k: u32 = 0u;
			loop {
				if (k >= count) { break; }
				let j = base + k;
				if (j > i) {
					let mj = tMass[k];
					if (mj > 0.0) {
						let dp = tPos[k].xyz - pi;
						let d2 = dot(dp, dp);
						let rf = max(C.rf, 0.0);
						let ri = rf * max(1.0, pow(mi, 0.3333));
						let rj = rf * max(1.0, pow(mj, 0.3333));
						let R = ri + rj;
						if (d2 < R*R) {
							let relv = tVel[k].xyz - vi;
							if (dot(dp, relv) < 0.0) {
								let len2 = max(d2, 1e-12);
								let invL = inverseSqrt(len2);
								let nhat = dp * invL;
								let packed = encodeNormal(nhat);
								let idx = atomicAdd(&pc.value, 1u);
								if (idx < 262144u) {
									pb.data[idx] = vec4<u32>(i, j, packed.x, packed.y);
								}
							}
						}
					}
				}
				k = k + 1u;
			}
		}

		workgroupBarrier();
		base = base + WG;
	}
}