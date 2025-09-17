struct PairCount { value: atomic<u32>, }
struct Pairs { data: array<vec4<u32>>, }
struct Vec4Buf { data: array<vec4<f32>>, }
struct FloatBuf { data: array<f32>, }
struct Rest { e: f32, _pad0: f32, _pad1: f32, _pad2: f32 }
struct Locks { data: array<atomic<u32>>, }
struct Claims { data: array<atomic<u32>>, }

@group(0) @binding(0) var<storage, read_write> V: Vec4Buf; // velocities (post-integration)
@group(0) @binding(1) var<storage, read> M: FloatBuf;      // masses
@group(0) @binding(2) var<storage, read_write> pc: PairCount; // pair count (atomic)
@group(0) @binding(3) var<storage, read> pb: Pairs;        // pairs list
@group(0) @binding(4) var<uniform> R: Rest;               // alpha (energy restitution)
@group(0) @binding(5) var<storage, read_write> L: Locks;  // locks
@group(0) @binding(6) var<storage, read_write> C: Claims; // claims per particle (to avoid multiple splits)

fn decodeNormal(packed: vec2<u32>) -> vec3<f32> {
	let xb = packed.x & 0xFFFFu;
	let yb = (packed.x >> 16u) & 0xFFFFu;
	let xs = select(i32(xb), i32(xb) - 65536, (xb & 0x8000u) != 0u);
	let ys = select(i32(yb), i32(yb) - 65536, (yb & 0x8000u) != 0u);
	let x = f32(xs) / 32767.0;
	let y = f32(ys) / 32767.0;
	var z = sqrt(max(0.0, 1.0 - x*x - y*y));
	if (packed.y != 0u) { z = -z; }
	return normalize(vec3<f32>(x, y, z));
}

@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
	let k = gid.x;
	let total = atomicLoad(&pc.value);
	if (k >= total) { return; }

	let rec = pb.data[k];
	let i = rec.x; let j = rec.y;
	if (i == j) { return; }

	// Acquire locks in index order to avoid deadlocks
	let a = min(i, j);
	let b = max(i, j);
	let la = atomicCompareExchangeWeak(&L.data[a], 0u, 1u);
	if (!la.exchanged) { return; }
	let lb = atomicCompareExchangeWeak(&L.data[b], 0u, 1u);
	if (!lb.exchanged) { atomicStore(&L.data[a], 0u); return; }

	// Ensure each particle participates in at most one split per frame
	let ca = atomicCompareExchangeWeak(&C.data[i], 0u, 1u);
	if (!ca.exchanged) { atomicStore(&L.data[b], 0u); atomicStore(&L.data[a], 0u); return; }
	let cb = atomicCompareExchangeWeak(&C.data[j], 0u, 1u);
	if (!cb.exchanged) {
		atomicStore(&C.data[i], 0u);
		atomicStore(&L.data[b], 0u);
		atomicStore(&L.data[a], 0u);
		return;
	}

	let mi = M.data[i];
	let mj = M.data[j];
	if (mi <= 0.0 || mj <= 0.0) {
		// release
		atomicStore(&L.data[b], 0u);
		atomicStore(&L.data[a], 0u);
		return;
	}

	var vi = V.data[i].xyz; // post-integration velocities
	var vj = V.data[j].xyz;
	let n = decodeNormal(vec2<u32>(rec.z, rec.w));

	let m12 = mi + mj;
	if (m12 <= 0.0) {
		atomicStore(&L.data[b], 0u);
		atomicStore(&L.data[a], 0u);
		return;
	}
	let v12p = (mi * vi + mj * vj) / m12; // COM velocity after integration

	// Angular-momentum-preserving split: keep tangential component, reverse normal component (with restitution)
	let alpha = clamp(R.e, 0.0, 1.0);           // coefficient of restitution along normal
	let vrel = vj - vi;                         // relative velocity after integration
	let vn_mag = dot(vrel, n);                  // normal component magnitude
	let vn = vn_mag * n;                        // normal component vector
	let vt = vrel - vn;                         // tangential component
	// Only flip normal if approaching (vn_mag < 0). Otherwise keep it (already separating)
	let vn_mag_new = select(vn_mag, -alpha * vn_mag, vn_mag < 0.0);
	let vrel_new = vt + vn_mag_new * n;

	// Reconstruct individual velocities from COM and relative velocity
	vi = v12p - (mj / m12) * vrel_new;
	vj = v12p + (mi / m12) * vrel_new;
	V.data[i] = vec4<f32>(vi, 0.0);
	V.data[j] = vec4<f32>(vj, 0.0);

	// release locks
	atomicStore(&L.data[b], 0u);
	atomicStore(&L.data[a], 0u);
}