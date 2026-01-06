# New Features: LLM Enemy Generation System

## 🎉 What's New

The platformer editor now supports **dynamic enemy generation** through a Custom Enemy Definition Language (CEDL), enabling the LLM assistant (Pewter) to create fully customizable enemies on the fly.

### Latest Updates:

- ✅ **Enemy Modification System** - Modify existing enemies by unique name (stats, looks, behavior, projectiles)
- ✅ **Unique Enemy Naming** - Automatic unique naming system (e.g., "Slime", "Slime 1", "Slime 2")
- ✅ **AI Sprite Generation** - Optional PixelLab API integration for custom enemy sprites
- ✅ **API Credit Protection** - Toggle button to prevent accidental API usage
- ✅ **Streamlined Tools** - Single `generateEnemy` tool handles everything
- ✅ **Auto Debug Off** - Debug overlay turns off when exiting play mode

---

## ✨ Key Features

### 1. **Custom Enemy Definition Language (CEDL)**

A YAML-based language that defines enemy properties:

- **Human-readable** format that LLMs can generate reliably
- **Validated** with detailed error messages for iterative improvement
- **Structured** following principles from research on LLM rule understanding

### 2. **Flexible Stat System**

Define enemy attributes:

- Health points
- Movement speed
- Contact damage
- All configurable per enemy instance

### 3. **State Machine Behaviors**

Create complex AI patterns with:

- **Multiple States:** idle, patrol, chase, attack, rage, etc.
- **State Transitions:** Condition-based movement between states
- **State Actions:** What the enemy does in each state
- **Timers:** Track how long enemy has been in current state

**Supported Actions (Basic):**

- Patrol (back and forth movement)
- Move toward player (chase)
- Move away from player (flee)
- Shoot projectiles
- Jump
- Visual changes (tint, scale)
- Wait/delay

**Supported Conditions (Basic):**

- Player distance checks
- Health thresholds
- Timer-based conditions
- Player position (left/right)
- Random probability checks

### 4. **Multiple Projectile Types**

Each enemy can define multiple projectile types:

- Damage values
- Speed and direction
- Size customization
- Gravity effects
- Lifetime/duration
- Sprite frame selection

### 5. **Visual Effects System**

- **Trails:** Particle effects that follow the enemy
- **Death Effects:** Explosion animations on enemy death
- **Customizable frequency and intensity**

### 6. **Hybrid Looks System**

Combine multiple visual approaches:

- **Sprite Selection:** Choose from existing tilemap frames
- **Color Tinting:** Apply hex color tints
- **Scaling:** Adjust enemy size
- **Procedural Overlays:** Add geometric shapes (circles, rectangles, triangles)
- All combinable for unique visual styles

### 7. **Integration with Existing Systems**

- **WorldFacts:** Custom enemies are tracked in the world facts system
- **Selection Boxes:** Works within selection boundaries
- **Editor/Play Mode:** Enemies behave correctly in both modes
- **Collision System:** Full physics integration

---

## 🆕 Latest Features (v2.0)

### 🎯 8. **Projectile Patterns**

Advanced projectile behaviors for varied attack styles:

| Pattern      | Description              | Parameters                                         |
| ------------ | ------------------------ | -------------------------------------------------- |
| **Single**   | Default single shot      | -                                                  |
| **Spread**   | Shotgun-style multi-shot | `spread_count` (3-12), `spread_angle` (10-180°)    |
| **Burst**    | Rapid fire succession    | `burst_count` (2-10), `burst_delay` (50-500ms)     |
| **Circular** | Bullet hell ring pattern | `circular_count` (4-36)                            |
| **Homing**   | Tracks the player        | `homing_strength` (0-1), `homing_delay` (0-1000ms) |

**Example:**

```yaml
projectiles:
  - name: "shotgun_blast"
    damage: 1
    speed: 180
    lifetime: 1500
    sprite_frame: 1
    pattern:
      type: "spread"
      spread_count: 5
      spread_angle: 60
```

---

### 📚 9. **CEDL Template Library**

Pre-built enemy archetypes for quick creation and customization:

