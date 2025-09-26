struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
};

struct Particles {
    data: array<vec4<f32>>,
};

struct MortonCodes {
    data: array<vec2<u32>>,
};

struct UBO {
    proj: mat4x4f,
    view: mat4x4f,
    vp: vec4f,
};

@group(0) @binding(0) var<storage, read> particles: Particles;
@group(0) @binding(1) var<storage, read> morton_codes: MortonCodes;
@group(0) @binding(2) var<uniform> ubo: UBO;

fn getCorner(i: u32) -> vec2f {
  return select(vec2f(-1.0, -1.0), select(vec2f(1.0, -1.0), select(vec2f(-1.0, 1.0), vec2f(1.0,1.0), i==3u), i==2u), i==1u);
}

fn hsv_to_rgb(h: f32, s: f32, v: f32) -> vec3<f32> {
    let c = v * s;
    let x = c * (1.0 - abs(fract(h / 60.0) * 2.0 - 1.0));
    let m = v - c;
    var rgb: vec3<f32>;
    if (h < 60.0) {
        rgb = vec3<f32>(c, x, 0.0);
    } else if (h < 120.0) {
        rgb = vec3<f32>(x, c, 0.0);
    } else if (h < 180.0) {
        rgb = vec3<f32>(0.0, c, x);
    } else if (h < 240.0) {
        rgb = vec3<f32>(0.0, x, c);
    } else if (h < 300.0) {
        rgb = vec3<f32>(x, 0.0, c);
    } else {
        rgb = vec3<f32>(c, 0.0, x);
    }
    return rgb + vec3<f32>(m);
}

@vertex fn vs(@builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32) -> VSOut {
    let particle_index = morton_codes.data[iid].y;
    let P = particles.data[particle_index];
    let vp4 = ubo.proj * ubo.view * vec4f(P.xyz, 1.0);
    let w = ubo.vp.x;
    let h = ubo.vp.y;
    let baseSize = 10.0;
    let offs = getCorner(vid);
    let offsClip = vec2f(2.0 * baseSize / w, 2.0 * baseSize / h) * offs;

    var o: VSOut;
    o.pos = vec4f(vp4.xy + offsClip * vp4.w, vp4.z, vp4.w);

    let hue = f32(iid) / f32(32) * 360.0; // 32 is particleCount
    o.color = vec4f(hsv_to_rgb(hue, 1.0, 1.0), 1.0);
    return o;
}

@fragment fn fs(inp: VSOut) -> @location(0) vec4f {
  return inp.color;
}
