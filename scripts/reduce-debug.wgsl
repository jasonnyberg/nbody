struct UBO { n: f32, bucket: f32, bucketCount: f32, pad: f32 };
@group(0) @binding(0) var<storage, read> posBuf: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> nodeBuf: array<vec4f>;
@group(0) @binding(2) var<uniform> params: UBO;

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let k = gid.x;
  let N = u32(params.n);
  let bsz = u32(params.bucket);
  let start = k * bsz;
  if (start >= N) {
    // empty slot
    nodeBuf[2u*k] = vec4f(0.0);
    nodeBuf[2u*k+1u] = vec4f(0.0);
    return;
  }
  var mn = vec3f(1e30, 1e30, 1e30);
  var mx = vec3f(-1e30, -1e30, -1e30);
  let end = min(start + bsz, N);
  var i = start;
  loop {
    let p = posBuf[i].xyz;
    mn = min(mn, p);
    mx = max(mx, p);
    i = i + 1u;
    if (i >= end) { break; }
  }
  nodeBuf[2u*k] = vec4f(mn, 0.0);
  nodeBuf[2u*k+1u] = vec4f(mx, 0.0);
}
