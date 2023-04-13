import { log, Mat4, MeshRenderer, Node, Quat, SkinnedMeshRenderer, Vec3, warn } from "cc";

export function resetAsBindPose(modelRoot: Node) {
    const skeleton = modelRoot.getComponentInChildren(SkinnedMeshRenderer)?.skeleton;
    if (!skeleton) {
        warn(`Can not find skeleton for ${modelRoot.getPathInHierarchy()}`);
        return;
    }

    const getBindPose = (i: number) => skeleton.inverseBindposes[i];

    const resetChildren = (node: Node, prefix = '') => {
        for (const child of node.children) {
            if (!child.name) {
                warn(`Joint ${child} has an empty name. Skipped.`);
                continue;
            }
            const path = prefix ? `${prefix}/${child.name}` : child.name;
            // console.log(`Reset ${child.name}`);
            // child.position = ccm.Vec3.ZERO;
            // child.scale = ccm.Vec3.ONE;
            // child.rotation = Quat.IDENTITY;
            const i = skeleton.joints.indexOf(path);
            if (i < 0) {
                log(`Joint ${path} does not have bind pose recorded. Skipped.`);
                continue;
            }
            
            const bindPoseSkeletonSpace = Mat4.clone(getBindPose(i));
            const iParent = !prefix ? -1 : skeleton.joints.indexOf(prefix);
            if (iParent >= 0) {
                const invParent = Mat4.invert(new Mat4(), getBindPose(iParent));
                // Parent * Local = World
                // Local = Parent-1 * World
                Mat4.multiply(bindPoseSkeletonSpace, invParent, bindPoseSkeletonSpace);
            }

            const r = new Quat();
            const t = new Vec3();
            const s = new Vec3();
            Mat4.toSRT(bindPoseSkeletonSpace, r, t, s);
            child.position = t;
            child.rotation = r;
            child.scale = s;

            resetChildren(child, path);
        }
    };

    resetChildren(modelRoot);
}
