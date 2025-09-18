// integrateBH.wgsl
// Purpose: Integrates particle positions and velocities using Barnes–Hut far-field gravity and direct near-field interactions.
// Structure: One compute entry point. Uses cluster properties for far-field, direct calculation for near-field, applies forces, updates velocities and positions.
struct SimParams { dt: f32, G: f32, eps: f32, numParticlesF: f32 }
struct Vec4Buf { data: array<vec4<f32>>, }
struct FloatBuf { data: array<f32>, }
struct Damp { factor: f32, _pad0: f32, _pad1: f32, _pad2: f32 }
struct Repulse { k: f32, _r0: f32, _r1: f32, _r2: f32 }
struct Rad { c: f32, _r0: f32, _r1: f32, _r2: f32 }
struct Spin { w: f32, _s0: f32, _s1: f32, _s2: f32 }
struct Keys { data: array<u32>, }
struct Cl { size: u32, count: u32, _p2: u32, _p3: u32 }
struct BH { theta: f32, _b0: f32, _b1: f32, _b2: f32 }
struct ClMass { data: array<f32>, }
struct ClCom { data: array<vec4<f32>>, }
struct PairCount { value: atomic<u32>, }
struct Pairs { data: array<vec4<u32>>, }

@group(0) @binding(0) var<storage, read> posIn: Vec4Buf;
// Verlet: previous-position buffer replaces explicit velocity buffer
@group(0) @binding(1) var<storage, read> prevPosIn: Vec4Buf;
@group(0) @binding(2) var<storage, read_write> posOut: Vec4Buf;
// write previous position for next step
@group(0) @binding(3) var<storage, read_write> prevPosOut: Vec4Buf;
@group(0) @binding(4) var<uniform> P: SimParams;
@group(0) @binding(5) var<storage, read> M: FloatBuf;
@group(0) @binding(6) var<uniform> D: Damp;
@group(0) @binding(7) var<uniform> Rp: Repulse;
@group(0) @binding(8) var<uniform> Rd: Rad;
@group(0) @binding(9) var<uniform> Sp: Spin;
@group(0) @binding(10) var<uniform> B: BH;
@group(0) @binding(11) var<storage, read> idx: Keys;
@group(0) @binding(12) var<uniform> C: Cl;
@group(0) @binding(13) var<storage, read> CM: ClMass;
@group(0) @binding(14) var<storage, read> CC: ClCom;
@group(0) @binding(15) var<storage, read_write> outPairs: Pairs;
@group(0) @binding(16) var<storage, read_write> outPairCount: PairCount;

