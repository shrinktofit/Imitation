import { IMat4Like, IVec3Like, Mat3, Quat, Vec3 } from "cc";

const v3_1 = new Vec3();
const m3_1 = new Mat3();

export function toSRT<InType extends IMat4Like, VecLike extends IVec3Like> (m: InType, q: Quat | null, v: VecLike | null, s: VecLike | null) {
    const sx = Vec3.set(v3_1, m.m00, m.m01, m.m02).length();
    const sy = Vec3.set(v3_1, m.m04, m.m05, m.m06).length();
    const sz = Vec3.set(v3_1, m.m08, m.m09, m.m10).length();
    if (s) {
        s.x = sx;
        s.y = sy;
        s.z = sz;
    }
    if (v) {
        Vec3.set(v, m.m12, m.m13, m.m14);
    }
    if (q) {
        m3_1.m00 = m.m00 / sx;
        m3_1.m01 = m.m01 / sx;
        m3_1.m02 = m.m02 / sx;
        m3_1.m03 = m.m04 / sy;
        m3_1.m04 = m.m05 / sy;
        m3_1.m05 = m.m06 / sy;
        m3_1.m06 = m.m08 / sz;
        m3_1.m07 = m.m09 / sz;
        m3_1.m08 = m.m10 / sz;
        const det = Mat3.determinant(m3_1);
        if (det < 0) {
            if (s) s.x *= -1;
            m3_1.m00 *= -1;
            m3_1.m01 *= -1;
            m3_1.m02 *= -1;
        }
        Quat.fromMat3(q, m3_1); // already normalized
    }
}

export function fromSRT<Out extends IMat4Like, VecLike extends IVec3Like> (out: Out, q: Quat, v: VecLike, s: VecLike) {
    const x = q.x; const y = q.y; const z = q.z; const w = q.w;
    const x2 = x + x;
    const y2 = y + y;
    const z2 = z + z;

    const xx = x * x2;
    const xy = x * y2;
    const xz = x * z2;
    const yy = y * y2;
    const yz = y * z2;
    const zz = z * z2;
    const wx = w * x2;
    const wy = w * y2;
    const wz = w * z2;
    const sx = s.x;
    const sy = s.y;
    const sz = s.z;

    out.m00 = (1 - (yy + zz)) * sx;
    out.m01 = (xy + wz) * sx;
    out.m02 = (xz - wy) * sx;
    out.m03 = 0;
    out.m04 = (xy - wz) * sy;
    out.m05 = (1 - (xx + zz)) * sy;
    out.m06 = (yz + wx) * sy;
    out.m07 = 0;
    out.m08 = (xz + wy) * sz;
    out.m09 = (yz - wx) * sz;
    out.m10 = (1 - (xx + yy)) * sz;
    out.m11 = 0;
    out.m12 = v.x;
    out.m13 = v.y;
    out.m14 = v.z;
    out.m15 = 1;

    return out;
}