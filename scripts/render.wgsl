// render.wgsl
// Purpose: Renders particles as instanced sprites with radiative and mass-based coloring.
// Structure: Vertex and fragment entry points. Computes per-particle size, color, and alpha mask for circular sprites. Cull dead particles.
struct Vec4Buf { data: array<vec4<f32>>, }
struct FloatBuf { data: array<f32>, }
struct Mats { m: array<vec4<f32>, 10>, }
@group(0) @binding(0) var<storage, read> Ppos: Vec4Buf;
@group(0) @binding(1) var<storage, read> M: FloatBuf;
@group(0) @binding(2) var<uniform> U: Mats;

struct VSOut {
	@builtin(position) pos: vec4<f32>,
	@location(0) uv: vec2<f32>,
	@location(1) radiate: f32,
	@location(2) massNorm: f32,
};

fn loadMat(idx: u32) -> mat4x4<f32> {
	let b = idx * 4u;
	return mat4x4<f32>(U.m[b+0u], U.m[b+1u], U.m[b+2u], U.m[b+3u]);
}

@vertex
fn vs(@builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32) -> VSOut {
	// Per-instance particle index
	let pos4 = Ppos.data[iid];
	let world = pos4.xyz;
	let mass = M.data[iid];

	// Cull dead particles (mass <= 0)
	if (mass <= 0.0) {
		var out: VSOut;
		out.pos = vec4<f32>(2.0, 2.0, 1.0, 1.0);
		out.uv = vec2<f32>(2.0);
		out.radiate = 0.0;
		out.massNorm = 0.0;
		return out;
	}

	// Corner in NDC pixel space: (-1,-1), (-1,1), (1,-1), (1,1)
	var corner: vec2<f32>;
	switch (vid & 3u) {
		case 0u: { corner = vec2<f32>(-1.0, -1.0); }
		case 1u: { corner = vec2<f32>(-1.0,  1.0); }
		case 2u: { corner = vec2<f32>( 1.0, -1.0); }
		default: { corner = vec2<f32>( 1.0,  1.0); }
	}

	let proj = loadMat(0u);
	let view = loadMat(1u);
	let viewPos = view * vec4<f32>(world, 1.0);
	let clip = proj * viewPos;

	// Viewport and size parameters packed at U.m[8]: (width, height, sizeScale, invLogMax)
	let vp = U.m[8u];
	let width = vp.x; let height = vp.y; let sizeScale = vp.z; let invLogMax = vp.w;
	// Depth-scaled size similar to nbody3
	let baseSize = max(1.0, pow(max(mass, 0.0), 0.3333));
	let sizePx = max(2.0, sizeScale * baseSize / max(1.0, -viewPos.z));

	// Convert pixel offset to clip-space offset (pre-divide), account for clip.w
	let offsetClip = vec2<f32>(
		2.0 * corner.x * sizePx / max(1.0, width),
	 -2.0 * corner.y * sizePx / max(1.0, height)
	) * clip.w;

	// Mass normalization for color like nbody3
	let mNorm = clamp(log(1.0 + max(mass, 0.0)) * invLogMax, 0.0, 1.0);

	var out: VSOut;
	out.pos = vec4<f32>(clip.xy + offsetClip, clip.z, clip.w);
	out.uv = corner; // pass to fragment for circular mask
	out.radiate = pos4.w;
	out.massNorm = mNorm;
	return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
	let r = length(in.uv);
	if (r > 1.0) { discard; }
	// Soft edge alpha
	let alpha = clamp((1.0 - r) / 0.3, 0.0, 1.0);
	// Radiative coloring like nbody3: red from radiate, green/blue from mass
	let redRadiate = clamp(5.0 * in.radiate, 0.0, 1.0);
	let g = in.massNorm;
	let b = 1.0 - in.massNorm;
	return vec4<f32>(redRadiate, g, b, alpha);
}