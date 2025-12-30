// Sprite Generator Service - Handles PixelLab API integration for dynamic sprite generation
import Phaser from "phaser";

// PixelLab client type (will be imported from SDK)
type PixelLabClient = any;

interface SpriteSize {
  width: number;
  height: number;
}

interface GeneratedSpriteResult {
  textureKey: string;
  cached: boolean;
  error?: string;
}

export class SpriteGenerator {
  private static instance: SpriteGenerator | null = null;
  private client: PixelLabClient | null = null;
  private cache: Map<string, string> = new Map(); // description -> textureKey
  private apiKey: string | null = null;
  private scene: Phaser.Scene | null = null;

  // Static toggle to enable/disable external API sprite generation
  // When false, will skip API calls and use default sprites instead
  public static useExternalApi: boolean = false;

  private constructor() {
    this.apiKey = import.meta.env.VITE_PIXELLAB_API_KEY;
    if (!this.apiKey) {
      console.warn(
        "⚠️ VITE_PIXELLAB_API_KEY not found in environment. Sprite generation will be disabled.",
      );
    } else {
      // Log API key status (first/last 4 chars for security)
      const keyPreview =
        this.apiKey.length > 8
          ? `${this.apiKey.substring(0, 4)}...${this.apiKey.substring(this.apiKey.length - 4)}`
          : "[key too short]";
      console.log(`🔑 PixelLab API key detected: ${keyPreview}`);
    }
  }

  static getInstance(): SpriteGenerator {
    if (!SpriteGenerator.instance) {
      SpriteGenerator.instance = new SpriteGenerator();
    }
    return SpriteGenerator.instance;
  }

  /**
   * Initialize the sprite generator with a Phaser scene reference
   */
  initialize(scene: Phaser.Scene): void {
    this.scene = scene;

    // Initialize PixelLab client
    if (this.apiKey && !this.client) {
      try {
        // Dynamic import of PixelLab client
        // Note: This will be loaded when the SDK is available
        // For now, we'll set it to null and check before use
        this.initializeClient();
      } catch (error) {
        console.error("Failed to initialize PixelLab client:", error);
      }
    }
  }

  private async initializeClient(): Promise<void> {
    // Note: Using direct fetch API since SDK has issues with token authentication
    // Your API key works perfectly with curl, so we'll use direct API calls
    console.log("✅ Using direct API calls (curl-compatible method)");
    this.client = {
      // Mark client as initialized (using direct API instead of SDK)
      initialized: true,
    } as any;
  }

