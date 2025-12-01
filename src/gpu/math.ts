// Simple 4x4 matrix operations for MVP transforms
// Carmack-style: simple, direct, no abstraction

export type Mat4 = Float32Array; // 16 elements, column-major

export function mat4Identity(): Mat4 {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1.0;
    return m;
}

export function mat4Perspective(fov: number, aspect: number, near: number, far: number): Mat4 {
    const f = 1.0 / Math.tan(fov / 2.0);
    const nf = 1.0 / (near - far);

    const m = new Float32Array(16);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = (far + near) * nf;
    m[11] = -1.0;
    m[14] = 2.0 * far * near * nf;
    return m;
}

export function mat4LookAt(eye: [number, number, number], center: [number, number, number], up: [number, number, number]): Mat4 {
    const z0 = eye[0] - center[0];
    const z1 = eye[1] - center[1];
    const z2 = eye[2] - center[2];

    let len = 1.0 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
    const zx = z0 * len;
    const zy = z1 * len;
    const zz = z2 * len;

    const x0 = up[1] * zz - up[2] * zy;
    const x1 = up[2] * zx - up[0] * zz;
    const x2 = up[0] * zy - up[1] * zx;

    len = 1.0 / Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
    const xx = x0 * len;
    const xy = x1 * len;
    const xz = x2 * len;

    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    const m = new Float32Array(16);
    m[0] = xx;
    m[1] = yx;
    m[2] = zx;
    m[4] = xy;
    m[5] = yy;
    m[6] = zy;
    m[8] = xz;
    m[9] = yz;
    m[10] = zz;
    m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    m[15] = 1.0;
    return m;
}

export function mat4RotateX(angle: number): Mat4 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);

    const m = mat4Identity();
    m[5] = c;
    m[6] = s;
    m[9] = -s;
    m[10] = c;
    return m;
}

export function mat4RotateY(angle: number): Mat4 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);

    const m = mat4Identity();
    m[0] = c;
    m[2] = -s;
    m[8] = s;
    m[10] = c;
    return m;
}

export function mat4RotateZ(angle: number): Mat4 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);

    const m = mat4Identity();
    m[0] = c;
    m[1] = s;
    m[4] = -s;
    m[5] = c;
    return m;
}

export function mat4Translate(x: number, y: number, z: number): Mat4 {
    const m = mat4Identity();
    m[12] = x;
    m[13] = y;
    m[14] = z;
    return m;
}

export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
    const out = new Float32Array(16);

    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            out[j * 4 + i] =
                a[0 * 4 + i] * b[j * 4 + 0] +
                a[1 * 4 + i] * b[j * 4 + 1] +
                a[2 * 4 + i] * b[j * 4 + 2] +
                a[3 * 4 + i] * b[j * 4 + 3];
        }
    }

    return out;
}

export function vec3TransformMat4(v: [number, number, number], m: Mat4): [number, number, number] {
    const x = v[0], y = v[1], z = v[2];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    const iw = w !== 0 ? 1.0 / w : 1.0;

    return [
        (m[0] * x + m[4] * y + m[8] * z + m[12]) * iw,
        (m[1] * x + m[5] * y + m[9] * z + m[13]) * iw,
        (m[2] * x + m[6] * y + m[10] * z + m[14]) * iw
    ];
}
