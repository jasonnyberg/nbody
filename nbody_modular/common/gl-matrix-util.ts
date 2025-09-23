/*
This is a collection of utilities from the gl-matrix library, bundled into a single file
for convenience, as the original n-body simulations did not use modules.
*/

const EPSILON = 0.000001;

export type vec3 = Float32Array;
export type mat4 = Float32Array;
export type ReadonlyVec3 = readonly [number, number, number];

function normalize(a: number[] | vec3): number[] {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
}

function cross(a: number[] | vec3, b: number[] | vec3): number[] {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export const vec3 = {
    create: (): vec3 => new Float32Array(3),
    fromValues: (x: number, y: number, z: number): vec3 => new Float32Array([x, y, z]),
    set: (out: vec3, x: number, y: number, z: number): vec3 => {
        out[0] = x; out[1] = y; out[2] = z;
        return out;
    },
};

export const mat4 = {
    create: (): mat4 => {
        let out = new Float32Array(16);
        out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1;
        return out;
    },
    lookAt: (out: mat4, eye: vec3, center: vec3, up: vec3): mat4 => {
        const f = normalize([center[0] - eye[0], center[1] - eye[1], center[2] - eye[2]]);
        const s = normalize(cross(f, up));
        const u = cross(s, f);
        out[0] = s[0];
        out[1] = u[0];
        out[2] = -f[0];
        out[3] = 0;
        out[4] = s[1];
        out[5] = u[1];
        out[6] = -f[1];
        out[7] = 0;
        out[8] = s[2];
        out[9] = u[2];
        out[10] = -f[2];
        out[11] = 0;
        out[12] = -(s[0] * eye[0] + s[1] * eye[1] + s[2] * eye[2]);
        out[13] = -(u[0] * eye[0] + u[1] * eye[1] + u[2] * eye[2]);
        out[14] = (f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2]);
        out[15] = 1;
        return out;
    },
    perspective: (out: mat4, fovy: number, aspect: number, near: number, far: number): mat4 => {
        const f = 1.0 / Math.tan(fovy / 2);
        out[0] = f / aspect;
        out[1] = 0;
        out[2] = 0;
        out[3] = 0;
        out[4] = 0;
        out[5] = f;
        out[6] = 0;
        out[7] = 0;
        out[8] = 0;
        out[9] = 0;
        out[11] = -1;
        out[12] = 0;
        out[13] = 0;
        out[15] = 0;
        if (far != null && far !== Infinity) {
            const nf = 1 / (near - far);
            out[10] = (far + near) * nf;
            out[14] = 2 * far * near * nf;
        } else {
            out[10] = -1;
            out[14] = -2 * near;
        }
        return out;
    },
    identity: (out: mat4): mat4 => {
        out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
        out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
        out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
        out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
        return out;
    }
};
