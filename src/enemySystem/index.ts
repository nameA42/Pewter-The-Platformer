// Main export file for enemy system
export { parseCEDL } from "./cedl/parser";
export type { EnemyDefinition } from "./cedl/schema";
// Type alias for the inner enemy definition (more intuitive for use)
export type InnerEnemyDefinition = EnemyDefinition["enemy"];
export { DynamicEnemy } from "./runtime/DynamicEnemy";
export { EnemyFactory } from "./factory/EnemyFactory";
export { StateMachine } from "./runtime/StateMachine";
export { ProjectileManager } from "./runtime/ProjectileManager";
export { EffectsManager } from "./runtime/EffectsManager";
export { TerrainAwareness } from "./runtime/TerrainAwareness";
export type { TerrainInfo } from "./runtime/TerrainAwareness";
// Template library exports
export {
  getTemplate,
  getAllTemplates,
  getTemplateNames,
  getTemplateSummary,
  CEDL_TEMPLATES,
} from "./cedl/templates";
export type { CEDLTemplate } from "./cedl/templates";
