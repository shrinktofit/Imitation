import { _decorator, animation, CCClass, Component, Node, instantiate, warn, Vec3, Quat, error, Skeleton, Mat4, log, approx } from 'cc';
import { DEBUG } from 'cc/env';
import { ImitationDefinition, ImitationDefinitionJson } from './ImitationDefinition';
const { ccclass, property } = _decorator;

const animationGraphRuntimeConstructor =
    CCClass.attr(animation.AnimationController, 'graph').ctor as new () => animation.AnimationGraphRunTime;

function rotateAroundPivot (transform: Transform, pivot: Vec3, rotation: Quat) {
    const diff = Vec3.subtract(new Vec3(), transform.position, pivot);
    Vec3.transformQuat(diff, diff, rotation);
    Vec3.add(transform.position, diff, pivot);
    Quat.multiply(transform.rotation, rotation, transform.rotation);
}

const align = (transform: Transform) => {
    // rotateAroundPivot(
    //     transform,
    //     Vec3.ZERO,
    //     Quat.fromAxisAngle(new Quat(), Vec3.UNIT_X, Math.PI / 2),
    // );
    transform.rotate(Quat.fromAxisAngle(new Quat(), Vec3.UNIT_X, -Math.PI / 2));
};

@ccclass('ImitatedAnimationController')
export class ImitatedAnimationController extends Component {
    @property
    public definition = new ImitationDefinition();

    @property(animationGraphRuntimeConstructor)
    public graph: animation.AnimationGraphRunTime | null = null;

    @property
    public debugPosition = new Vec3();

    @property
    public debugRotation = new Vec3();

    @property
    public targetPostRotation = new Vec3();

    @property
    public targetPostScale = 1.0;

    @property(Skeleton)
    public sourceSkeleton!: Skeleton;

    @property(Skeleton)
    public targetSkeleton!: Skeleton;

    start () {
        if (!this.definition.sourceHierarchy || !this.definition.definitionJson) {
            return;
        }
        const json = (this.definition.definitionJson.json as ImitationDefinitionJson);
        if (!json.targetRoot) {
            error(`Target root not specified.`);
            return;
        }
        const targetRoot = this.node.getChildByPath(json.targetRoot);
        if (!targetRoot) {
            error(`Can not find target root ${json.targetRoot} from ${this.node.getPathInHierarchy()}`);
            return;
        }

        const imitationSourceNode = instantiate(this.definition.sourceHierarchy);
        imitationSourceNode.name = `${imitationSourceNode.name}(ImitationSource)`;
        imitationSourceNode.setPosition(this.debugPosition);
        // What if the source origin node already has rotation?
        // imitationSourceNode.setRotationFromEuler(this.debugRotation);

        const managedController = imitationSourceNode.addComponent(animation.AnimationController);
        managedController.graph = this.graph;
        this.node.addChild(imitationSourceNode);

        this._managedController = managedController;
        this._sourceOriginNode = imitationSourceNode;

        const debuggingSource = instantiate(this.definition.sourceHierarchy);
        debuggingSource.name = `${imitationSourceNode.name}(DebuggingImitationSource)`;
        debuggingSource.setPosition(Vec3.add(new Vec3(), this.debugPosition, Vec3.UNIT_X));
        this.node.addChild(debuggingSource);
        this._debuggingSource = debuggingSource;

        for (const targetNode of visit(targetRoot)) {
            const targetNodeName = targetNode.name;
            let mapping = json.mappings.find((mapping) => mapping.target === targetNodeName);
            if (mapping && json.includes && json.includes.indexOf(mapping.source) < 0) {
                mapping = undefined;
            }
            const managedBone = this._addManagedBone(
                targetNode,
                this.targetSkeleton,
                mapping,
                imitationSourceNode,
                this.sourceSkeleton,
                false,
            );
            if (managedBone) {
                this._managedTargetBones.push(managedBone);
            }
        }

        for (const debuggingSourceNode of visit(debuggingSource)) {
            const targetNodeName = debuggingSourceNode.name;
            let mapping = json.mappings.find((mapping) => mapping.source === targetNodeName);
            if (mapping && json.includes && json.includes.indexOf(mapping.source) < 0) {
                mapping = undefined;
            }
            const managedBone = this._addManagedBone(
                debuggingSourceNode,
                this.sourceSkeleton,
                mapping,
                imitationSourceNode,
                this.sourceSkeleton,
                true,
            );
            if (managedBone) {
                this._managedDebuggingSourceBones.push(managedBone);
            }
        }
    }

