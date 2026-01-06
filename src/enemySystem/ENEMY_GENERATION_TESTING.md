# Enemy Generation System - Testing Guide & Features

## 🎯 New Features Overview

The Enemy Generation System adds **Custom Enemy Definition Language (CEDL)**, allowing the LLM (Pewter) to create fully customizable enemies with:

### Core Features:

1. **Custom Stats** - Define health, speed, and contact damage
2. **State Machine Behaviors** - Create complex AI patterns with states and transitions
3. **Multiple Projectiles** - Define different projectile types with unique properties
4. **Visual Effects** - Trails, death explosions, and particle effects
5. **Hybrid Looks System** - Combine sprite frames with procedural overlays and tints
6. **Flexible Actions** - Patrol, chase, flee, shoot, jump, and more
7. **Smart Conditions** - Distance checks, health thresholds, timers, and randomness
8. **AI Sprite Generation** - Optional PixelLab API integration for custom enemy sprites
9. **10 Pre-built Templates** - Quick enemy creation with customizable archetypes
10. **Enemy Modification System** - Modify existing enemies by unique name (NEW!)
11. **Unique Enemy Naming** - Automatic unique naming with duplicate detection (NEW!)

---

## 🚀 How to Start Testing

### 1. Prerequisites

Make sure you have:

- Node.js installed
- A `.env` file with your LLM API key:
  ```env
  VITE_LLM_API_KEY=your_api_key_here
  VITE_LLM_MODEL_NAME=gemini-pro
  ```

### 2. Install Dependencies & Run

```bash
npm install
npm run dev
```

This starts the development server (usually at `http://localhost:5173`).

### 3. Optional: AI Sprite Generation

To enable AI-generated sprites for enemies (uses PixelLab API):

1. Add to your `.env` file:
   ```env
   VITE_PIXELLAB_API_KEY=your_pixellab_api_key_here
   ```
2. In the editor UI, click **"API Sprites: OFF"** to toggle it **ON** (button turns green)
3. When enabled, enemies will have custom AI-generated sprites

⚠️ **Note:** API sprite generation costs credits. The toggle defaults to OFF to prevent accidental usage.

### 4. Access the Editor

1. Open the browser to the dev server URL
2. You'll see the Pewter Platformer editor
3. Press `C` to open the chat interface (if not already visible)

---

## 📝 Testing the Enemy Generation System

### Basic Test: Simple Patrolling Enemy

In the chat, try this prompt:

```
Create a simple enemy that patrols back and forth
```

**Expected Behavior:**

- Pewter should generate CEDL code using the `generateEnemy` tool
- A custom enemy will appear on the map
- The enemy should patrol within its defined range
- Enemy gets a unique name automatically

---

## ✏️ Enemy Modification System (NEW!)

### Overview

The enemy modification system allows you to modify existing enemies without recreating them. Every enemy gets a unique name, and you can reference and modify enemies by their exact name.

### Unique Naming System

- **First enemy:** Gets the requested name (e.g., "Slime")
- **Duplicate names:** Automatically numbered (e.g., "Slime 1", "Slime 2")
- **No conflicts:** Two enemies can never have the same name
- **Name references:** Use exact names when modifying (including numbers)

### Modification Capabilities

**What Can Be Modified:**

1. **Stats** (in-place updates):
   - Health
   - Speed
   - Damage on contact

2. **Looks** (in-place updates):
   - Tint/color
   - Scale/size
   - Sprite frame
   - Custom texture

3. **Projectiles** (requires recreation):
   - Fire rates
   - Projectile definitions
   - Patterns

4. **Behavior** (requires recreation):
   - State machine
   - Actions
   - Transitions

5. **Name** (if changed, ensures uniqueness):
   - Can rename enemies
   - System ensures new name is unique

### Examples

**Simple Stat Updates:**

```
Create a Turret at (10, 5)
Make that Turret have 50 health
Give the Turret more speed - make it move faster
```

