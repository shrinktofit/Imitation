import { _decorator, animation, CCClass, Component, Node, instantiate, warn, Vec3, Quat, error } from 'cc';
import { ChainImitationDefinition, ImitationChain, ImitationDefinition } from './ImitationDefinition';
const { ccclass, property } = _decorator;

const animationGraphRuntimeConstructor =
    CCClass.attr(animation.AnimationController, 'graph').ctor as new () => animation.AnimationGraphRunTime;

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

    start () {
        if (!this.definition.sourceHierarchy) {
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

        for (const def of this.definition.chains) {
            this._addChainImitation(
                imitationSourceNode,
                this.node,
                def,
            );
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

        for (const chainImitation of this._chainImitations) {
            chainImitation.imitate();
        }

        if (this._debuggingSource) {
            if (this.definition.debuggingSourceCopyBeginning) {
                const debuggingSourceOrigin = this._debuggingSource;
                const copyFrom = findNodeByName(sourceOriginNode, this.definition.debuggingSourceCopyBeginning);
                const copyTo = findNodeByName(debuggingSourceOrigin, this.definition.debuggingSourceCopyBeginning);
                if (copyFrom && copyTo) {
                    for (let node = copyFrom, debugNode = copyTo;
                        node !== sourceOriginNode;
                        node = node.parent, debugNode = debugNode.parent
                    ) {
                        debugNode.rotation = node.rotation;
                    }
                }
            }
        }
    }

    private _managedController: animation.AnimationController | undefined = undefined;

    private _sourceOriginNode: Node | undefined = undefined;

    private _chainImitations: ChainImitationInstance[] = [];

    private _debuggingSource: Node | undefined = undefined;

    private _addChainImitation(
        sourceOrigin: Node,
        targetOrigin: Node,
        definition: ChainImitationDefinition,
    ) {
        if (!definition.enabled) {
            return;
        }
        
        const sourceChainNodes = this._instantiateChain(sourceOrigin, definition.source);
        if (!sourceChainNodes) {
            return;
        }

        const targetChainNodes = this._instantiateChain(targetOrigin, definition.target);
        if (!targetChainNodes) {
            return;
        }

        const chainImitationInstance = new ChainImitationInstance(
            new ChainInstance(sourceChainNodes),
            new ChainInstance(targetChainNodes),
        );

        if (this._debuggingSource) {
            const debuggingSourceChainNodes = this._instantiateChain(this._debuggingSource, definition.source);
            if (debuggingSourceChainNodes) {
                chainImitationInstance.debuggingSource = new ChainInstance(debuggingSourceChainNodes);
            }
        }

        this._chainImitations.push(chainImitationInstance);
    }

    private _instantiateChain(origin: Node, definition: ImitationChain) {
        const first = definition.first;
        if (!first) {
            return;
        }
        const last = definition.last ? definition.last : first;
        const firstNode = findNodeByName(origin, first);
        if (!firstNode) {
            error(`Can not find first node ${first} starting from ${origin.getPathInHierarchy()}`);
            return undefined;
        }
        const lastNode = findNodeByName(origin, last);
        if (!lastNode) {
            error(`Can not find last node ${last} starting from ${origin.getPathInHierarchy()}`);
            return undefined;
        }
        const nodes: Node[] = [];
        for (let node = lastNode; ; node = node.parent) {
            if (!node) {
                error(`${lastNode.getPathInHierarchy()} is not a successor node of ${firstNode.getPathInHierarchy()}`);
                return undefined;
            }
            nodes.push(node);
            if (node === firstNode) {
                break;
            }
        }
        nodes.reverse();
        return nodes;
    }
}

class ChainInstance {
    constructor(public nodes: readonly Node[]) {
        this.referencePoseTransforms = nodes.map((node) => {
            return new Transform(
                node.position,
                node.rotation,
                node.scale,
            );
        });
    }

    public readonly referencePoseTransforms: readonly Readonly<Transform>[];
}

class ChainImitationInstance {
    constructor(
        private _source: ChainInstance,
        private _target: ChainInstance,
    ) {
    }

    public imitate() {
        const {
            _source: source,
            _target: target,
            debuggingSource: debuggingSource,
        } = this;
        if (source.nodes.length !== target.nodes.length) {
            return;
        }
        for (let iNode = 0; iNode < source.nodes.length; ++iNode) {
            const sourceNode = source.nodes[iNode];
            const sourceNodeRotation = Quat.clone(sourceNode.rotation);
            // if (sourceNode !== sourceOriginNode) {
            //     for (let node = sourceNode.parent; node !== sourceOriginNode; node = node.parent) {
            //         Quat.multiply(sourceNodeRotation, node.rotation, sourceNodeRotation);
            //     }
            // }

            const sourceReferenceTransform = source.referencePoseTransforms[iNode];
            const targetReferenceTransform = target.referencePoseTransforms[iNode];

            // Anim_t * inv(Ref_t) = Anim_s * inv(Ref_s)
            // Anim_t = Anim_s * inv(Ref_s) * Ref_t

            const targetNodeRotation = Quat.invert(new Quat(), sourceReferenceTransform.rotation);
            Quat.multiply(targetNodeRotation, targetNodeRotation, targetReferenceTransform.rotation);
            Quat.multiply(targetNodeRotation, sourceNode.rotation, targetNodeRotation);

            // Quat.multiply(r, sourceNode.parent.rotation, r);

            const targetNode = target.nodes[iNode];
            targetNode.rotation = targetNodeRotation;

            if (debuggingSource) {
                debuggingSource.nodes[iNode].rotation = sourceNode.rotation;
            }
        }
    }

    public debuggingSource: ChainInstance | undefined;
}

class Transform {
    public constructor(
        position: Vec3,
        rotation: Quat,
        scale: Vec3,
    ) {
        Vec3.copy(this.position, position);
        Quat.copy(this.rotation, rotation);
        Vec3.copy(this.scale, scale);
    }

    readonly position = new Vec3();
    readonly rotation = new Quat();
    readonly scale = new Vec3();
}

function* visitSuccessors(node: Node): Generator<Node> {
    for (const child of node.children) {
        yield child;
        yield* visitSuccessors(child);
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