struct SimParams { dt: f32, G: f32, eps: f32, numParticlesF: f32 }
struct Vec4Buf { data: array<vec4<f32>>, }
struct FloatBuf { data: array<f32>, }
struct Damp { factor: f32, _pad0: f32, _pad1: f32, _pad2: f32 }
struct Repulse { k: f32, _r0: f32, _r1: f32, _r2: f32 }
struct Rad { c: f32, _r0: f32, _r1: f32, _r2: f32 }
struct Spin { w: f32, _s0: f32, _s1: f32, _s2: f32 }

@group(0) @binding(0) var<storage, read> posIn: Vec4Buf;
@group(0) @binding(1) var<storage, read> prevPosIn: Vec4Buf;
@group(0) @binding(2) var<storage, read_write> posOut: Vec4Buf;
@group(0) @binding(3) var<storage, read_write> prevPosOut: Vec4Buf;
@group(0) @binding(4) var<uniform> P: SimParams;
@group(0) @binding(5) var<storage, read> M: FloatBuf;
@group(0) @binding(6) var<uniform> D: Damp;
@group(0) @binding(7) var<uniform> Rp: Repulse;
@group(0) @binding(8) var<uniform> Rd: Rad;
@group(0) @binding(9) var<uniform> Sp: Spin;

const WG: u32 = ${WG_SIZE}u;
var<workgroup> tPos: array<vec4<f32>, WG>;
var<workgroup> tPrevPos: array<vec4<f32>, WG>;
var<workgroup> tMass: array<f32, WG>;

@compute @workgroup_size(${WG_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let i = gid.x;
  let n = u32(P.numParticlesF);
  let isActive = i < n;
  let eps2 = P.eps * P.eps;

  var p = vec3<f32>(0.0);
  var p_prev = vec3<f32>(0.0);
  var mi: f32 = 0.0;
  if (isActive) {
    p = posIn.data[i].xyz;
    p_prev = prevPosIn.data[i].xyz;
    mi = M.data[i];
  }

  var a = vec3<f32>(0.0);
  var radiate_mag: f32 = 0.0;

  var base: u32 = 0u;
  loop {
    if (base >= n) { break; }
    let j_tile = base + lid.x;
    if (j_tile < n) {
      tPos[lid.x] = posIn.data[j_tile];
      tPrevPos[lid.x] = prevPosIn.data[j_tile];
      tMass[lid.x] = M.data[j_tile];
    } else {
      tPos[lid.x] = vec4<f32>(0.0);
      tPrevPos[lid.x] = vec4<f32>(0.0);
      tMass[lid.x] = 0.0;
    }
    workgroupBarrier();

    if (isActive && mi > 0.0) {
      let remain = n - base;
      var count: u32 = min(remain, WG);

      for (var k: u32 = 0u; k < count; k = k + 1u) {
        let j_global = base + k;
        if (j_global != i) {
            let m = tMass[k];
            if (m > 0.0) {
                let d = tPos[k].xyz - p;
                let r2 = dot(d,d) + eps2;
                let invR = inverseSqrt(r2);
                let invR2 = invR * invR;
                let invR6 = invR2 * invR2 * invR2;
                let dir = d * invR;
                let aG = (P.G * m) * invR2;
                let aR = (Rp.k * m) * invR6;
                
                var aRad: f32 = 0.0;
                if (aR >= aG) {
                  let vi = p - p_prev;
                  let vj = tPos[k].xyz - tPrevPos[k].xyz;
                  let closingSpeed = dot(d, vi - vj);
                  aRad = Rd.c * closingSpeed * invR;
                  radiate_mag = radiate_mag + abs(aRad);
                }
                a = a + dir * (aG - aR - aRad);
            }
        }
      }
    }
    workgroupBarrier();
    base = base + WG;
  }

  if (isActive) {
    if (mi > 0.0) {
        let dt2 = P.dt * P.dt;
        var p_new = p + (p - p_prev) * D.factor + a * dt2;

        if (abs(Sp.w) > 0.0) {
            let posXZ = p.xz;
            if (dot(posXZ, posXZ) > 0.0) {
                let tang = normalize(vec3<f32>(-posXZ.y, 0.0, posXZ.x));
                p_new = p_new + tang * (Sp.w * dt2);
            }
        }

        posOut.data[i] = vec4<f32>(p_new, radiate_mag);
        prevPosOut.data[i] = vec4<f32>(p, 0.0);
    } else {
        posOut.data[i] = posIn.data[i];
        prevPosOut.data[i] = prevPosIn.data[i];
    }
  }
}