**Visual Updates:**

```
Change the Turret's color to red
Make the Turret bigger (scale it up)
```

**Complex Updates (Behavior/Projectiles):**

```
Make the Turret shoot 3x faster
Give the Turret a spread shot pattern
```

**Multiple Enemies:**

```
Create a Slime at (5, 5)
Create another Slime at (10, 5)    → Named "Slime 1"
Create one more Slime at (15, 5)   → Named "Slime 2"

Make Slime 1 green
Make Slime 2 bigger
Change Slime's speed to 40
```

**Natural Language:**
The LLM automatically converts your requests to the appropriate modifications:

- "Give that enemy more health" → Updates health stat
- "Make it shoot faster" → Updates projectile fire rate
- "Change its color to blue" → Updates tint
- "Make it bigger" → Updates scale

---

## 📚 CEDL Template Library

The system includes **10 pre-built enemy templates** that can be used as-is or customized!

### Available Templates:

| Template         | Description                                | Key Traits                  |
| ---------------- | ------------------------------------------ | --------------------------- |
| **Patrol Guard** | Walks back and forth, chases when close    | Ground, Melee, Patrol       |
| **Turret**       | Stationary, shoots at player when in range | Ranged, Stationary          |
| **Charger**      | Rushes at player at high speed             | Fast, Aggressive, Melee     |
| **Flyer**        | Airborne, swoops down to attack            | Flying, Swooping            |
| **Sniper**       | Long-range shooter, retreats if close      | Long-range, Hit-and-run     |
| **Shotgunner**   | Fires spread shots at medium range         | Ranged, Spread pattern      |
| **Bullet Hell**  | Fires circular waves of projectiles        | Circular pattern, Boss-like |
| **Homing Drone** | Launches slow homing missiles              | Flying, Tracking            |
| **Berserker**    | Gets faster/stronger as health decreases   | Scaling difficulty          |
| **Teleporter**   | Phases in/out, appears unexpectedly        | Tricky, Unpredictable       |

### Using Templates - Quick Start

Just ask Pewter to create enemies using template names:

```
Create a Turret enemy at position (10, 5)
```

```
Place a Charger near the player spawn
```

```
Add a Homing Drone to patrol the upper platform
```

### Customizing Templates

You can customize any template by specifying overrides:

```
Create a Patrol Guard with 25 health and green tint
```

```
Make a fast Charger that does 5 damage on contact
```

```
Place a Bullet Hell boss with 100 health and purple color
```

### Template Quick Reference

**For Ground Enemies:**

- `Patrol Guard` - Basic patrol + chase
- `Charger` - Fast rush attack
- `Berserker` - Enrages at low health
- `Teleporter` - Blink movement

**For Ranged Enemies:**

- `Turret` - Stationary shooter
- `Sniper` - Long-range, retreats
- `Shotgunner` - Spread shots

**For Flying Enemies:**

- `Flyer` - Swooping attacks
- `Homing Drone` - Tracking missiles

**For Boss-like Enemies:**

- `Bullet Hell` - Circular projectile waves

---

### Advanced Test: Boss Enemy with Multiple Behaviors

Try this more complex prompt:

```
Create a boss enemy that:
- Has 50 health and moves at speed 30
- Patrols until the player gets close (within 80 pixels)
- Then chases the player
- When player is within 50 pixels, it attacks by shooting projectiles
- When health drops below 20, it enters a rage mode and shoots faster
- Make it look intimidating with a red tint and larger scale
```

### Manual CEDL Test (Advanced Users)

If you want to test specific CEDL code directly, you can ask Pewter to create an enemy with specific YAML code. However, the LLM should generate this automatically based on your description.

---

## 🎮 Example CEDL Code Snippets

Here are examples of CEDL code that you can reference or use as inspiration:

### Example 1: Simple Patrolling Slime

