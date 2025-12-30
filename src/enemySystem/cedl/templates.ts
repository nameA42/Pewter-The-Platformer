// CEDL Template Library - Pre-built enemy archetypes
// These templates can be referenced by name and customized with overrides

export interface CEDLTemplate {
  name: string;
  description: string;
  tags: string[];
  cedl: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATROL GUARD - Walks back and forth, chases when player is close
// ═══════════════════════════════════════════════════════════════════════════════
const PATROL_GUARD: CEDLTemplate = {
  name: "Patrol Guard",
  description:
    "A ground enemy that patrols an area and chases the player when they get too close. Returns to patrolling if player escapes.",
  tags: ["ground", "melee", "patrol", "chase"],
  cedl: `enemy:
  name: "Patrol Guard"
  stats:
    health: 10
    speed: 60
    damage_on_contact: 1
  behavior:
    initial_state: "patrol"
    states:
      - name: "patrol"
        actions:
          - type: "patrol"
            distance: 4
        transitions:
          - condition: "player_distance < 120"
            target: "chase"
      - name: "chase"
        actions:
          - type: "move_toward_player"
            speed_multiplier: 1.5
        transitions:
          - condition: "player_distance > 200"
            target: "patrol"
  looks:
    base_sprite: 7
    tint: 0x44aa44
    scale: 1.0`,
};

// ═══════════════════════════════════════════════════════════════════════════════
// TURRET - Stationary enemy that shoots at the player
// ═══════════════════════════════════════════════════════════════════════════════
const TURRET: CEDLTemplate = {
  name: "Turret",
  description:
    "A stationary enemy that shoots projectiles at the player when in range. Cannot move but has good range.",
  tags: ["stationary", "ranged", "shooter"],
  cedl: `enemy:
  name: "Turret"
  stats:
    health: 15
    speed: 0
    damage_on_contact: 1
  projectiles:
    - name: "turret_shot"
      damage: 2
      speed: 200
      size: 6
      lifetime: 3000
      sprite_frame: 0
  behavior:
    initial_state: "idle"
    states:
      - name: "idle"
        transitions:
          - condition: "player_distance < 180"
            target: "shooting"
      - name: "shooting"
        actions:
          - type: "shoot"
            projectile: "turret_shot"
            rate: 40
        transitions:
          - condition: "player_distance > 220"
            target: "idle"
  looks:
    base_sprite: 6
    tint: 0x666666
    scale: 1.0`,
};

// ═══════════════════════════════════════════════════════════════════════════════
// CHARGER - Rushes at the player when spotted, then rests
// ═══════════════════════════════════════════════════════════════════════════════
const CHARGER: CEDLTemplate = {
  name: "Charger",
  description:
    "An aggressive enemy that spots the player and charges at high speed. Needs to rest after charging.",
  tags: ["ground", "melee", "aggressive", "fast"],
  cedl: `enemy:
  name: "Charger"
  stats:
    health: 8
    speed: 40
    damage_on_contact: 3
  behavior:
    initial_state: "idle"
    states:
      - name: "idle"
        actions:
          - type: "wait"
        transitions:
          - condition: "player_distance < 150"
            target: "windup"
      - name: "windup"
        actions:
          - type: "tint"
            color: 0xff4444
          - type: "scale"
            value: 1.2
        transitions:
          - condition: "timer > 500"
            target: "charge"
      - name: "charge"
        actions:
          - type: "move_toward_player"
            speed_multiplier: 4.0
        transitions:
          - condition: "timer > 1500"
            target: "rest"
          - condition: "player_distance < 20"
            target: "rest"
      - name: "rest"
        actions:
          - type: "tint"
            color: 0xaaaaaa
          - type: "scale"
            value: 0.9
          - type: "wait"
        transitions:
          - condition: "timer > 2000"
            target: "idle"
  looks:
    base_sprite: 7
    tint: 0xcc4400
    scale: 1.1`,
};

// ═══════════════════════════════════════════════════════════════════════════════
// FLYER - Flying enemy that swoops down at the player
// ═══════════════════════════════════════════════════════════════════════════════
const FLYER: CEDLTemplate = {
  name: "Flyer",
  description:
    "An airborne enemy that hovers and swoops down to attack, then retreats back up. Ignores gravity.",
  tags: ["flying", "melee", "swooping"],
  cedl: `enemy:
  name: "Flyer"
  stats:
    health: 6
    speed: 80
    damage_on_contact: 2
  behavior:
    initial_state: "hover"
    states:
      - name: "hover"
        actions:
          - type: "patrol"
            distance: 2
        transitions:
          - condition: "player_distance < 100"
            target: "swoop"
          - condition: "timer > 3000"
            target: "hover"
      - name: "swoop"
        actions:
          - type: "move_toward_player"
            speed_multiplier: 2.5
        transitions:
          - condition: "timer > 1000"
            target: "retreat"
          - condition: "player_distance < 16"
            target: "retreat"
      - name: "retreat"
        actions:
          - type: "move_away_from_player"
            speed_multiplier: 2.0
        transitions:
          - condition: "timer > 1500"
            target: "hover"
  looks:
    base_sprite: 6
    tint: 0x8866ff
    scale: 0.9`,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SNIPER - Long-range enemy that fires powerful shots from a distance
// ═══════════════════════════════════════════════════════════════════════════════
const SNIPER: CEDLTemplate = {
  name: "Sniper",
  description:
    "A long-range enemy that fires powerful, accurate shots from far away. Retreats if player gets too close.",
  tags: ["stationary", "ranged", "long-range", "high-damage"],
  cedl: `enemy:
  name: "Sniper"
  stats:
    health: 8
    speed: 40
    damage_on_contact: 1
  projectiles:
    - name: "sniper_round"
      damage: 5
      speed: 400
      size: 4
      lifetime: 4000
      sprite_frame: 0
  behavior:
    initial_state: "watching"
    states:
      - name: "watching"
        transitions:
          - condition: "player_distance < 300"
            target: "aiming"
          - condition: "player_distance < 80"
            target: "flee"
      - name: "aiming"
        actions:
          - type: "tint"
            color: 0xff0000
        transitions:
          - condition: "timer > 1000"
            target: "fire"
          - condition: "player_distance < 80"
            target: "flee"
          - condition: "player_distance > 320"
            target: "watching"
      - name: "fire"
        actions:
          - type: "shoot"
            projectile: "sniper_round"
            rate: 60
        transitions:
          - condition: "timer > 200"
            target: "cooldown"
      - name: "cooldown"
        actions:
          - type: "tint"
            color: 0x666666
        transitions:
          - condition: "timer > 2000"
            target: "watching"
      - name: "flee"
        actions:
          - type: "move_away_from_player"
            speed_multiplier: 1.5
        transitions:
          - condition: "player_distance > 120"
            target: "watching"
  looks:
    base_sprite: 6
    tint: 0x224488
    scale: 0.85`,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SHOTGUNNER - Fires spread shots at medium range
// ═══════════════════════════════════════════════════════════════════════════════
const SHOTGUNNER: CEDLTemplate = {
  name: "Shotgunner",
  description:
    "A medium-range enemy that fires spread shots. Deadly up close but less accurate at range.",
  tags: ["ground", "ranged", "spread", "medium-range"],
  cedl: `enemy:
  name: "Shotgunner"
  stats:
    health: 12
    speed: 35
    damage_on_contact: 2
  projectiles:
    - name: "buckshot"
      damage: 1
      speed: 180
      size: 5
      lifetime: 1200
      sprite_frame: 1
      pattern:
        type: "spread"
        spread_count: 5
        spread_angle: 50
  behavior:
    initial_state: "patrol"
    states:
      - name: "patrol"
        actions:
          - type: "patrol"
            distance: 3
        transitions:
          - condition: "player_distance < 120"
            target: "attack"
      - name: "attack"
        actions:
          - type: "shoot"
            projectile: "buckshot"
            rate: 25
        transitions:
          - condition: "player_distance > 150"
            target: "patrol"
          - condition: "timer > 3000"
            target: "reload"
      - name: "reload"
        actions:
          - type: "tint"
            color: 0x888888
        transitions:
          - condition: "timer > 1500"
            target: "patrol"
  looks:
    base_sprite: 7
    tint: 0x885522
    scale: 1.1`,
};

// ═══════════════════════════════════════════════════════════════════════════════
// BULLET HELL - Fires circular patterns of projectiles
// ═══════════════════════════════════════════════════════════════════════════════
const BULLET_HELL: CEDLTemplate = {
  name: "Bullet Hell",
  description:
    "A dangerous enemy that fires circular waves of projectiles. Stay mobile to avoid the patterns!",
  tags: ["stationary", "ranged", "circular", "boss-like"],
  cedl: `enemy:
  name: "Bullet Hell"
  stats:
    health: 30
    speed: 20
    damage_on_contact: 3
  projectiles:
    - name: "orb"
      damage: 1
      speed: 80
      size: 8
      lifetime: 4000
      sprite_frame: 2
      pattern:
        type: "circular"
        circular_count: 12
  behavior:
    initial_state: "charge"
    states:
      - name: "charge"
        actions:
          - type: "tint"
            color: 0xff00ff
          - type: "scale"
            value: 1.2
        transitions:
          - condition: "timer > 1500"
            target: "blast"
      - name: "blast"
        actions:
          - type: "shoot"
            projectile: "orb"
            rate: 40
          - type: "scale"
            value: 1.0
        transitions:
          - condition: "timer > 500"
            target: "cooldown"
      - name: "cooldown"
        actions:
          - type: "tint"
            color: 0x884488
        transitions:
          - condition: "timer > 2000"
            target: "charge"
  looks:
    base_sprite: 6
    tint: 0xaa00aa
    scale: 1.3`,
};

// ═══════════════════════════════════════════════════════════════════════════════
// HOMING DRONE - Fires slow homing missiles
// ═══════════════════════════════════════════════════════════════════════════════
const HOMING_DRONE: CEDLTemplate = {
  name: "Homing Drone",
  description:
    "A flying enemy that launches slow-moving homing missiles. The missiles track the player but can be outrun.",
  tags: ["flying", "ranged", "homing", "tracking"],
  cedl: `enemy:
  name: "Homing Drone"
  stats:
    health: 10
    speed: 50
    damage_on_contact: 1
  projectiles:
    - name: "seeker_missile"
      damage: 3
      speed: 70
      size: 7
      lifetime: 5000
      sprite_frame: 3
      pattern:
        type: "homing"
        homing_strength: 0.4
        homing_delay: 300
  behavior:
    initial_state: "patrol"
    states:
      - name: "patrol"
        actions:
          - type: "patrol"
            distance: 3
        transitions:
          - condition: "player_distance < 200"
            target: "lock_on"
      - name: "lock_on"
        actions:
          - type: "tint"
            color: 0xff0000
        transitions:
          - condition: "timer > 800"
            target: "fire"
          - condition: "player_distance > 250"
            target: "patrol"
      - name: "fire"
        actions:
          - type: "shoot"
            projectile: "seeker_missile"
            rate: 20
        transitions:
          - condition: "timer > 500"
            target: "cooldown"
      - name: "cooldown"
        actions:
          - type: "tint"
            color: 0x446688
        transitions:
          - condition: "timer > 3000"
            target: "patrol"
  looks:
    base_sprite: 6
    tint: 0x4488aa
    scale: 0.9`,
};

// ═══════════════════════════════════════════════════════════════════════════════
// BERSERKER - Becomes more dangerous as health decreases
// ═══════════════════════════════════════════════════════════════════════════════
const BERSERKER: CEDLTemplate = {
  name: "Berserker",
  description:
    "An enemy that becomes faster and more aggressive as it takes damage. Dangerous when cornered!",
  tags: ["ground", "melee", "enrage", "scaling"],
  cedl: `enemy:
  name: "Berserker"
  stats:
    health: 25
    speed: 50
    damage_on_contact: 2
  behavior:
    initial_state: "normal"
    states:
      - name: "normal"
        actions:
          - type: "patrol"
            distance: 3
          - type: "tint"
            color: 0x44aa44
        transitions:
          - condition: "player_distance < 100"
            target: "chase"
          - condition: "health < 15"
            target: "angry"
      - name: "chase"
        actions:
          - type: "move_toward_player"
            speed_multiplier: 1.3
        transitions:
          - condition: "player_distance > 150"
            target: "normal"
          - condition: "health < 15"
            target: "angry"
      - name: "angry"
        actions:
          - type: "tint"
            color: 0xff8800
          - type: "scale"
            value: 1.1
          - type: "move_toward_player"
            speed_multiplier: 1.8
        transitions:
          - condition: "health < 8"
            target: "berserk"
      - name: "berserk"
        actions:
          - type: "tint"
            color: 0xff0000
          - type: "scale"
            value: 1.3
          - type: "move_toward_player"
            speed_multiplier: 3.0
  looks:
    base_sprite: 7
    tint: 0x44aa44
    scale: 1.0`,
};

// ═══════════════════════════════════════════════════════════════════════════════
// TELEPORTER - Disappears and reappears near the player
// ═══════════════════════════════════════════════════════════════════════════════
const TELEPORTER: CEDLTemplate = {
  name: "Teleporter",
  description:
    "A tricky enemy that phases in and out, appearing near the player unexpectedly.",
  tags: ["ground", "melee", "teleport", "tricky"],
  cedl: `enemy:
  name: "Teleporter"
  stats:
    health: 8
    speed: 100
    damage_on_contact: 2
  behavior:
    initial_state: "visible"
    states:
      - name: "visible"
        actions:
          - type: "move_toward_player"
            speed_multiplier: 0.8
          - type: "tint"
            color: 0x6666ff
        transitions:
          - condition: "timer > 2000"
            target: "fade_out"
          - condition: "player_distance < 30"
            target: "fade_out"
      - name: "fade_out"
        actions:
          - type: "tint"
            color: 0x222244
          - type: "scale"
            value: 0.5
        transitions:
          - condition: "timer > 500"
            target: "teleport"
      - name: "teleport"
        actions:
          - type: "move_toward_player"
            speed_multiplier: 8.0
        transitions:
          - condition: "timer > 200"
            target: "fade_in"
      - name: "fade_in"
        actions:
          - type: "scale"
            value: 1.0
          - type: "tint"
            color: 0xaaaaff
        transitions:
          - condition: "timer > 300"
            target: "visible"
  looks:
    base_sprite: 6
    tint: 0x6666ff
    scale: 0.8`,
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════
export const CEDL_TEMPLATES: Map<string, CEDLTemplate> = new Map([
  ["patrol_guard", PATROL_GUARD],
  ["patrolguard", PATROL_GUARD],
  ["guard", PATROL_GUARD],
  ["turret", TURRET],
  ["charger", CHARGER],
  ["rusher", CHARGER],
  ["flyer", FLYER],
  ["flying", FLYER],
  ["swooper", FLYER],
  ["sniper", SNIPER],
  ["shotgunner", SHOTGUNNER],
  ["shotgun", SHOTGUNNER],
  ["bullet_hell", BULLET_HELL],
  ["bullethell", BULLET_HELL],
  ["homing_drone", HOMING_DRONE],
  ["homingdrone", HOMING_DRONE],
  ["drone", HOMING_DRONE],
  ["berserker", BERSERKER],
  ["enrager", BERSERKER],
  ["teleporter", TELEPORTER],
  ["blinker", TELEPORTER],
]);

// Get all unique templates (for listing)
export function getAllTemplates(): CEDLTemplate[] {
  const seen = new Set<string>();
  const templates: CEDLTemplate[] = [];

  for (const template of CEDL_TEMPLATES.values()) {
    if (!seen.has(template.name)) {
      seen.add(template.name);
      templates.push(template);
    }
  }

  return templates;
}

// Get a template by name (case-insensitive, handles spaces/underscores)
export function getTemplate(name: string): CEDLTemplate | undefined {
  const normalized = name.toLowerCase().replace(/[\s-]/g, "_");
  return CEDL_TEMPLATES.get(normalized);
}

// Get template names for documentation
export function getTemplateNames(): string[] {
  return getAllTemplates().map((t) => t.name);
}

// Get template summary for LLM context
export function getTemplateSummary(): string {
  const templates = getAllTemplates();
  return templates.map((t) => `- ${t.name}: ${t.description}`).join("\n");
}
