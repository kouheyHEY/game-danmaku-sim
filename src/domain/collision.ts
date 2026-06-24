import type { EntityId, Faction } from './entities';

/**
 * 衝突は「誰と誰が当たったか」という事実だけを表す。
 * その当たりが良い(得点)か悪い(失点)かは Objective が解釈する。
 */
export type CollisionEvent =
  | { kind: 'bullet-hits-ship'; bullet: EntityId; owner: Faction }
  | { kind: 'bullet-hits-enemy'; bullet: EntityId; enemy: EntityId; owner: Faction };