    public getValue(...args: Parameters<animation.AnimationController['getValue']>) {
        return this._managedController?.getValue(...args);
    }

    public setValue(...args: Parameters<animation.AnimationController['setValue']>) {
        this._managedController?.setValue(...args);
    }

    public update(deltaTime: number) {
        const {
            _sourceOriginNode: sourceOriginNode,
        } = this;
        if (!sourceOriginNode) {
            return undefined;
        }

        for (const bone of this._managedTargetBones) {
            bone.imitate(sourceOriginNode, this.node, false);
        }

        if (this._debuggingSource) {
            for (const bone of this._managedDebuggingSourceBones) {
                bone.imitate(sourceOriginNode, this._debuggingSource, true);
            }
        }

        for (const targetRootNode of [this.node.getChildByName('mixamorig:Hips')]) {
            if (!approx(this.targetPostScale, 1, 1e-5)) {
                targetRootNode.scale = Vec3.multiplyScalar(new Vec3(), targetRootNode.scale, this.targetPostScale);
                targetRootNode.position = Vec3.multiplyScalar(new Vec3(), targetRootNode.position, this.targetPostScale);
            }
            if (!Vec3.equals(this.targetPostRotation, Vec3.ZERO)) {
                const q = Quat.fromEuler(new Quat(), this.targetPostRotation.x, this.targetPostRotation.y, this.targetPostRotation.z);
                targetRootNode.rotation = Quat.multiply(new Quat(), q, targetRootNode.rotation);
                targetRootNode.position = Vec3.transformQuat(new Vec3(), targetRootNode.position, q);
            }
        }

        if (true) {
            if (this._managedTargetBones.length !== 0) {
                this._managedTargetBones[0].target.node.rotate(this._sourceOriginNode!.getChildByName('root')?.rotation);
            }
    
            if (this._managedDebuggingSourceBones.length !== 0) {
                this._managedDebuggingSourceBones[0].target.node.rotate(this._sourceOriginNode!.getChildByName('root')?.rotation);
            }
        }
    }

    private _managedController: animation.AnimationController | undefined = undefined;

    private _sourceOriginNode: Node | undefined = undefined;

    private _managedTargetBones: ManagedBone[] = [];

    private _managedDebuggingSourceBones: ManagedBone[] = [];

    private _debuggingSource: Node | undefined = undefined;

