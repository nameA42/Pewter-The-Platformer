// CEDL Parser - YAML parsing and validation
import { parse as parseYaml } from "yaml";
import { CEDLSchema } from "./schema";
import type { EnemyDefinition } from "./schema";

export interface ParseResult {
  success: boolean;
  data?: EnemyDefinition["enemy"];
  errors?: string[];
}

export function parseCEDL(code: string): ParseResult {
  try {
    // Parse YAML
    const raw = parseYaml(code);

    if (!raw || typeof raw !== "object") {
      return {
        success: false,
        errors: ["Invalid YAML: root must be an object"],
      };
    }

    // Validate against schema
    const result = CEDLSchema.safeParse(raw);

    if (!result.success) {
      const errors = result.error.issues.map((issue) => {
        const path = issue.path.join(".");
        return path ? `${path}: ${issue.message}` : issue.message;
      });
      return {
        success: false,
        errors,
      };
    }

    return {
      success: true,
      data: result.data.enemy,
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return {
      success: false,
      errors: [`Parse error: ${error.message}`],
    };
  }
}
