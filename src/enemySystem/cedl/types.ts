// TypeScript interfaces for CEDL (Custom Enemy Definition Language)

export interface EnemyDefinition {
  enemy: {
    name: string;
    stats: StatsDefinition;
    projectiles?: ProjectileDefinition[];
    behavior: BehaviorDefinition;
    effects?: EffectsDefinition;
    looks?: LooksDefinition;
  };
}

export interface StatsDefinition {
  health: number;
  speed: number;
  damage_on_contact?: number;
}

export interface ProjectilePattern {
  type?: "single" | "spread" | "burst" | "circular" | "homing";
  // Spread pattern
  spread_count?: number;
  spread_angle?: number;
  // Burst pattern
  burst_count?: number;
  burst_delay?: number;
  // Circular pattern
  circular_count?: number;
  // Homing
  homing_strength?: number;
  homing_delay?: number;
}

export interface ProjectileDefinition {
  name: string;
  damage: number;
  speed: number;
  size?: number;
  gravity?: number;
  lifetime: number;
  sprite_frame: number;
  pattern?: ProjectilePattern;
}

export interface BehaviorDefinition {
  initial_state: string;
  states: StateDefinition[];
}

export interface StateDefinition {
  name: string;
  actions?: ActionDefinition[];
  transitions?: TransitionDefinition[];
}

export interface ActionDefinition {
  type: string;
  [key: string]: any; // Additional parameters depend on action type
}

export interface TransitionDefinition {
  condition: string;
  target: string;
}

export interface EffectsDefinition {
  trail?: TrailEffect;
  death?: DeathEffect;
}

export interface TrailEffect {
  enabled: boolean;
  particle?: string;
  frequency?: number;
}

export interface DeathEffect {
  type: string;
  particle_count?: number;
  sound?: string;
}

export interface LooksDefinition {
  type?: "hybrid" | "sprite" | "procedural";
  base_sprite?: number;
  custom_texture?: string; // Custom generated texture key
  tint?: number;
  scale?: number;
  shape_overlay?: ShapeOverlay;
}

export interface ShapeOverlay {
  type: "circle" | "rectangle" | "triangle";
  color: number;
  alpha?: number;
  radius?: number; // For circle
  width?: number; // For rectangle
  height?: number; // For rectangle
}

// Terrain awareness info
export interface TerrainContext {
  // Pit detection
  pitAhead: boolean;
  pitDistance: number;
  pitDepth: number;

  // Platform detection
  platformAbove: boolean;
  platformBelow: boolean;
  platformAboveDistance: number;
  nearestPlatformX: number;
  nearestPlatformY: number;

  // Cover detection
  coverNearby: boolean;
  coverDirection: "left" | "right" | "none";
  coverDistance: number;
  coverX: number;
  coverY: number;

  // Hazard detection
  hazardNearby: boolean;
  hazardType: string;
  hazardDistance: number;
  playerNearHazard: boolean;

  // Ground/Wall info
  onGround: boolean;
  wallAhead: boolean;
  wallDistance: number;
}

// Runtime types
export interface EnemyContext {
  playerDistance: number;
  playerX: number;
  playerY: number;
  playerXRelative: "left" | "right" | "center";
  health: number;
  timer: number;
  position: { x: number; y: number };
  facingDirection: number; // 1 = right, -1 = left
  terrain: TerrainContext;
}