```yaml
enemy:
  name: "PatrolSlime"
  stats:
    health: 10
    speed: 25
    damage_on_contact: 1
  behavior:
    initial_state: "patrol"
    states:
      - name: "patrol"
        actions:
          - type: "patrol"
            distance: 4
        transitions:
          - condition: "player_distance < 100"
            target: "chase"
      - name: "chase"
        actions:
          - type: "move_toward_player"
            speed_multiplier: 1.5
        transitions:
          - condition: "player_distance > 150"
            target: "patrol"
  looks:
    base_sprite: 7
    tint: 0x00ff00
    scale: 1.0
```

### Example 2: Ranged Attacker

```yaml
enemy:
  name: "Archer"
  stats:
    health: 15
    speed: 20
    damage_on_contact: 2
  projectiles:
    - name: "arrow"
      damage: 3
      speed: 250
      size: 8
      gravity: 0
      lifetime: 2000
      sprite_frame: 1
  behavior:
    initial_state: "idle"
    states:
      - name: "idle"
        actions:
          - type: "wait"
            duration: 100
        transitions:
          - condition: "player_distance < 150"
            target: "aim"
      - name: "aim"
        actions:
          - type: "shoot"
            projectile: "arrow"
            rate: 60
        transitions:
          - condition: "player_distance > 200"
            target: "idle"
  looks:
    base_sprite: 6
    tint: 0xffaa00
    scale: 1.2
```

### Example 3: Rage Boss with Effects

```yaml
enemy:
  name: "RageBoss"
  stats:
    health: 50
    speed: 30
    damage_on_contact: 5
  projectiles:
    - name: "fireball"
      damage: 4
      speed: 200
      size: 10
      gravity: 0
      lifetime: 3000
      sprite_frame: 1
    - name: "mega_fireball"
      damage: 8
      speed: 150
      size: 16
      gravity: 50
      lifetime: 4000
      sprite_frame: 2
  behavior:
    initial_state: "guard"
    states:
      - name: "guard"
        actions:
          - type: "patrol"
            distance: 3
        transitions:
          - condition: "player_distance < 80"
            target: "alert"
      - name: "alert"
        actions:
          - type: "tint"
            color: 0xff6600
          - type: "shoot"
            projectile: "fireball"
            rate: 40
        transitions:
          - condition: "health < 20"
            target: "rage"
          - condition: "player_distance > 120"
            target: "guard"
      - name: "rage"
        actions:
          - type: "tint"
            color: 0xff0000
          - type: "shoot"
            projectile: "mega_fireball"
            rate: 20
        transitions:
          - condition: "health < 1"
            target: "guard" # Will die anyway
  effects:
    trail:
      enabled: true
      particle: "fire"
      frequency: 5
    death:
      type: "explosion"
      particle_count: 15
  looks:
    base_sprite: 6
    tint: 0xffcc00
    scale: 1.5
    shape_overlay:
      type: "circle"
      color: 0xff0000
      alpha: 0.3
      radius: 8
```

---

## 🧪 Step-by-Step Testing Workflow

### Test 1: Verify Tool Registration

1. Open browser console (F12)
2. Look for log messages like: `Tool Registered: generateEnemy`
3. Check that no errors appear during initialization

### Test 2: Create a Basic Enemy

1. **In Editor:**
   - Right-click and drag to create a selection box
   - Press `C` to open chat if needed

2. **In Chat:**

   ```
   Create a simple patrolling enemy at position (10, 10)
   ```

3. **Expected Result:**
   - LLM calls `generateEnemy` tool
   - Enemy appears on the map at tile (10, 10)
   - Enemy moves back and forth
   - Chat shows success message

### Test 3: Test State Transitions

1. Create an enemy that chases when player is near
2. Switch to Play mode (Play button or press Play key)
3. Move player close to the enemy
4. Observe enemy transitions from patrol to chase state
5. Move player away
6. Observe enemy returns to patrol state

### Test 4: Test Projectiles

