/*
This is a collection of utilities from the gl-matrix library, bundled into a single file
for convenience, as the original n-body simulations did not use modules.
*/

const EPSILON = 0.000001;

export type vec3 = Float32Array;
export type mat4 = Float32Array;
export type ReadonlyVec3 = readonly [number, number, number];

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
    lookAt: (out: mat4, eye: ReadonlyVec3, center: ReadonlyVec3, up: ReadonlyVec3): mat4 => {
        let x0: number, x1: number, x2: number, y0: number, y1: number, y2: number, z0: number, z1: number, z2: number, len: number;
        let eyex = eye[0], eyey = eye[1], eyez = eye[2];
        let upx = up[0], upy = up[1], upz = up[2];
        let centerx = center[0], centery = center[1], centerz = center[2];

        if (Math.abs(eyex - centerx) < EPSILON && Math.abs(eyey - centery) < EPSILON && Math.abs(eyez - centerz) < EPSILON) {
            return mat4.identity(out);
        }

        z0 = eyex - centerx; z1 = eyey - centery; z2 = eyez - centerz;
        len = 1 / Math.hypot(z0, z1, z2);
        z0 *= len; z1 *= len; z2 *= len;

        x0 = upy * z2 - upz * z1;
        x1 = upz * z0 - upx * z2;
        x2 = upx * z1 - upy * z0;
        len = 1 / Math.hypot(x0, x1, x2);
        x0 *= len; x1 *= len; x2 *= len;

        y0 = z1 * x2 - z2 * x1;
        y1 = z2 * x0 - z0 * x2;
        y2 = z0 * x1 - z1 * x0;

        out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
        out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
        out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
        out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
        out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
        out[14] = -(z0 * eyex + z1 * eyez + z2 * eyez);
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