    private _addManagedBone(
        targetBone: Node,
        targetSkeleton: Skeleton,
        mapping: Omit<ImitationDefinitionJson['mappings'][0], 'target'> | undefined,
        sourceOrigin: Node,
        sourceSkeleton: Skeleton,
        isDebuggingSource: boolean,
    ) {
        const targetReferencePoseTransform = getBindPoseOfNode(targetBone, targetSkeleton);
        const targetReferencePoseLocalTransform = getLocalBindPoseOfNode(targetBone, targetSkeleton);
        if (!targetReferencePoseTransform || !targetReferencePoseLocalTransform) {
            warn(`Can not decide bine pose of target bone ${targetBone.getPathInHierarchy()}. Skipped.`);
            return;
        }
        // TODO:!!!!
        if (!isDebuggingSource) {
            const scale = Mat4.fromScaling(new Mat4(), new Vec3(100, 100, 100));
            if (targetBone.name === 'mixamorig:Hips') {
                Mat4.multiply(targetReferencePoseLocalTransform, scale, targetReferencePoseLocalTransform);
            }
            Mat4.multiply(targetReferencePoseTransform, scale, targetReferencePoseTransform);
        }

        const managedBone = new ManagedBone(
            new BoneInstance(
                targetBone,
                Transform.fromMat(new Transform(), targetReferencePoseTransform),
                Transform.fromMat(new Transform(), targetReferencePoseLocalTransform),
            ),
        );

        if (mapping) {
            const sourceNode = findNodeByName(sourceOrigin, mapping.source);
            if (!sourceNode) {
                error(`Can not find mapping source node ${mapping.source} starting from ${sourceOrigin.getPathInHierarchy()}`);
            } else {
                const sourceReferencePoseTransform = getBindPoseOfNode(sourceNode, sourceSkeleton);
                const sourceReferencePoseLocalTransform = getLocalBindPoseOfNode(sourceNode, sourceSkeleton);
                if (!sourceReferencePoseTransform || !sourceReferencePoseLocalTransform) {
                    error(`Source bone ${sourceNode.getPathInHierarchy()} does not have bind pose!`);
                } else {
                    managedBone.mapping = {
                        source: new BoneInstance(
                            sourceNode,
                            Transform.fromMat(new Transform(), sourceReferencePoseTransform),
                            Transform.fromMat(new Transform(), sourceReferencePoseLocalTransform),
                        ),
                    };
                }
            }
        }

        return managedBone;
    }
}

class ManagedBone {
    constructor(
        public target: BoneInstance,
    ) {

    }
    
    public mapping: {
        source: BoneInstance;
    } | undefined;