1. Create an enemy with projectile attacks:
   ```
   Create an enemy that shoots projectiles at the player when close
   ```
2. Enter Play mode
3. Approach the enemy
4. Observe projectiles being fired
5. Test collision with player (should take damage)

### Test 5: Test Visual Customization

1. Create an enemy with custom looks:
   ```
   Create a large red enemy with a glowing circle around it
   ```
2. Observe:
   - Tint color applied
   - Scale size
   - Procedural overlay (circle)

### Test 6: Test Error Handling

1. Try asking for invalid enemy configuration:
   ```
   Create an enemy with -10 health
   ```
2. **Expected:** LLM receives validation error and can retry with correct values

### Test 7: Test Enemy Modification (NEW!)

1. **Create an enemy:**

   ```
   Create a Turret at position (10, 10)
   ```

2. **Modify its stats:**

   ```
   Give that Turret more health - make it 50 HP
   ```

   - **Expected:** Turret's health updates in-place (instant change)

3. **Modify its appearance:**

   ```
   Change the Turret's color to red
   ```

   - **Expected:** Turret's tint updates immediately

4. **Modify multiple properties:**
   ```
   Make the Turret shoot faster and move faster
   ```

   - **Expected:** Fire rate and speed updated (may require recreation for projectiles)

### Test 8: Test Unique Naming (NEW!)

1. **Create multiple enemies with same name:**

   ```
   Create a Slime enemy at (5, 5)
   Create another Slime enemy at (10, 5)
   Create one more Slime enemy at (15, 5)
   ```

2. **Expected Result:**
   - First enemy: named "Slime"
   - Second enemy: automatically named "Slime 1"
   - Third enemy: automatically named "Slime 2"

3. **Modify specific enemy:**

   ```
   Make Slime 1 move faster
   ```

   - **Expected:** Only "Slime 1" is modified, others unchanged

4. **Check enemy names:**
   - All enemies have unique names
   - You can reference any enemy by its exact name (including numbers)

---

## 🔍 Debugging Tips

### Check Console Logs

The system logs important events:

- `Tool Registered: generateEnemy` - Tool registration success
- `CEDL Error: ...` - Parsing/validation errors
- `Created "EnemyName" at (x, y)` - Successful creation

### Common Issues

1. **Enemy doesn't appear:**
   - Check console for CEDL validation errors
   - Verify coordinates are within map bounds
   - Check that enemy was added to `scene.enemies` array

2. **Behavior not working:**
   - Verify state machine conditions are correct
   - Check that player reference is available in Play mode
   - Ensure actions are properly typed in CEDL

3. **Projectiles not firing:**
   - Check projectile definitions in CEDL
   - Verify sprite_frame exists in pellets spritesheet
   - Check fire rate is reasonable (not too high/low)

4. **Visual effects not showing:**
   - Verify particle texture exists ("kenny-particles")
   - Check overlay graphics are being updated in update loop
   - Ensure tint/scale values are valid hex numbers

5. **Enemy modification fails:**
   - Verify you're using the exact enemy name (including numbers like "Slime 1")
   - Check that the enemy exists (use WorldFacts tool to see all enemies)
   - Only DynamicEnemy instances can be modified (not legacy Slime/UltraSlime)
   - Behavior/projectile changes require recreation (position is preserved)

---

## 📊 Available Actions & Conditions Reference

### Actions:

- `patrol` - Walk back and forth (`distance` parameter)
- `move_toward_player` - Chase player (`speed_multiplier` optional)
- `move_away_from_player` - Flee from player (`speed_multiplier` optional)
- `shoot` - Fire projectile (`projectile` name, `rate` shots/sec)
- `jump` - Jump upward (`velocity` parameter, negative value)
- `tint` - Change sprite color (`color` hex value)
- `scale` - Change sprite size (`value` number)
- `wait` - Pause actions (`duration` milliseconds)

### Conditions:

