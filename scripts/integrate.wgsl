// integrate.wgsl
// Purpose: Integrates particle positions and velocities using direct N-body gravity, repulsion, radiative damping, and optional spin.
// Structure: One compute entry point. Uses workgroup-shared memory for efficient force calculation. Applies forces, updates velocities and positions, and writes results to output buffers.
struct SimParams { dt: f32, G: f32, eps: f32, numParticlesF: f32 }
struct Vec4Buf { data: array<vec4<f32>>, }
struct FloatBuf { data: array<f32>, }
struct Damp { factor: f32, _pad0: f32, _pad1: f32, _pad2: f32 }
struct Repulse { k: f32, _r0: f32, _r1: f32, _r2: f32 }
struct Rad { c: f32, _r0: f32, _r1: f32, _r2: f32 }
struct Spin { w: f32, _s0: f32, _s1: f32, _s2: f32 } // new spin uniform
@group(0) @binding(0) var<storage, read> posIn: Vec4Buf;
@group(0) @binding(1) var<storage, read> velIn: Vec4Buf;
@group(0) @binding(2) var<storage, read_write> posOut: Vec4Buf;
@group(0) @binding(3) var<storage, read_write> velOut: Vec4Buf;
@group(0) @binding(4) var<uniform> P: SimParams;
@group(0) @binding(5) var<storage, read> M: FloatBuf;
@group(0) @binding(6) var<uniform> D: Damp;
@group(0) @binding(7) var<uniform> Rp: Repulse;
@group(0) @binding(8) var<uniform> Rd: Rad;
@group(0) @binding(9) var<uniform> Sp: Spin; // spin now applied inside integrate

struct PairCount { value: atomic<u32>, }
@group(0) @binding(10) var<storage, read_write> visPairCount: PairCount;
@group(0) @binding(11) var<storage, read_write> visPairs: array<vec4<u32>>;

const WG: u32 = 128u;
var<workgroup> tPos: array<vec4<f32>, WG>;
var<workgroup> tVel: array<vec4<f32>, WG>;
var<workgroup> tMass: array<f32, WG>;

@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
	let i = gid.x;
	let n = u32(P.numParticlesF);
	let isActive = i < n;
	let eps2 = P.eps * P.eps;
	var p = vec3<f32>(0.0);
	var v = vec3<f32>(0.0);
	var mi: f32 = 0.0;
	if (isActive) {
		p = posIn.data[i].xyz;
		v = velIn.data[i].xyz;
		mi = M.data[i];
	}
	var a = vec3<f32>(0.0);
	var radiate_mag: f32 = 0.0;
	var base: u32 = 0u;
	loop {
		if (base >= n) { break; }
		let j = base + lid.x;
		if (j < n) {
			tPos[lid.x] = posIn.data[j];
			tVel[lid.x] = velIn.data[j];
			tMass[lid.x] = M.data[j];
		} else {
			tPos[lid.x] = vec4<f32>(0.0);
			tVel[lid.x] = vec4<f32>(0.0);
			tMass[lid.x] = 0.0;
		}
		workgroupBarrier();
		let remain = n - base;
		var count: u32 = WG;
		if (remain < WG) { count = remain; }
		if (isActive && mi > 0.0) {
			var k: u32 = 0u;
			loop {
				if (k >= count) { break; }
				let m = tMass[k];
				if (m > 0.0) {
					let d = tPos[k].xyz - p;
					let r2 = dot(d,d) + eps2;
					let invR = inverseSqrt(r2);
					let invR2 = invR * invR;
					let invR4 = invR2 * invR2;
					let dir = d * invR;
					let aG = (P.G * m) * invR2;
					let aR = (Rp.k * m) * invR4;
					var aRad: f32 = 0.0;
					if (aR >= aG) {
						let vj = tVel[k].xyz;
						let closingSpeed = dot(d, v - vj);
						aRad = Rd.c * closingSpeed * invR;
						radiate_mag = radiate_mag + abs(aRad);
					}
					let aMag = aG - aR - aRad;
					a = a + dir * aMag;

					// Emit a debug vector for this force calculation (write to visPairs)
					let jidx = base + k;
					if (jidx != i) {
						let vidx = atomicAdd(&visPairCount.value, 1u);
						if (vidx < 262144u) {
							visPairs[vidx] = vec4<u32>(i, jidx, 0u, 0u);
						}
					}
				}
				k = k + 1u;
			}
		}
		workgroupBarrier();
		base = base + WG;
	}
	if (isActive) {
		v = v + a * P.dt;
		// Inject spin like prior separate pass
		if (abs(Sp.w) > 0.0) {
			let posXZ = p.xz;
			let len2 = dot(posXZ, posXZ);
			if (len2 > 0.0) {
				let invLen = inverseSqrt(len2);
				let tang2 = vec2<f32>(-posXZ.y, posXZ.x) * invLen;
				let tang = vec3<f32>(tang2.x, 0.0, tang2.y);
				v = v + (Sp.w * P.dt) * tang;
			}
		}
		v = v * D.factor;
		p = p + v * P.dt;
		posOut.data[i] = vec4<f32>(p, radiate_mag);
		velOut.data[i] = vec4<f32>(v, 0.0);
	}
}