    public imitate(sourceOrigin: Node, targetOrigin: Node, isDebuggingSource: boolean) {
        const { target, mapping } = this;
        const {
            node: targetNode,
        } = target;

        targetNode.position = target.referencePoseLocalTransform.position;
        targetNode.rotation = target.referencePoseLocalTransform.rotation;
        targetNode.scale = target.referencePoseLocalTransform.scale;

        if (!mapping) {
            return;
        }

        const {
            referencePoseTransform: targetReferenceTransform,
            referencePoseLocalTransform: targetReferenceLocalTransform,
        } = target;

        const {
            node: sourceNode,
            referencePoseTransform: sourceReferenceTransform,
            referencePoseLocalTransform: sourceReferenceLocalTransform,
        } = mapping.source;

        const sourceNodeSkeletonSpaceTransform = Object.freeze(accumulateLocalTransformsUtil(sourceNode, sourceOrigin));
        // const sourceNodeSkeletonSpaceTransform = sourceReferenceTransform;

        if (isDebuggingSource) {
            const sourceNodeLocalTransform = inverseAccumulateTransforms(
                new Transform(), sourceNodeSkeletonSpaceTransform, sourceNode, sourceOrigin);
            if (DEBUG) {
                if (!Transform.equals(sourceNodeLocalTransform, new Transform(sourceNode.position, sourceNode.rotation, sourceNode.scale))) {
                    debugger;
                }
            }
            targetNode.rotation = sourceNodeLocalTransform.rotation;
            targetNode.position = sourceNodeLocalTransform.position;
            targetNode.scale = sourceNodeLocalTransform.scale;
            return;
        }

        const targetNodeSkeletonSpaceTransform = Transform.copy(new Transform(), targetReferenceTransform);

        enum DebugKind { targetRef, sourceRef, sourceAnim };
        const debugKind = DebugKind.sourceAnim as DebugKind;

        // Align. Now come to source skeleton space.
        // align(targetNodeSkeletonSpaceTransform);

        // targetNodeSkeletonSpaceTransform.scaleWith(100);
        // align(targetNodeSkeletonSpaceTransform);

        // Handle rotation.
        {
            const targetNodeSkeletonSpaceRotation = targetNodeSkeletonSpaceTransform.rotation;

            // // Target joint local space.
            // Quat.identity(targetNodeSkeletonSpaceRotation);

            // // Target skeleton space.
            // Quat.multiply(targetNodeSkeletonSpaceRotation, targetReferenceTransform.rotation, targetNodeSkeletonSpaceRotation);
            
            if (debugKind === DebugKind.targetRef) {
                
            } else {
                // To source joint local space.
                Quat.multiply(targetNodeSkeletonSpaceRotation,
                    Quat.invert(new Quat(), sourceReferenceTransform.rotation), targetNodeSkeletonSpaceRotation);
                if (debugKind === DebugKind.sourceRef) {
                    Quat.multiply(targetNodeSkeletonSpaceRotation, sourceReferenceTransform.rotation, targetNodeSkeletonSpaceRotation);
                } else {
                    Quat.multiply(targetNodeSkeletonSpaceRotation, sourceNodeSkeletonSpaceTransform.rotation, targetNodeSkeletonSpaceRotation);
                }
            }

            Quat.normalize(targetNodeSkeletonSpaceRotation, targetNodeSkeletonSpaceRotation);
        }

        // Handle position
        if (debugKind === DebugKind.sourceAnim) {
            const targetRefPoseLength = targetReferenceTransform.position.length();
            const sourceRefPoseLength = sourceReferenceTransform.position.length();
            if (sourceRefPoseLength > 1e-5) {
                Vec3.multiplyScalar(targetNodeSkeletonSpaceTransform.position, sourceNodeSkeletonSpaceTransform.position, targetRefPoseLength / sourceRefPoseLength);
            }
        } else if (debugKind === DebugKind.sourceRef) {
            const targetRefPoseLength = targetReferenceTransform.position.length();
            const sourceRefPoseLength = sourceReferenceTransform.position.length();
            if (sourceRefPoseLength > 1e-5) {
                Vec3.multiplyScalar(targetNodeSkeletonSpaceTransform.position, sourceReferenceTransform.position, targetRefPoseLength / sourceRefPoseLength);
            }
        }

        {
            const targetNodeLocalTransform = inverseAccumulateTransforms(
                new Transform(), targetNodeSkeletonSpaceTransform, targetNode, targetOrigin);
            if (debugKind === DebugKind.targetRef) {
                if (!Transform.equals(targetNodeLocalTransform, targetReferenceLocalTransform)) {
                    debugger;
                }
            }
            targetNode.rotation = targetNodeLocalTransform.rotation;
            targetNode.position = targetNodeLocalTransform.position;
            targetNode.scale = targetNodeLocalTransform.scale;
        }
    }
}

class BoneInstance {
    constructor(
        public node: Node,
        public referencePoseTransform: Readonly<Transform>,
        public referencePoseLocalTransform: Readonly<Transform>,
    ) {
        if (DEBUG) {
            Object.freeze(referencePoseTransform);
            Object.freeze(referencePoseLocalTransform);
        }
    }
}

function accumulateLocalTransformsUtil(from: Node, to: Node) {
    const transform = new Transform(Vec3.ZERO, Quat.IDENTITY, Vec3.ONE);
    for (let node = from; node; node = node.parent) {
        if (node === to) {
            return transform;
        }
        const p = new Transform(node.position, node.rotation, node.scale);
        Transform.multiply(transform, p, transform);
    }
    throw new Error(`${to.getPathInHierarchy()} is not a ancestor of ${from.getPathInHierarchy()}`);
}

function inverseAccumulateTransforms(out: Transform, transform: Transform, from: Node, to: Node) {
    const parentAbsoluteTransform = accumulateLocalTransformsUtil(from.parent, to);
    const p = parentAbsoluteTransform.toMat(new Mat4());
    const c = Mat4.multiply(new Mat4(), Mat4.invert(new Mat4(), p), transform.toMat(new Mat4()));
    if (DEBUG) {
        const result_ = Transform.fromMat(new Transform(), c);
        if (!Transform.equals(Transform.multiply(new Transform(), parentAbsoluteTransform, result_), transform)) {
            debugger;
        }
    }
    const result = Transform.fromMat(out, c);
    return result;
}