- `player_distance < 100` - Player within distance
- `player_distance > 200` - Player far away
- `health < 5` - Health below threshold
- `timer > 3000` - State active for 3+ seconds
- `player_x_relative == left` - Player to the left
- `random < 30` - 30% probability check

### Condition Operators:

- `<`, `>`, `<=`, `>=`, `==`, `!=`

---

## 🎨 Visual Customization Options

### Looks Section:

```yaml
looks:
  base_sprite: 7 # Sprite frame index (0-7 typically)
  tint: 0xff6600 # Hex color (0xRRGGBB)
  scale: 1.5 # Size multiplier
  shape_overlay: # Optional procedural shape
    type: "circle" # "circle", "rectangle", or "triangle"
    color: 0xff0000 # Overlay color
    alpha: 0.3 # Transparency (0.0-1.0)
    radius: 8 # For circles
    width: 16 # For rectangles/triangles
    height: 16 # For rectangles
```

---

## 🎯 Projectile Patterns

Projectiles can use advanced patterns for varied attack styles!

### Pattern Types:

#### 1. Single Shot (Default)

```yaml
projectiles:
  - name: "bullet"
    damage: 1
    speed: 200
    lifetime: 2000
    sprite_frame: 0
    # No pattern = single shot
```

#### 2. Spread Shot (Shotgun Style)

```yaml
projectiles:
  - name: "shotgun_blast"
    damage: 1
    speed: 180
    lifetime: 1500
    sprite_frame: 1
    pattern:
      type: "spread"
      spread_count: 5 # Number of projectiles
      spread_angle: 60 # Total angle spread in degrees
```

#### 3. Burst Fire (Rapid Succession)

```yaml
projectiles:
  - name: "machine_gun"
    damage: 1
    speed: 250
    lifetime: 2000
    sprite_frame: 0
    pattern:
      type: "burst"
      burst_count: 4 # Shots per burst
      burst_delay: 80 # Milliseconds between shots
```

#### 4. Circular Pattern (Bullet Hell)

```yaml
projectiles:
  - name: "nova"
    damage: 2
    speed: 120
    lifetime: 3000
    sprite_frame: 2
    pattern:
      type: "circular"
      circular_count: 12 # Projectiles in circle (360/12 = 30° apart)
```

#### 5. Homing Missiles

```yaml
projectiles:
  - name: "seeker"
    damage: 3
    speed: 100
    lifetime: 4000
    sprite_frame: 3
    pattern:
      type: "homing"
      homing_strength: 0.6 # 0.0-1.0 (tracking accuracy)
      homing_delay: 300 # ms before tracking activates
```

### Example: Bullet Hell Boss

```yaml
enemy:
  name: "BulletHellBoss"
  stats:
    health: 100
    speed: 30
    damage_on_contact: 5
  projectiles:
    - name: "spread_wave"
      damage: 1
      speed: 100
      lifetime: 4000
      sprite_frame: 1
      pattern:
        type: "circular"
        circular_count: 16
    - name: "homing_orb"
      damage: 2
      speed: 80
      lifetime: 5000
      sprite_frame: 2
      pattern:
        type: "homing"
        homing_strength: 0.5
        homing_delay: 500
  behavior:
    initial_state: "attack"
    states:
      - name: "attack"
        actions:
          - type: "shoot"
            projectile: "spread_wave"
            rate: 30
        transitions:
          - condition: "timer > 3000"
            target: "homing_phase"
      - name: "homing_phase"
        actions:
          - type: "shoot"
            projectile: "homing_orb"
            rate: 20
        transitions:
          - condition: "timer > 3000"
            target: "attack"
  looks:
    base_sprite: 6
    tint: 0x8800ff
    scale: 2.0
```

---

## 🗺️ Environmental Awareness

Enemies can now respond intelligently to terrain! This includes avoiding pits, jumping to platforms, using cover, and leveraging hazards.

