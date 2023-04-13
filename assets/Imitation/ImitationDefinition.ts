import { _decorator, Component, Node, Vec3, Quat, Prefab, CCString, JsonAsset } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('ImitationDefinition')
export class ImitationDefinition {
    @property(Prefab)
    sourceHierarchy: Prefab | undefined = undefined;

    @property(JsonAsset)
    public definitionJson: JsonAsset | null = null;
}

export interface ImitationDefinitionJson {
    targetRoot: string;
    mappings: Array<{ source: string; target: string; method?: 'inherited' | 'scaled'; }>;
    includes?: string[];
}
