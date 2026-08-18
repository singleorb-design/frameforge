const semanticTerms = new Set([
    "身份",
    "人物身份",
    "角色身份",
    "身份设定",
    "角色设定",
    "人物设定",
    "角色",
    "人物",
    "镜头",
    "场景",
    "动作",
    "状态",
    "剧情",
    "画面",
    "信息",
    "设定",
    "都废了",
    "废了",
    "废物",
    "配不上",
    "认命",
    "笑话",
    "正常",
]);

const actionPrefix = /^(?:手持|手握|手拿|拿着|握着|捧着|提着|拎着|佩戴|身着|穿着|一身|背着|带着)/;
const objectTerms = new Set(["玉佩", "灵玉", "黑戒", "戒指", "长剑", "婚书", "传讯符", "宝剑", "佩剑"]);
const statePhrasePattern = /(?:废了|废柴|配不上|认命|笑话|正常|受伤|吐血|倒地|倒飞|重伤|震裂)$/;

export function isSemanticCharacterTerm(value: string) {
    const normalized = normalizeCharacterCandidate(value);
    return semanticTerms.has(normalized) || statePhrasePattern.test(normalized);
}

export function isActionOrObjectDescription(value: string) {
    return actionPrefix.test(value) || objectTerms.has(normalizeCharacterCandidate(value));
}

export function isInvalidCharacterCandidate(value: string) {
    return isSemanticCharacterTerm(value) || isActionOrObjectDescription(value);
}

export function actionObjectName(value: string) {
    return value.replace(actionPrefix, "") || value;
}

function normalizeCharacterCandidate(value: string) {
    return value.replace(/[\s·・._\-:：,，。'"“”‘’]/g, "").toLowerCase();
}