### Environmental Actions:

| Action             | Description                            | Parameters              |
| ------------------ | -------------------------------------- | ----------------------- |
| `smart_patrol`     | Patrol that avoids pits and walls      | `distance` (tiles)      |
| `avoid_pit`        | Turn around when approaching pit edges | -                       |
| `jump_to_platform` | Jump to reach platforms above          | `max_height` (tiles)    |
| `seek_cover`       | Move toward nearby walls/cover         | -                       |
| `lure_to_hazard`   | Position to make player cross hazards  | -                       |
| `flee_from_hazard` | Move away from spikes/lava             | -                       |
| `ambush`           | Hide near cover, attack when close     | `trigger_distance` (px) |
| `drop_attack`      | Drop from platforms to attack below    | -                       |

### Terrain Conditions:

| Condition                 | Description                  |
| ------------------------- | ---------------------------- |
| `pit_ahead == 1`          | Pit detected in front        |
| `pit_distance < N`        | Distance to pit edge         |
| `wall_ahead == 1`         | Wall blocking path           |
| `platform_above == 1`     | Reachable platform above     |
| `platform_distance < N`   | Distance to nearest platform |
| `cover_nearby == 1`       | Cover/wall available         |
| `hazard_nearby == 1`      | Spikes/lava detected         |
| `player_near_hazard == 1` | Player close to hazard       |
| `on_ground == 1`          | Enemy on solid ground        |

### Example: Smart Patroller (Avoids Pits)

```yaml
enemy:
  name: "CliffGuard"
  stats:
    health: 12
    speed: 50
    damage_on_contact: 1
  behavior:
    initial_state: "patrol"
    states:
      - name: "patrol"
        actions:
          - type: "smart_patrol"
            distance: 5
        transitions:
          - condition: "player_distance < 100"
            target: "chase"
      - name: "chase"
        actions:
          - type: "move_toward_player"
            speed_multiplier: 1.5
          - type: "avoid_pit"
        transitions:
          - condition: "pit_ahead == 1"
            target: "patrol"
          - condition: "player_distance > 150"
            target: "patrol"
  looks:
    base_sprite: 7
    tint: 0x55aa55
```

### Example: Platform Jumper

```yaml
enemy:
  name: "Jumper"
  stats:
    health: 8
    speed: 60
    damage_on_contact: 2
  behavior:
    initial_state: "hunt"
    states:
      - name: "hunt"
        actions:
          - type: "move_toward_player"
            speed_multiplier: 1.0
        transitions:
          - condition: "platform_above == 1"
            target: "jump"
          - condition: "player_distance < 50"
            target: "attack"
      - name: "jump"
        actions:
          - type: "jump_to_platform"
            max_height: 3
        transitions:
          - condition: "on_ground == 1"
            target: "hunt"
      - name: "attack"
        actions:
          - type: "move_toward_player"
            speed_multiplier: 2.0
        transitions:
          - condition: "player_distance > 80"
            target: "hunt"
  looks:
    base_sprite: 6
    tint: 0x66ccff
    scale: 0.9
```

### Example: Ambusher (Uses Cover)

```yaml
enemy:
  name: "Ambusher"
  stats:
    health: 10
    speed: 80
    damage_on_contact: 3
  behavior:
    initial_state: "hide"
    states:
      - name: "hide"
        actions:
          - type: "seek_cover"
        transitions:
          - condition: "player_distance < 60"
            target: "strike"
          - condition: "cover_nearby == 0"
            target: "patrol"
      - name: "strike"
        actions:
          - type: "move_toward_player"
            speed_multiplier: 2.5
        transitions:
          - condition: "timer > 1500"
            target: "retreat"
      - name: "retreat"
        actions:
          - type: "seek_cover"
        transitions:
          - condition: "cover_nearby == 1"
            target: "hide"
          - condition: "timer > 2000"
            target: "hide"
      - name: "patrol"
        actions:
          - type: "smart_patrol"
            distance: 3
        transitions:
          - condition: "cover_nearby == 1"
            target: "hide"
  looks:
    base_sprite: 7
    tint: 0x444444
    scale: 0.85
```