@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
	let k = gid.x; // sorted index
	let n = u32(P.numParticlesF);
	if (k >= n) { return; }
	let i = idx.data[k];
	let mi = M.data[i];
	let isActive = mi > 0.0;
	var p = posIn.data[i].xyz;
	// compute velocity from current and previous positions: v = (p - prev)/dt
	var prev = prevPosIn.data[i].xyz;
	var v = (p - prev) / P.dt;
	if (!isActive) {
		posOut.data[i] = posIn.data[i];
		prevPosOut.data[i] = prevPosIn.data[i];
		return;
	}
	let eps2 = P.eps * P.eps;
	var a = vec3<f32>(0.0);
	var radiate_mag: f32 = 0.0;

	let cSize = C.size;
	let cCount = C.count;
	let cSelf = k / cSize;

	// Far-field via cluster COM, near-field via particles
	for (var c: u32 = 0u; c < cCount; c = c + 1u) {
		let mC = CM.data[c];
		if (mC <= 0.0) { continue; }
		if (c == cSelf) {
			// direct interactions inside own cluster
			let start = c * cSize;
			let end = min(n, start + cSize);
			for (var t: u32 = start; t < end; t = t + 1u) {
				let j = idx.data[t];
				if (j == i) { continue; }
				let mj = M.data[j];
				if (mj <= 0.0) { continue; }
				let d = posIn.data[j].xyz - p;
				let r2 = dot(d,d) + eps2;
				let invR = inverseSqrt(r2);
				let invR2 = invR * invR;
				let invR6 = invR2 * invR2 * invR2;
				let dir = d * invR;
				let aG = (P.G * mj) * invR2;
				let aR = (Rp.k * mj) * invR6;
				var aRad: f32 = 0.0;
				if (aR >= aG) {
					// compute neighbor velocity from positions
					let prevj = prevPosIn.data[j].xyz;
					let vj = (posIn.data[j].xyz - prevj) / P.dt;
					let closingSpeed = dot(d, v - vj);
					aRad = Rd.c * closingSpeed * invR;
					radiate_mag = radiate_mag + abs(aRad);
				}
				let aMag = aG - aR - aRad;
				a = a + dir * aMag;
				// record particle-particle force for visualization
				let invL = inverseSqrt(max(dot(d,d), 1e-12));
				let nhat = d * invL;
				// pack normal's xy into u32s similar to other shaders
				let nx = clamp(nhat.x * 32767.0, -32767.0, 32767.0);
				let ny = clamp(nhat.y * 32767.0, -32767.0, 32767.0);
				let p0 = (u32(i32(nx) & 0xFFFF) | (u32(i32(ny) & 0xFFFF) << 16));
				let p1 = select(0u, 1u, nhat.z < 0.0);
				let idxPair = atomicAdd(&outPairCount.value, 1u);
				if (idxPair < 262144u) {
					outPairs.data[idxPair] = vec4<u32>(i, j, p0, p1);
				}
			}
		} else {
			let com = CC.data[c].xyz;
			let s = CC.data[c].w; // radius
			let d = com - p;
			let r2 = dot(d,d) + eps2;
			let r = sqrt(r2);
			let open = s / max(r, 1e-6);
			if (open < B.theta) {
				let dir = d / max(r, 1e-6);
				let aG = (P.G * mC) / r2;
				a = a + dir * aG;
				// record cluster COM interaction as visualization pair
				let invL = inverseSqrt(max(dot(d,d), 1e-12));
				let nhat = d * invL;
				let nx = clamp(nhat.x * 32767.0, -32767.0, 32767.0);
				let ny = clamp(nhat.y * 32767.0, -32767.0, 327.0);
				let p0 = (u32(i32(nx) & 0xFFFF) | (u32(i32(ny) & 0xFFFF) << 16));
				let p1 = select(0u, 1u, nhat.z < 0.0);
				// encode cluster index by setting high bit
				let clusterIdEnc = (0x80000000u | (c & 0x7FFFFFFFu));
				let idxPair2 = atomicAdd(&outPairCount.value, 1u);
				if (idxPair2 < 262144u) {
					outPairs.data[idxPair2] = vec4<u32>(i, clusterIdEnc, p0, p1);
				}
			} else {
				// too close: direct interactions with members of this cluster
				let start = c * cSize;
				let end = min(n, start + cSize);
				for (var t: u32 = start; t < end; t = t + 1u) {
					let j = idx.data[t];
					if (j == i) { continue; }
					let mj = M.data[j];
					if (mj <= 0.0) { continue; }
					let d2 = posIn.data[j].xyz - p;
					let r22 = dot(d2,d2) + eps2;
					let invR = inverseSqrt(r22);
					let invR2 = invR * invR;
					let invR6 = invR2 * invR2 * invR2;
					let dir2 = d2 * invR;
					let aG2 = (P.G * mj) * invR2;
					let aR2 = (Rp.k * mj) * invR6;
					var aRad2: f32 = 0.0;
					if (aR2 >= aG2) {
						let prevj2 = prevPosIn.data[j].xyz;
						let vj2 = (posIn.data[j].xyz - prevj2) / P.dt;
						let closingSpeed2 = dot(d2, v - vj2);
						aRad2 = Rd.c * closingSpeed2 * invR;
						radiate_mag = radiate_mag + abs(aRad2);
					}
					let aMag2 = aG2 - aR2 - aRad2;
					a = a + dir2 * aMag2;
				}
			}
		}
	}

	// Integrate using a simple velocity update (a = acceleration). For Verlet-style
	// position integration we compute next position using current displacement and acceleration term.
	// However some legacy logic applies spin to velocity; keep that by adjusting v before position update.
	v = v + a * P.dt;
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
	// damping applied to velocity-like displacement
	v = v * D.factor;
	// Verlet-like position update: newPos = p + v*dt  (equivalent to p + (p - prev) + a*dt*dt if prev was set appropriately)
	// Using the computed v keeps behavior close to original while removing explicit vel buffers.
	let newP = p + v * P.dt;
	posOut.data[i] = vec4<f32>(newP, radiate_mag);
	// write previous position for the next frame (prevOut := current position)
	prevPosOut.data[i] = vec4<f32>(p, 0.0);
}