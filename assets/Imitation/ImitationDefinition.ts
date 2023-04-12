import { _decorator, Component, Node, Vec3, Quat, Prefab, CCString } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('ImitationChain')
class ImitationChain {
    @property
    get first() {
        return this._first;
    }

    set first(value) {
        this._first = value;
    }

    @property({
        visible(this: ImitationChain) {
            return !!this._first;
        }
    })
    get last() {
        return this._last;
    }

    set last(value) {
        this._last = value;
    }

    @property
    private _first = '';

    @property
    private _last = '';
}

@ccclass('ChainImitationDefinition')
class ChainImitationDefinition {
    @property
    enabled = true;

    @property(ImitationChain)
    source = new ImitationChain();

    @property(ImitationChain)
    target = new ImitationChain();
}

@ccclass('ImitationDefinition')
export class ImitationDefinition {
    @property(Prefab)
    sourceHierarchy: Prefab | undefined = undefined;

    @property
    public debuggingSourceCopyBeginning = '';

    @property(ChainImitationDefinition)
    chains: ChainImitationDefinition[] = [];
}

export type {
    ImitationChain,
    ChainImitationDefinition,
};