### Example: Hazard Lurer

```yaml
enemy:
  name: "TrapMaster"
  stats:
    health: 15
    speed: 45
    damage_on_contact: 1
  behavior:
    initial_state: "taunt"
    states:
      - name: "taunt"
        actions:
          - type: "lure_to_hazard"
        transitions:
          - condition: "player_near_hazard == 1"
            target: "celebrate"
          - condition: "hazard_nearby == 0"
            target: "patrol"
          - condition: "player_distance < 40"
            target: "flee"
      - name: "flee"
        actions:
          - type: "flee_from_hazard"
          - type: "move_away_from_player"
            speed_multiplier: 1.5
        transitions:
          - condition: "player_distance > 100"
            target: "taunt"
      - name: "celebrate"
        actions:
          - type: "tint"
            color: 0x00ff00
        transitions:
          - condition: "timer > 1000"
            target: "taunt"
      - name: "patrol"
        actions:
          - type: "smart_patrol"
            distance: 4
        transitions:
          - condition: "hazard_nearby == 1"
            target: "taunt"
  looks:
    base_sprite: 6
    tint: 0xaa4400
```

---

## 🎮 UI Controls

### Editor UI Buttons (bottom of screen):

- **Play** - Enter play mode to test enemies
- **Deselect Box** - Clear selection boxes
- **Linear Regen** - Regenerate selected area
- **Event Queue Regen** - Alternative regeneration method
- **API Sprites: OFF/ON** - Toggle AI sprite generation (saves API credits when OFF)

### Keyboard Shortcuts (Play Mode):

- **Q** - Quit play mode and return to editor
- **G** - Toggle debug overlay for all enemies
- **WASD / Arrow Keys** - Move player

**Note:** Debug overlay automatically turns OFF when you quit play mode (press Q).

---

## 🐛 Known Limitations

1. **State Transitions:** Only one transition is checked per update cycle (first match wins)
2. **Particle Effects:** Requires "kenny-particles" texture to be loaded
3. **Sound Effects:** Death sound effects require audio files to be loaded in scene
4. **Terrain Detection:** Hazard tiles must match predefined indices (48-50 for spikes, 64-66 for lava)
5. **AI Sprites:** Requires PixelLab API key and toggle enabled; generates 32x32 sprites by default

---

## 💡 Tips for Best Results

1. **Start Simple:** Begin with basic patrol/chase patterns, then add complexity
2. **Test Incrementally:** Test each state individually before combining them
3. **Use World Facts:** Ask Pewter to check WorldFacts before placing enemies to ensure proper ground placement
4. **Iterate:** If CEDL validation fails, Pewter can read the error and fix it automatically
5. **Balance Stats:** Health and speed should be reasonable for gameplay balance

---

## 🎯 Next Steps

Once you're comfortable with the system, try:

- Creating enemy "families" with related behaviors
- Designing boss encounters with multiple phases
- Experimenting with different visual styles
- Combining multiple enemies for coordinated attacks
- Using the system to prototype game mechanics
- **Modifying enemies iteratively** - Start with a template, then refine properties
- **Creating variations** - Duplicate enemies and modify each one differently
- **Balancing gameplay** - Adjust enemy stats in real-time during testing

## 🔧 Enemy Modification Tips

1. **Use unique names:** If you plan to modify enemies, use descriptive names
2. **Reference by exact name:** When modifying, use the exact name (including numbers)
3. **In-place vs recreation:** Stats/looks update instantly; behavior/projectiles recreate
4. **Check available enemies:** Use WorldFacts or ask Pewter to list enemies if unsure of names
5. **Iterative design:** Start with templates, then modify to fit your needs

Happy enemy designing! 🎮