| Template         | Description                                | Tags                |
| ---------------- | ------------------------------------------ | ------------------- |
| **Patrol Guard** | Walks back and forth, chases when close    | Ground, Melee       |
| **Turret**       | Stationary, shoots at player when in range | Ranged, Stationary  |
| **Charger**      | Rushes at player at high speed             | Fast, Aggressive    |
| **Flyer**        | Airborne, swoops down to attack            | Flying, Swooping    |
| **Sniper**       | Long-range shooter, retreats if close      | Long-range          |
| **Shotgunner**   | Fires spread shots at medium range         | Ranged, Spread      |
| **Bullet Hell**  | Fires circular waves of projectiles        | Circular, Boss-like |
| **Homing Drone** | Launches slow homing missiles              | Flying, Tracking    |
| **Berserker**    | Gets faster/stronger as health decreases   | Scaling             |
| **Teleporter**   | Phases in/out, appears unexpectedly        | Tricky              |

**Usage:**

```
"Create a Turret at position (10, 5)"
"Make a fast Charger with 20 health and red tint"
"Place a Bullet Hell boss with 100 HP"
```

**Template Customization:**
Templates can be customized by overriding specific properties:

```yaml
template: "Patrol Guard"
cedl_code: |
  enemy:
    name: "Elite Guard"
    stats:
      health: 25
      speed: 80
    looks:
      tint: 0xff0000
```

---

### 🗺️ 10. **Environmental Awareness**

Enemies can now respond intelligently to terrain!

**Environmental Actions:**

| Action             | Description                          | Parameters              |
| ------------------ | ------------------------------------ | ----------------------- |
| `smart_patrol`     | Patrol that avoids pits & walls      | `distance` (tiles)      |
| `avoid_pit`        | Turn around at pit edges             | -                       |
| `jump_to_platform` | Jump to reach platforms above        | `max_height` (tiles)    |
| `seek_cover`       | Move toward nearby walls/cover       | -                       |
| `lure_to_hazard`   | Position to trap player near hazards | -                       |
| `flee_from_hazard` | Move away from spikes/lava           | -                       |
| `ambush`           | Hide and attack when player is close | `trigger_distance` (px) |
| `drop_attack`      | Drop from platforms to attack below  | -                       |

**Terrain Conditions:**

| Condition                 | Description                   |
| ------------------------- | ----------------------------- |
| `pit_ahead == 1`          | Pit detected in front         |
| `pit_distance < N`        | Distance to pit edge (pixels) |
| `wall_ahead == 1`         | Wall blocking path            |
| `platform_above == 1`     | Reachable platform above      |
| `platform_distance < N`   | Distance to platform          |
| `cover_nearby == 1`       | Cover/wall available          |
| `hazard_nearby == 1`      | Spikes/lava detected          |
| `player_near_hazard == 1` | Player close to hazard        |
| `on_ground == 1`          | Enemy on solid ground         |

**Example: Smart Patroller**

```yaml
behavior:
  initial_state: "patrol"
  states:
    - name: "patrol"
      actions:
        - type: "smart_patrol" # Auto-avoids pits!
          distance: 5
      transitions:
        - condition: "pit_ahead == 1"
          target: "turn_around"
```

---

### 🔍 11. **State Debug Overlay**

Real-time debugging for enemy AI:

- Press **G** to toggle debug overlay (play mode only)
- Shows current state name
- Displays health bar with color coding
- Shows distance to player
- Displays state timer
- Shows next potential transition
- **Auto-disables** when exiting play mode (press Q)

---

### ✏️ 13. **Enemy Modification System**

Modify existing enemies without recreating them:

**Key Features:**

- **Unique Naming System** - Every enemy gets a unique name automatically
  - First enemy: "Slime"
  - Duplicate names get numbered: "Slime 1", "Slime 2", etc.
  - No two enemies can have the same name

- **Modify Enemy Tool** - Change enemy properties using partial CEDL:
  - **Stats** (health, speed, damage_on_contact) - Updated in-place
  - **Looks** (tint, scale, sprite, custom_texture) - Updated in-place
  - **Projectiles** - Requires recreation (preserves position)
  - **Behavior** - Requires recreation (preserves position)
  - **Name** - Can rename enemies (ensures uniqueness)

- **Smart Update Logic:**
  - Simple changes (stats, looks) → Instant in-place updates
  - Complex changes (behavior, projectiles) → Automatic recreation

**Usage Examples:**

```
"Make that Turret shoot faster"      → Updates fire rate
"Give the Sniper more health"        → Updates health stat
"Change Charger's color to red"      → Updates tint
"Make Slime 1 move faster"           → Updates speed
```

**Natural Language Support:**
The LLM automatically converts natural language requests to CEDL updates, so you can just describe what you want changed!

---

### 🎨 12. **AI Sprite Generation (Optional)**

Generate custom pixel art sprites for enemies using PixelLab API:

**Setup:**

1. Add `VITE_PIXELLAB_API_KEY=your_key` to `.env` file
2. Toggle **"API Sprites: ON"** in the editor UI (bottom bar)

**Features:**

- Sprites generated automatically when creating enemies
- 32x32 pixel sprites by default (matches player scale)
- Transparent backgrounds for seamless integration
- Cached by description (same enemy type reuses sprite)
- Toggle OFF by default to protect API credits

**Models Used:**

- **Bitforge** - For sprites ≤200x200 (more economical)
- **Pixflux** - For larger sprites (auto-fallback)

**Note:** When toggle is OFF, enemies use default spritesheet sprites instead.

---

## 🆚 Comparison: Before vs After

### Before:

- Only 2 enemy types: `Slime` and `UltraSlime`
- Hard-coded behaviors in TypeScript classes
- No customization without code changes
- Fixed visual appearance
- No terrain awareness

### After:

- **Unlimited enemy types** via CEDL
- **10 pre-built templates** for quick creation
- **Dynamic behaviors** defined at runtime
- **Full customization** through natural language
- **Flexible visuals** with procedural elements
- **5 projectile patterns** for varied attacks
- **Smart terrain awareness** - avoid pits, use cover
- **AI-generated sprites** - unique visuals per enemy type
- **LLM-assisted creation** - just describe what you want
- **Credit protection** - API toggle prevents accidental usage

---

## 🔧 Technical Architecture

### Language Layer

- **CEDL Parser:** YAML parsing with validation
- **Zod Schemas:** Type-safe validation with error reporting
- **Template Library:** Pre-built enemy archetypes
- **Error Feedback:** Detailed messages help LLM fix issues

### Runtime Layer

- **StateMachine:** Executes behavior state machines with terrain conditions
- **ProjectileManager:** Handles patterns (spread, burst, circular, homing)
- **EffectsManager:** Manages visual effects
- **TerrainAwareness:** Detects pits, platforms, cover, hazards
- **DynamicEnemy:** Main enemy class integrating all systems with runtime modification methods
- **SpriteGenerator:** Handles PixelLab API integration for custom sprites
- **EnemyRegistry:** Manages unique enemy naming and lookup

### LLM Integration

- **generateEnemy Tool:** Single tool handles enemy creation + auto sprite generation
- **modifyEnemy Tool:** Modify existing enemies by unique name with partial CEDL updates
- **Template Support:** 10 pre-built archetypes with customization
- **Error Handling:** Validation errors returned to LLM for correction
- **EnemyRegistry:** Tracks enemies by unique names for modification

### UI Controls

- **API Sprites Toggle:** Enable/disable sprite generation (protects API credits)
- **Debug Overlay:** Press G in play mode (auto-disables on exit)

---

## 📈 Benefits

1. **Rapid Prototyping:** Create enemies in seconds via chat
2. **No Code Changes:** All customization through CEDL/YAML
3. **Template Library:** Start with proven archetypes
4. **Smart Enemies:** Terrain-aware behaviors out of the box
5. **Advanced Attacks:** Spread shots, homing missiles, bullet hell
6. **LLM-Powered:** Natural language descriptions → working enemies
7. **Validated:** Type-safe with clear error messages
8. **Debuggable:** Real-time state overlay for testing (auto-off on exit)
9. **Extensible:** Easy to add new actions/conditions
10. **Research-Inspired:** Based on paper on LLM rule understanding
11. **Custom Sprites:** AI-generated pixel art via PixelLab API
12. **Cost Control:** API toggle prevents accidental credit usage

---

## 🎓 Inspired by Research

This system implements concepts from "LLM Game Rule Understanding through Out-of-Distribution Fine-Tuning":

- **Game Description Language (GDL):** CEDL as a structured rule representation
- **Rule Validation:** Schema validation with detailed feedback
- **Step-by-step Explanations:** Error messages enable iterative improvement
- **Generalization:** Predefined actions/conditions allow creative combinations

---

## 🚀 Use Cases

1. **Level Design:** Quickly test different enemy configurations
2. **Gameplay Balancing:** Iterate on stats and behaviors rapidly
3. **Prototyping:** Explore new enemy ideas without code changes
4. **Boss Design:** Create complex multi-phase boss encounters
5. **Enemy Variants:** Create families of related enemies with shared behaviors
6. **Bullet Hell:** Design intricate projectile patterns
7. **Stealth Sections:** Create ambush enemies that use cover
8. **Platforming Challenges:** Smart enemies that navigate platforms

