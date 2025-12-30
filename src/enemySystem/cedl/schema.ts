// Zod schema for CEDL validation
import { z } from "zod";

// Shape overlay schema
const ShapeOverlaySchema = z.object({
  type: z.enum(["circle", "rectangle", "triangle"]),
  color: z.number().int().min(0).max(0xffffff),
  alpha: z.number().min(0).max(1).optional(),
  radius: z.number().positive().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});

// Looks schema
const LooksSchema = z.object({
  type: z.enum(["hybrid", "sprite", "procedural"]).optional(),
  base_sprite: z.number().int().min(0).optional(),
  custom_texture: z.string().optional(), // NEW: custom generated texture key
  tint: z.number().int().min(0).max(0xffffff).optional(),
  scale: z.number().positive().optional(),
  shape_overlay: ShapeOverlaySchema.optional(),
});

// Effects schemas
const TrailEffectSchema = z.object({
  enabled: z.boolean(),
  particle: z.string().optional(),
  frequency: z.number().int().min(1).optional(),
});

const DeathEffectSchema = z.object({
  type: z.string(),
  particle_count: z.number().int().min(0).optional(),
  sound: z.string().optional(),
});

const EffectsSchema = z.object({
  trail: TrailEffectSchema.optional(),
  death: DeathEffectSchema.optional(),
});

// Stats schema
const StatsSchema = z.object({
  health: z.number().int().positive(),
  speed: z.number().int().min(0),
  damage_on_contact: z.number().int().min(0).optional(),
});

// Projectile pattern schema
const PatternSchema = z
  .object({
    type: z
      .enum(["single", "spread", "burst", "circular", "homing"])
      .default("single"),
    // Spread pattern options
    spread_count: z.number().int().min(2).max(12).optional(), // Number of projectiles (3, 5, 7, etc.)
    spread_angle: z.number().min(10).max(180).optional(), // Total angle spread in degrees
    // Burst pattern options
    burst_count: z.number().int().min(2).max(10).optional(), // Number of shots in burst
    burst_delay: z.number().int().min(50).max(500).optional(), // Delay between burst shots in ms
    // Circular pattern options
    circular_count: z.number().int().min(4).max(36).optional(), // Number of projectiles in circle
    // Homing options
    homing_strength: z.number().min(0).max(1).optional(), // 0 = no homing, 1 = perfect tracking
    homing_delay: z.number().int().min(0).optional(), // Delay before homing kicks in (ms)
  })
  .optional();

// Projectile schema
const ProjectileSchema = z.object({
  name: z.string().min(1),
  damage: z.number().int().min(0),
  speed: z.number().int().min(0),
  size: z.number().positive().optional(),
  gravity: z.number().optional(),
  lifetime: z.number().int().positive(),
  sprite_frame: z.number().int().min(0),
  pattern: PatternSchema, // NEW: projectile pattern configuration
});

// Action schema - flexible object with type field
const ActionSchema = z
  .object({
    type: z.string(),
  })
  .passthrough(); // Allow additional fields

// Transition schema
const TransitionSchema = z.object({
  condition: z.string().min(1),
  target: z.string().min(1),
});

// State schema
const StateSchema = z.object({
  name: z.string().min(1),
  actions: z.array(ActionSchema).optional(),
  transitions: z.array(TransitionSchema).optional(),
});

// Behavior schema
const BehaviorSchema = z
  .object({
    initial_state: z.string().min(1),
    states: z.array(StateSchema).min(1),
  })
  .refine(
    (data) => {
      // Validate that initial_state exists in states
      return data.states.some((s) => s.name === data.initial_state);
    },
    {
      message: "initial_state must match one of the state names",
    },
  );

// Main enemy schema
const EnemySchema = z.object({
  name: z.string().min(1),
  stats: StatsSchema,
  projectiles: z.array(ProjectileSchema).optional(),
  behavior: BehaviorSchema,
  effects: EffectsSchema.optional(),
  looks: LooksSchema.optional(),
});

// Root CEDL schema
export const CEDLSchema = z.object({
  enemy: EnemySchema,
});

// Type exports
export type EnemyDefinition = z.infer<typeof CEDLSchema>;
export type StatsDefinition = z.infer<typeof StatsSchema>;
export type ProjectileDefinition = z.infer<typeof ProjectileSchema>;
export type BehaviorDefinition = z.infer<typeof BehaviorSchema>;
export type StateDefinition = z.infer<typeof StateSchema>;
export type ActionDefinition = z.infer<typeof ActionSchema>;
export type TransitionDefinition = z.infer<typeof TransitionSchema>;
export type EffectsDefinition = z.infer<typeof EffectsSchema>;
export type LooksDefinition = z.infer<typeof LooksSchema>;
export type ShapeOverlay = z.infer<typeof ShapeOverlaySchema>;