  /**
   * Generate a sprite from a text description
   * @param description - Text description of the sprite (e.g., "sniper", "pixel art knight enemy")
   * @param size - Optional sprite size (defaults to 32x32 to match player scale)
   * @returns Promise with texture key and metadata
   */
  async generateSprite(
    description: string,
    size: SpriteSize = { width: 32, height: 32 },
  ): Promise<GeneratedSpriteResult> {
    // Normalize description for cache lookup
    const normalizedDesc = description.toLowerCase().trim();

    // Check cache first
    if (this.cache.has(normalizedDesc)) {
      const cachedKey = this.cache.get(normalizedDesc)!;
      console.log(`🎨 Using cached sprite for "${description}": ${cachedKey}`);
      return {
        textureKey: cachedKey,
        cached: true,
      };
    }

    // Check if external API is disabled (to save credits)
    if (!SpriteGenerator.useExternalApi) {
      console.log(
        `🎨 External API disabled - using default sprite for "${description}"`,
      );
      return {
        textureKey: "",
        cached: false,
        error: "External API disabled (toggle in UI to enable)",
      };
    }

    // Validate prerequisites
    if (!this.apiKey) {
      return {
        textureKey: "",
        cached: false,
        error: "PixelLab API key not configured",
      };
    }

    if (!this.scene) {
      return {
        textureKey: "",
        cached: false,
        error: "Scene not initialized",
      };
    }

    // Ensure client is initialized
    if (!this.client) {
      await this.initializeClient();
      if (!this.client) {
        return {
          textureKey: "",
          cached: false,
          error: "PixelLab client not available",
        };
      }
    }

    try {
      console.log(`🎨 Generating sprite for "${description}"...`);

      // Determine which model to use based on size
      // Bitforge: More economical ($0.00738 for 64x64), max 200x200
      // Pixflux: More expensive ($0.0084 for 64x64), max 400x400
      const preferBitforge = size.width <= 200 && size.height <= 200;

      let response: any;
      let modelUsed = "";

      // Use direct fetch API calls (same approach as working curl command)
      const apiUrl = preferBitforge
        ? "https://api.pixellab.ai/v1/generate-image-bitforge"
        : "https://api.pixellab.ai/v1/generate-image-pixflux";

      try {
        console.log(
          `🎨 Attempting ${preferBitforge ? "Bitforge" : "Pixflux"} model for ${size.width}x${size.height} sprite`,
        );

        // Enhanced prompt for better sprite quality
        const enhancedDescription = this.enhanceSpriteDescription(description);

        const requestBody: any = {
          description: enhancedDescription,
          image_size: {
            width: size.width,
            height: size.height,
          },
        };

        // Add noBackground parameter if needed
        if (true) {
          // Always use transparent background
          requestBody.no_background = true;
        }

        // Make direct API call (matching curl format that works)
        const apiResponse = await fetch(apiUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (!apiResponse.ok) {
          const errorData = await apiResponse
            .json()
            .catch(() => ({ error: apiResponse.statusText }));
          throw new Error(
            `API Error (${apiResponse.status}): ${JSON.stringify(errorData)}`,
          );
        }

        response = await apiResponse.json();
        modelUsed = preferBitforge ? "Bitforge" : "Pixflux";
        console.log(`✅ Successfully used ${modelUsed} model`);
      } catch (bitforgeError) {
        // If Bitforge fails, try Pixflux
        if (preferBitforge) {
          const errorMsg =
            bitforgeError instanceof Error
              ? bitforgeError.message
              : String(bitforgeError);
          console.warn(
            `⚠️ Bitforge failed (${errorMsg}), falling back to Pixflux`,
          );

          try {
            const pixfluxResponse = await fetch(
              "https://api.pixellab.ai/v1/generate-image-pixflux",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${this.apiKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  description: this.enhanceSpriteDescription(description),
                  image_size: {
                    width: size.width,
                    height: size.height,
                  },
                  no_background: true,
                }),
              },
            );

            if (!pixfluxResponse.ok) {
              throw new Error(`Pixflux API Error (${pixfluxResponse.status})`);
            }

            response = await pixfluxResponse.json();
            modelUsed = "Pixflux (fallback)";
            console.log(`✅ Successfully used ${modelUsed} model`);
          } catch (pixfluxError) {
            throw bitforgeError; // Re-throw original error
          }
        } else {
          throw bitforgeError;
        }
      }

      // Generate unique texture key
      const timestamp = Date.now();
      const hash = this.simpleHash(normalizedDesc);
      const textureKey = `enemy-sprite-${hash}-${timestamp}`;

      // Load sprite into Phaser
      await this.loadSpriteIntoPhaser(response, textureKey);

      // Cache the result
      this.cache.set(normalizedDesc, textureKey);

      console.log(`✅ Successfully generated sprite: ${textureKey}`);

      return {
        textureKey,
        cached: false,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(
        `❌ Failed to generate sprite for "${description}":`,
        errorMsg,
      );
      return {
        textureKey: "",
        cached: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Load sprite data into Phaser as a texture
   */
  private async loadSpriteIntoPhaser(
    response: any,
    textureKey: string,
  ): Promise<void> {
    if (!this.scene) {
      throw new Error("Scene not initialized");
    }

    // Check if response contains image data (API returns { image: { base64: "..." } } or { image_url: "..." })
    let imageData: string;

    if (response.image?.base64) {
      // API returns { image: { type: "base64", base64: "..." } }
      imageData = `data:image/png;base64,${response.image.base64}`;
    } else if (response.image && typeof response.image === "string") {
      // Direct base64 string
      if (response.image.startsWith("data:")) {
        imageData = response.image;
      } else {
        imageData = `data:image/png;base64,${response.image}`;
      }
    } else if (response.image_url) {
      // If response contains URL, load asynchronously
      await this.loadFromUrl(textureKey, response.image_url);
      return;
    } else {
      throw new Error(
        "Response does not contain image data or URL. Response: " +
          JSON.stringify(response).substring(0, 200),
      );
    }

    // Load texture using base64 - THIS IS ASYNC! Must wait for it to complete
    await this.loadBase64Texture(textureKey, imageData);
  }

  /**
   * Load base64 image as Phaser texture with proper async handling
   */
  private loadBase64Texture(
    textureKey: string,
    base64Data: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.scene) {
        reject(new Error("Scene not initialized"));
        return;
      }

      // Listen for texture add event
      const onTextureAdd = (key: string) => {
        if (key === textureKey) {
          this.scene!.textures.off("addtexture", onTextureAdd);
          console.log(`📷 Texture loaded successfully: ${textureKey}`);
          resolve();
        }
      };

      // Listen for load errors
      const onError = () => {
        this.scene!.textures.off("addtexture", onTextureAdd);
        reject(new Error(`Failed to load texture: ${textureKey}`));
      };

      // Set up listeners
      this.scene.textures.on("addtexture", onTextureAdd);

      // Set a timeout to prevent hanging
      const timeout = setTimeout(() => {
        this.scene!.textures.off("addtexture", onTextureAdd);
        // Check if texture was actually added
        if (this.scene!.textures.exists(textureKey)) {
          console.log(`📷 Texture loaded (via timeout check): ${textureKey}`);
          resolve();
        } else {
          reject(new Error(`Texture load timed out: ${textureKey}`));
        }
      }, 5000); // 5 second timeout

      // Add the base64 texture
      this.scene.textures.addBase64(textureKey, base64Data);

      // Clear timeout when resolved
      this.scene.textures.once("addtexture", () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * Load texture from URL with Promise wrapper
   */
  private loadFromUrl(textureKey: string, url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.scene) {
        reject(new Error("Scene not initialized"));
        return;
      }

      this.scene.load.image(textureKey, url);
      this.scene.load.once(`filecomplete-image-${textureKey}`, () => {
        resolve();
      });
      this.scene.load.once("loaderror", (file: any) => {
        if (file.key === textureKey) {
          reject(new Error(`Failed to load image from URL: ${url}`));
        }
      });
      this.scene.load.start();
    });
  }

  /**
   * Convert Blob to base64
   */
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Enhance sprite description with detailed prompts for better AI generation
   */
  private enhanceSpriteDescription(description: string): string {
    const normalized = description.toLowerCase().trim();

    // If description already contains detailed keywords, use as-is
    if (
      normalized.includes("pixel art") ||
      normalized.includes("detailed") ||
      normalized.length > 50
    ) {
      return `pixel art ${description} sprite, 16-bit game style, clean edges, visible features, front-facing view, game character`;
    }

    // Enhanced prompts for common enemy types
    const enhancedPrompts: Record<string, string> = {
      sniper:
        "pixel art sniper enemy character, holding rifle with scope, wearing hat or helmet, detailed facial features, front-facing view, 16-bit game style, clean pixel art",
      knight:
        "pixel art knight enemy character, wearing armor with helmet, holding sword or shield, medieval style, detailed armor details, front-facing view, 16-bit game style",
      robot:
        "pixel art robot enemy character, mechanical body with visible joints, glowing eyes, metallic appearance, futuristic design, front-facing view, 16-bit game style",
      zombie:
        "pixel art zombie enemy character, tattered clothes, pale skin, visible wounds, menacing expression, walking pose, front-facing view, 16-bit game style",
      orc: "pixel art orc enemy character, green skin, muscular build, tusks, wearing crude armor or clothes, weapon in hand, front-facing view, 16-bit game style",
      ghost:
        "pixel art ghost enemy character, translucent appearance, floating pose, simple eyes, wispy form, front-facing view, 16-bit game style",
      dragon:
        "pixel art dragon enemy character, wings folded, scales visible, horns, detailed head, side or front view, 16-bit game style",
      goblin:
        "pixel art goblin enemy character, small stature, green skin, pointy ears, wearing simple clothes, holding small weapon, front-facing view, 16-bit game style",
      skeleton:
        "pixel art skeleton enemy character, bones visible, eye sockets glowing, holding weapon, front-facing view, 16-bit game style",
      turret:
        "pixel art turret enemy, mechanical cannon, stationary base, rotating barrel, sci-fi design, front-facing view, 16-bit game style",
      charger:
        "pixel art charging enemy character, aggressive stance, horns or spikes, muscular build, ready to charge, front-facing view, 16-bit game style",
      flyer:
        "pixel art flying enemy character, wings spread, aerial creature, detailed wings, floating pose, front-facing view, 16-bit game style",
    };

    // Check if description matches a known type
    for (const [key, prompt] of Object.entries(enhancedPrompts)) {
      if (normalized.includes(key)) {
        return prompt;
      }
    }

    // Default enhanced prompt for unknown types
    return `pixel art ${description} enemy character sprite, detailed features, clear silhouette, front-facing view, 16-bit retro game style, clean pixel art, visible character design`;
  }

  /**
   * Simple hash function for generating consistent IDs
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Check if a sprite for a given description is already cached
   */
  isCached(description: string): boolean {
    const normalizedDesc = description.toLowerCase().trim();
    return this.cache.has(normalizedDesc);
  }

  /**
   * Get cached texture key for a description
   */
  getCachedTextureKey(description: string): string | null {
    const normalizedDesc = description.toLowerCase().trim();
    return this.cache.get(normalizedDesc) || null;
  }

  /**
   * Clear the sprite cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log("🗑️ Sprite cache cleared");
  }

  /**
   * Check if sprite generation is available
   */
  isAvailable(): boolean {
    return this.apiKey !== null && this.scene !== null;
  }
}

// Export singleton instance getter
export const getSpriteGenerator = () => SpriteGenerator.getInstance();