---

## 📝 Example Workflows

### Workflow 1: Quick Template Creation

```
User: "Create a Turret at position (10, 5)"
Pewter: [Uses Turret template → Places enemy]
Result: Stationary shooting enemy appears instantly
```

### Workflow 2: Template Customization

```
User: "Make a Charger with 30 health that's red and faster"
Pewter: [Applies Charger template with overrides → Creates enemy]
Result: Customized charging enemy
```

### Workflow 3: Complex Boss Design

```
User: "Create a boss that has 3 phases..."
Pewter: [Creates multi-state behavior → Places enemy]
Result: Complex boss with phase transitions
```

### Workflow 4: Bullet Hell Enemy

```
User: "Create an enemy that shoots in all directions"
Pewter: [Uses circular pattern projectile → Creates enemy]
Result: Bullet hell style enemy
```

### Workflow 5: Smart Platforming Enemy

```
User: "Create an enemy that patrols but doesn't fall off platforms"
Pewter: [Uses smart_patrol with pit detection → Creates enemy]
Result: Enemy safely navigates platform edges
```

### Workflow 6: Ambush Enemy

```
User: "Create an enemy that hides behind cover and ambushes"
Pewter: [Uses seek_cover and ambush actions → Creates enemy]
Result: Tactical enemy that uses environment
```

### Workflow 7: Custom AI Sprite Enemy

```
User: [Enables "API Sprites: ON" in UI]
User: "Create a robot sniper enemy"
Pewter: [Generates custom robot sprite via PixelLab → Creates enemy]
Result: Enemy with unique AI-generated pixel art sprite
```

### Workflow 8: Modify Existing Enemy

```
User: "Create a Turret at (10, 5)"
Pewter: [Creates Turret enemy]
User: "Make that Turret shoot 3x faster and give it more health"
Pewter: [Modifies Turret's projectiles and stats]
Result: Same Turret, updated properties
```

### Workflow 9: Enemy Renaming & Multiple Instances

```
User: "Create a Slime enemy"
Pewter: [Creates "Slime" enemy]
User: "Create another Slime enemy"
Pewter: [Creates "Slime 1" enemy - automatically numbered]
User: "Change Slime 1's color to green"
Pewter: [Modifies "Slime 1" specifically]
Result: Two Slimes with different appearances
```

---

## 🔮 Future Enhancements (Potential)

- ~~Projectile patterns (spread shots, homing, etc.)~~ ✅ **IMPLEMENTED**
- ~~Template library~~ ✅ **IMPLEMENTED**
- ~~Terrain awareness~~ ✅ **IMPLEMENTED**
- ~~Debug overlay~~ ✅ **IMPLEMENTED**
- ~~AI sprite generation~~ ✅ **IMPLEMENTED** (PixelLab API)
- ~~API credit protection~~ ✅ **IMPLEMENTED** (toggle button)
- ~~Enemy modification system~~ ✅ **IMPLEMENTED** (modifyEnemy tool)
- Animation support
- Sound effect integration
- Enemy-to-enemy interactions
- Formation behaviors
- Save/load enemy definitions
- Wave/spawn system integration

---

## 📊 Feature Summary

| Category                | Features                                                |
| ----------------------- | ------------------------------------------------------- |
| **Base System**         | CEDL, Stats, State Machine, Projectiles, Effects, Looks |
| **Projectile Patterns** | Single, Spread, Burst, Circular, Homing                 |
| **Templates**           | 10 pre-built archetypes (Guard, Turret, Charger, etc.)  |
| **Terrain Awareness**   | 8 actions, 9 conditions                                 |
| **Debugging**           | State overlay (G key), auto-off on play mode exit       |
| **AI Sprites**          | PixelLab API integration, credit protection toggle      |
| **Enemy Modification**  | modifyEnemy tool, unique naming, in-place updates       |
| **UI Controls**         | API toggle, debug toggle, play/edit mode switch         |

---

## 🎮 Quick Reference: UI Controls

| Control                 | Location   | Function                             |
| ----------------------- | ---------- | ------------------------------------ |
| **API Sprites: OFF/ON** | Bottom bar | Toggle AI sprite generation          |
| **G key**               | Play mode  | Toggle debug overlay                 |
| **Q key**               | Play mode  | Exit to editor (auto-disables debug) |
| **Play button**         | Bottom bar | Enter play mode                      |

---

This system transforms enemy creation from a code-level task into a design-level conversation with your AI assistant! 🎮✨