class Transform {
    public constructor(
        position: Vec3 = Vec3.ZERO,
        rotation: Quat = Quat.IDENTITY,
        scale: Vec3 = Vec3.ONE,
    ) {
        Vec3.copy(this.position, position);
        Quat.copy(this.rotation, rotation);
        Vec3.copy(this.scale, scale);
    }

    readonly position = new Vec3();
    readonly rotation = new Quat();
    readonly scale = new Vec3();

    public static copy(out: Transform, a: Transform) {
        Vec3.copy(out.position, a.position);
        Quat.copy(out.rotation, a.rotation);
        Vec3.copy(out.scale, a.scale);
        return out;
    }

    public static equals(a: Readonly<Transform>, b: Readonly<Transform>, epsilon?: number) {
        return Vec3.equals(a.position, b.position, epsilon) &&
            Vec3.equals(a.scale, b.scale, epsilon) &&
            (Quat.equals(a.rotation, b.rotation, epsilon) || Quat.equals(a.rotation, new Quat(-b.rotation.x, -b.rotation.y, -b.rotation.z, -b.rotation.w), epsilon));
    }

    public toMat(out: Mat4) {
        return Mat4.fromSRT(out, this.rotation, this.position, this.scale);
    }

    public static fromMat(out: Transform, mat: Mat4) {
        Mat4.toSRT(mat, out.rotation, out.position, out.scale);
        return out;
    }

    public static multiply(out: Transform, a: Transform, b: Transform) {
        const ma = a.toMat(new Mat4());
        const mb = b.toMat(new Mat4());
        const m = Mat4.multiply(new Mat4(), ma, mb);
        return Transform.fromMat(out, m);
    }

    public scaleWith(scale: number) {
        Vec3.multiplyScalar(this.position, this.position, scale);
        Vec3.multiplyScalar(this.scale, this.scale, scale);
        return this;
    }

    public rotate(rotation: Readonly<Quat>) {
        Quat.multiply(this.rotation, rotation, this.rotation);
        Vec3.transformQuat(this.position, this.position, rotation);
    }
}

const getBindPoseOfNode = (node: Node, skeleton: Skeleton) => {
    const i = skeleton.joints.findIndex((j) => j.endsWith(node.name));
    if (i < 0) {
        return undefined;
    }
    return Mat4.clone(skeleton.inverseBindposes[i]);
};

const getLocalBindPoseOfNode = (node: Node, skeleton: Skeleton) => {
    const i = skeleton.joints.findIndex((j) => j.endsWith(node.name));
    if (i < 0) {
        return undefined;
    }
    const parent = node.parent;
    const iParent = !parent ? -1 : skeleton.joints.findIndex((j) => j.endsWith(parent.name));
    if (iParent < 0) {
        return Mat4.clone(skeleton.inverseBindposes[i]);
    } else {
        const bindPoseLocal = Mat4.clone(skeleton.inverseBindposes[i]);
        const bindPoseParentInverse = Mat4.invert(new Mat4(), skeleton.inverseBindposes[iParent]);
        Mat4.multiply(bindPoseLocal, bindPoseParentInverse, bindPoseLocal);
        return bindPoseLocal;
    }
};

function* visit(node: Node): Generator<Node> {
    yield node;
    for (const child of node.children) {
        yield* visit(child);
    }
}

function findNodeByName(node: Node, name: string): Node | undefined {
    if (node.name === name) {
        return node;
    }
    for (const child of node.children) {
        const found = findNodeByName(child, name);
        if (found) {
            return found;
        }
    }
    return undefined;
}

const deltaQuat = (() => {
    const quatMultiInvInverseCache = new Quat();
    return (out: Quat, from: Quat, to: Quat) => {
        const fromInv = Quat.invert(quatMultiInvInverseCache, from);
        return Quat.multiply(out, to, fromInv);
    };
})();
