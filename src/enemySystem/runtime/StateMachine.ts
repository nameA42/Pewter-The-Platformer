// State Machine Runtime for enemy behavior
import type {
  BehaviorDefinition,
  StateDefinition,
  ActionDefinition,
} from "../cedl/schema";
import type { EnemyContext } from "../cedl/types";

export class StateMachine {
  private currentState: string;
  private states: Map<string, StateDefinition>;
  private stateTimer: number = 0;
  private lastStateChange: number = 0;

  constructor(definition: BehaviorDefinition) {
    this.currentState = definition.initial_state;
    this.states = new Map(definition.states.map((s) => [s.name, s]));
    this.lastStateChange = Date.now();
  }

  update(context: EnemyContext, delta: number): ActionDefinition[] {
    this.stateTimer += delta;
    const state = this.states.get(this.currentState);

    if (!state) {
      console.warn(`State "${this.currentState}" not found`);
      return [];
    }

    // Check transitions
    if (state.transitions) {
      for (const transition of state.transitions) {
        if (this.evaluateCondition(transition.condition, context)) {
          this.currentState = transition.target;
          this.stateTimer = 0;
          this.lastStateChange = Date.now();
          break;
        }
      }
    }

    // Return actions for current state
    return state.actions || [];
  }

  getCurrentState(): string {
    return this.currentState;
  }

  getStateTimer(): number {
    return this.stateTimer;
  }

  private evaluateCondition(condition: string, context: EnemyContext): boolean {
    // Handle simple keyword conditions first
    const trimmedCondition = condition.trim().toLowerCase();

    // Always/never conditions
    if (trimmedCondition === "always" || trimmedCondition === "true") {
      return true;
    }
    if (trimmedCondition === "never" || trimmedCondition === "false") {
      return false;
    }

    // Timer-based simple conditions (e.g., "after 2000ms", "after 3s")
    const afterMatch = trimmedCondition.match(/^after\s+(\d+)(ms|s)?$/);
    if (afterMatch) {
      const value = parseInt(afterMatch[1]);
      const unit = afterMatch[2] || "ms";
      const targetMs = unit === "s" ? value * 1000 : value;
      return this.stateTimer >= targetMs;
    }

    // Parse conditions like "player_distance < 100", "health < 5", "timer > 3000"
    // Supports: <, >, <=, >=, ==, !=
    const match = condition.match(/(\w+)\s*([<>=!]+)\s*(\w+)/);
    if (!match) {
      // If no match, treat as a timer-based condition with default time
      // This handles cases like "patrol_finished" - use timer as fallback
      console.warn(
        `Unknown condition "${condition}", treating as timer > 2000`,
      );
      return this.stateTimer > 2000;
    }

    const [_, variable, operator, valueStr] = match;

    // Get actual value from context
    const actualValue = this.getContextValue(variable, context);

    // Parse comparison value
    let compareValue: number | string;
    if (valueStr === "left" || valueStr === "right" || valueStr === "center") {
      compareValue = valueStr;
    } else {
      compareValue = parseFloat(valueStr);
      if (isNaN(compareValue)) {
        console.warn(`Cannot parse value "${valueStr}" as number`);
        return false;
      }
    }

    // Perform comparison
    return this.compare(actualValue, operator, compareValue);
  }

  private getContextValue(
    variable: string,
    context: EnemyContext,
  ): number | string {
    switch (variable) {
      // Player-related
      case "player_distance":
        return context.playerDistance;
      case "player_x_relative":
        return context.playerXRelative;

      // Enemy state
      case "health":
        return context.health;
      case "timer":
        return this.stateTimer;
      case "random":
        return Math.random() * 100; // Return 0-100 for probability checks
      case "facing":
        return context.facingDirection > 0 ? "right" : "left";

      // ═══════════════════════════════════════════════════════════════════
      // TERRAIN AWARENESS CONDITIONS
      // ═══════════════════════════════════════════════════════════════════

      // Pit detection
      case "pit_ahead":
        return context.terrain.pitAhead ? 1 : 0;
      case "pit_distance":
        return context.terrain.pitDistance;
      case "pit_depth":
        return context.terrain.pitDepth;

      // Platform detection
      case "platform_above":
        return context.terrain.platformAbove ? 1 : 0;
      case "platform_below":
        return context.terrain.platformBelow ? 1 : 0;
      case "platform_distance":
        return context.terrain.platformAboveDistance;

      // Cover detection
      case "cover_nearby":
        return context.terrain.coverNearby ? 1 : 0;
      case "cover_distance":
        return context.terrain.coverDistance;
      case "cover_direction":
        return context.terrain.coverDirection;

      // Hazard detection
      case "hazard_nearby":
        return context.terrain.hazardNearby ? 1 : 0;
      case "hazard_distance":
        return context.terrain.hazardDistance;
      case "hazard_type":
        return context.terrain.hazardType;
      case "player_near_hazard":
        return context.terrain.playerNearHazard ? 1 : 0;

      // Ground/Wall info
      case "on_ground":
        return context.terrain.onGround ? 1 : 0;
      case "wall_ahead":
        return context.terrain.wallAhead ? 1 : 0;
      case "wall_distance":
        return context.terrain.wallDistance;

      default:
        console.warn(`Unknown variable: ${variable}`);
        return 0;
    }
  }

  private compare(
    actual: number | string,
    operator: string,
    expected: number | string,
  ): boolean {
    if (typeof actual === "string" || typeof expected === "string") {
      // String comparison
      switch (operator) {
        case "==":
          return actual === expected;
        case "!=":
          return actual !== expected;
        default:
          console.warn(`Invalid operator "${operator}" for string comparison`);
          return false;
      }
    }

    // Number comparison
    const a = actual as number;
    const e = expected as number;

    switch (operator) {
      case "<":
        return a < e;
      case ">":
        return a > e;
      case "<=":
        return a <= e;
      case ">=":
        return a >= e;
      case "==":
        return Math.abs(a - e) < 0.001; // Float comparison
      case "!=":
        return Math.abs(a - e) >= 0.001;
      default:
        console.warn(`Unknown operator: ${operator}`);
        return false;
    }
  }
}
