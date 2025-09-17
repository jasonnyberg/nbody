// clusterReduce.wgsl
// Purpose: Reduces clusters of Morton-sorted particles to compute total mass, center of mass, and bounding radius for Barnes–Hut integration.
// Structure: One compute entry point. Sums mass and position, computes bounding box, outputs cluster properties for far-field gravity.
struct Vec4Buf { data: array<vec4<f32>>, }
struct FloatBuf { data: array<f32>, }
struct Keys { data: array<u32>, }
struct Cl { size: u32, count: u32, _p2: u32, _p3: u32 }
struct SimParams { dt: f32, G: f32, eps: f32, numParticlesF: f32 }
struct OutMass { data: array<f32>, }
struct OutCom { data: array<vec4<f32>>, }

@group(0) @binding(0) var<storage, read> Ppos: Vec4Buf;
@group(0) @binding(1) var<storage, read> M: FloatBuf;
@group(0) @binding(2) var<storage, read> idx: Keys;
@group(0) @binding(3) var<uniform> C: Cl;
@group(0) @binding(4) var<storage, read_write> CM: OutMass;
@group(0) @binding(5) var<storage, read_write> CC: OutCom;
@group(0) @binding(6) var<uniform> S: SimParams;

const WG: u32 = 128u;
var<workgroup> sumM: array<f32, WG>;
var<workgroup> sumMV: array<vec3<f32>, WG>;
var<workgroup> bbMin: array<vec3<f32>, WG>;
var<workgroup> bbMax: array<vec3<f32>, WG>;

@compute @workgroup_size(128)
fn main(
	@builtin(workgroup_id) wid: vec3<u32>,
	@builtin(local_invocation_id) lid: vec3<u32>
) {
	let c = wid.x; // one cluster per workgroup
	if (c >= C.count) { return; }
	let n = u32(S.numParticlesF);
	let start = c * C.size;
	let end = min(n, start + C.size);

	var lm: f32 = 0.0;
	var lmv: vec3<f32> = vec3<f32>(0.0);
	var lmin: vec3<f32> = vec3<f32>(1e30);
	var lmax: vec3<f32> = vec3<f32>(-1e30);

	var t = start + lid.x;
	loop {
		if (t >= end) { break; }
		let j = idx.data[t];
		let mj = M.data[j];
		if (mj > 0.0) {
			let pj = Ppos.data[j].xyz;
			lm = lm + mj;
			lmv = lmv + mj * pj;
			lmin = min(lmin, pj);
			lmax = max(lmax, pj);
		}
		t = t + WG;
	}

	sumM[lid.x] = lm;
	sumMV[lid.x] = lmv;
	bbMin[lid.x] = lmin;
	bbMax[lid.x] = lmax;
	workgroupBarrier();

	if (lid.x == 0u) {
		var tm: f32 = 0.0;
		var tmv: vec3<f32> = vec3<f32>(0.0);
		var tmin: vec3<f32> = vec3<f32>(1e30);
		var tmax: vec3<f32> = vec3<f32>(-1e30);
		var s: u32 = 0u;
		loop {
			if (s >= WG) { break; }
			tm = tm + sumM[s];
			tmv = tmv + sumMV[s];
			tmin = min(tmin, bbMin[s]);
			tmax = max(tmax, bbMax[s]);
			s = s + 1u;
		}
		var com: vec3<f32> = vec3<f32>(0.0);
		if (tm > 0.0) { com = tmv / tm; }
		let extent = tmax - tmin;
		let radius = 0.5 * length(extent);
		CM.data[c] = tm;
		CC.data[c] = vec4<f32>(com, radius);
	}
}