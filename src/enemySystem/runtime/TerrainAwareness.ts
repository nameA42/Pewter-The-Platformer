// Terrain Awareness System for Environmental Enemy Behaviors
// Detects pits, platforms, cover, and hazards in the game world

export interface TerrainInfo {
  // Pit detection
  pitAhead: boolean;
  pitDistance: number; // Distance to pit edge in pixels
  pitDepth: number; // How deep the pit is in tiles

  // Platform detection
  platformAbove: boolean;
  platformBelow: boolean;
  platformAboveDistance: number; // Vertical distance to platform above
  platformBelowDistance: number; // Vertical distance to platform below
  nearestPlatformX: number; // X position of nearest reachable platform
  nearestPlatformY: number; // Y position of nearest reachable platform

  // Cover detection
  coverNearby: boolean;
  coverDirection: "left" | "right" | "none";
  coverDistance: number; // Distance to nearest cover
  coverX: number;
  coverY: number;

  // Hazard detection
  hazardNearby: boolean;
  hazardType: string; // "spikes", "lava", "none"
  hazardX: number;
  hazardY: number;
  hazardDistance: number;
  playerNearHazard: boolean;

  // Ground info
  onGround: boolean;
  groundTileBelow: number; // Tile index of ground below
  distanceToGround: number;

  // Wall detection
  wallAhead: boolean;
  wallDistance: number;
}

// Tile indices that are considered hazards (adjust based on your tileset)
const HAZARD_TILES = [
  48,
  49,
  50, // Spikes (example indices)
  64,
  65,
  66, // Lava (example indices)
];

// Tile indices that are considered solid cover
const COVER_TILES = [
  1,
  2,
  3,
  4,
  5, // Solid ground tiles
  16,
  17,
  18,
  19, // Platform tiles
];

export class TerrainAwareness {
  private scene: Phaser.Scene;
  private map: Phaser.Tilemaps.Tilemap;
  private groundLayer: Phaser.Tilemaps.TilemapLayer;
  private tileSize: number;

  // Cached terrain info
  private cachedInfo: TerrainInfo | null = null;
  private cacheTime: number = 0;
  private cacheDuration: number = 100; // ms to cache terrain info

  constructor(
    scene: Phaser.Scene,
    map: Phaser.Tilemaps.Tilemap,
    groundLayer: Phaser.Tilemaps.TilemapLayer,
  ) {
    this.scene = scene;
    this.map = map;
    this.groundLayer = groundLayer;
    this.tileSize = map.tileWidth;
  }

  // Main method to analyze terrain around an enemy
  analyze(
    enemyX: number,
    enemyY: number,
    facingDirection: number, // 1 = right, -1 = left
    playerX?: number,
    playerY?: number,
  ): TerrainInfo {
    const now = Date.now();

    // Use cached info if recent enough
    if (this.cachedInfo && now - this.cacheTime < this.cacheDuration) {
      return this.cachedInfo;
    }

    const enemyTileX = Math.floor(enemyX / this.tileSize);
    const enemyTileY = Math.floor(enemyY / this.tileSize);

    const info: TerrainInfo = {
      // Pit detection
      pitAhead: false,
      pitDistance: 999,
      pitDepth: 0,

      // Platform detection
      platformAbove: false,
      platformBelow: false,
      platformAboveDistance: 999,
      platformBelowDistance: 999,
      nearestPlatformX: enemyX,
      nearestPlatformY: enemyY,

      // Cover detection
      coverNearby: false,
      coverDirection: "none",
      coverDistance: 999,
      coverX: 0,
      coverY: 0,

      // Hazard detection
      hazardNearby: false,
      hazardType: "none",
      hazardX: 0,
      hazardY: 0,
      hazardDistance: 999,
      playerNearHazard: false,

      // Ground info
      onGround: false,
      groundTileBelow: -1,
      distanceToGround: 999,

      // Wall detection
      wallAhead: false,
      wallDistance: 999,
    };

    // Check ground below
    this.checkGroundBelow(enemyTileX, enemyTileY, info);

    // Check for pits ahead
    this.checkPitAhead(enemyTileX, enemyTileY, facingDirection, info);

    // Check for walls ahead
    this.checkWallAhead(enemyTileX, enemyTileY, facingDirection, info);

    // Check for platforms above and below
    this.checkPlatforms(enemyTileX, enemyTileY, info);

    // Check for cover
    this.checkCover(enemyTileX, enemyTileY, info);

    // Check for hazards
    this.checkHazards(enemyTileX, enemyTileY, playerX, playerY, info);

    // Cache the result
    this.cachedInfo = info;
    this.cacheTime = now;

    return info;
  }

  private checkGroundBelow(
    tileX: number,
    tileY: number,
    info: TerrainInfo,
  ): void {
    // Check tile directly below and one more down
    for (let dy = 1; dy <= 3; dy++) {
      const tile = this.groundLayer.getTileAt(tileX, tileY + dy);
      if (tile && tile.index !== -1 && tile.collides) {
        info.onGround = dy === 1;
        info.groundTileBelow = tile.index;
        info.distanceToGround = dy * this.tileSize;
        return;
      }
    }
    info.distanceToGround = 999;
  }

  private checkPitAhead(
    tileX: number,
    tileY: number,
    direction: number,
    info: TerrainInfo,
  ): void {
    // Look ahead in the facing direction
    const lookAhead = 4; // tiles to look ahead

    for (let dx = 1; dx <= lookAhead; dx++) {
      const checkX = tileX + dx * direction;

      // Check if there's ground at this position (at enemy level + 1)
      let hasGround = false;
      for (let dy = 0; dy <= 2; dy++) {
        const tile = this.groundLayer.getTileAt(checkX, tileY + dy);
        if (tile && tile.index !== -1 && tile.collides) {
          hasGround = true;
          break;
        }
      }

      if (!hasGround) {
        // Found a pit!
        info.pitAhead = true;
        info.pitDistance = dx * this.tileSize;

        // Calculate pit depth
        let depth = 0;
        for (let dy = 1; dy <= 10; dy++) {
          const tile = this.groundLayer.getTileAt(checkX, tileY + dy);
          if (tile && tile.index !== -1 && tile.collides) {
            break;
          }
          depth++;
        }
        info.pitDepth = depth;
        return;
      }
    }
  }

  private checkWallAhead(
    tileX: number,
    tileY: number,
    direction: number,
    info: TerrainInfo,
  ): void {
    // Check for walls at head and body level
    for (let dx = 1; dx <= 3; dx++) {
      const checkX = tileX + dx * direction;

      // Check at enemy's head level and body level
      for (let dy = -1; dy <= 0; dy++) {
        const tile = this.groundLayer.getTileAt(checkX, tileY + dy);
        if (tile && tile.index !== -1 && tile.collides) {
          info.wallAhead = true;
          info.wallDistance = dx * this.tileSize;
          return;
        }
      }
    }
  }

  private checkPlatforms(
    tileX: number,
    tileY: number,
    info: TerrainInfo,
  ): void {
    // Check for platforms above (within jump range)
    const maxJumpHeight = 4; // tiles
    const horizontalRange = 5; // tiles to each side

    // Check above
    for (let dy = 2; dy <= maxJumpHeight; dy++) {
      for (let dx = -horizontalRange; dx <= horizontalRange; dx++) {
        const tile = this.groundLayer.getTileAt(tileX + dx, tileY - dy);
        if (tile && tile.index !== -1 && tile.collides) {
          // Make sure there's space to land (tile above the platform is empty)
          const aboveTile = this.groundLayer.getTileAt(
            tileX + dx,
            tileY - dy - 1,
          );
          if (!aboveTile || aboveTile.index === -1 || !aboveTile.collides) {
            const distance = dy * this.tileSize;
            if (distance < info.platformAboveDistance) {
              info.platformAbove = true;
              info.platformAboveDistance = distance;
              info.nearestPlatformX =
                (tileX + dx) * this.tileSize + this.tileSize / 2;
              info.nearestPlatformY =
                (tileY - dy - 1) * this.tileSize + this.tileSize / 2;
            }
          }
        }
      }
    }

    // Check below (for dropping down)
    for (let dy = 2; dy <= 6; dy++) {
      for (let dx = -horizontalRange; dx <= horizontalRange; dx++) {
        const tile = this.groundLayer.getTileAt(tileX + dx, tileY + dy);
        if (tile && tile.index !== -1 && tile.collides) {
          const distance = dy * this.tileSize;
          if (distance < info.platformBelowDistance) {
            info.platformBelow = true;
            info.platformBelowDistance = distance;
          }
        }
      }
    }
  }

  private checkCover(tileX: number, tileY: number, info: TerrainInfo): void {
    // Look for solid tiles that could provide cover (walls, blocks)
    const searchRange = 6; // tiles

    let nearestCoverDist = 999;
    let nearestCoverX = 0;
    let nearestCoverY = 0;
    let coverDir: "left" | "right" | "none" = "none";

    for (let dx = -searchRange; dx <= searchRange; dx++) {
      if (dx === 0) continue;

      // Check for a solid wall at head height
      const tile = this.groundLayer.getTileAt(tileX + dx, tileY);
      const tileAbove = this.groundLayer.getTileAt(tileX + dx, tileY - 1);

      // Cover should be solid at body level but have space behind it
      if (tile && tile.index !== -1 && tile.collides) {
        // Check if there's space on the other side of the cover
        const behindTile = this.groundLayer.getTileAt(
          tileX + dx + (dx > 0 ? 1 : -1),
          tileY,
        );
        if (!behindTile || behindTile.index === -1 || !behindTile.collides) {
          const distance = Math.abs(dx) * this.tileSize;
          if (distance < nearestCoverDist) {
            nearestCoverDist = distance;
            nearestCoverX = (tileX + dx) * this.tileSize;
            nearestCoverY = tileY * this.tileSize;
            coverDir = dx < 0 ? "left" : "right";
          }
        }
      }
    }

    if (nearestCoverDist < 999) {
      info.coverNearby = true;
      info.coverDistance = nearestCoverDist;
      info.coverX = nearestCoverX;
      info.coverY = nearestCoverY;
      info.coverDirection = coverDir;
    }
  }

  private checkHazards(
    tileX: number,
    tileY: number,
    playerX?: number,
    playerY?: number,
    info?: TerrainInfo,
  ): void {
    if (!info) return;

    const searchRange = 8; // tiles
    let nearestHazardDist = 999;

    for (let dy = -2; dy <= 4; dy++) {
      for (let dx = -searchRange; dx <= searchRange; dx++) {
        const tile = this.groundLayer.getTileAt(tileX + dx, tileY + dy);
        if (tile && HAZARD_TILES.includes(tile.index)) {
          const hazardWorldX = (tileX + dx) * this.tileSize + this.tileSize / 2;
          const hazardWorldY = (tileY + dy) * this.tileSize + this.tileSize / 2;
          const distance = Math.sqrt(
            Math.pow(dx * this.tileSize, 2) + Math.pow(dy * this.tileSize, 2),
          );

          if (distance < nearestHazardDist) {
            nearestHazardDist = distance;
            info.hazardNearby = true;
            info.hazardX = hazardWorldX;
            info.hazardY = hazardWorldY;
            info.hazardDistance = distance;

            // Determine hazard type based on tile index
            if (tile.index >= 48 && tile.index <= 50) {
              info.hazardType = "spikes";
            } else if (tile.index >= 64 && tile.index <= 66) {
              info.hazardType = "lava";
            } else {
              info.hazardType = "unknown";
            }
          }
        }
      }
    }

    // Check if player is near any hazard
    if (playerX !== undefined && playerY !== undefined && info.hazardNearby) {
      const playerToHazard = Math.sqrt(
        Math.pow(playerX - info.hazardX, 2) +
          Math.pow(playerY - info.hazardY, 2),
      );
      info.playerNearHazard = playerToHazard < this.tileSize * 3;
    }
  }

  // Helper method to find safe ground in a direction
  findSafeGround(
    startX: number,
    startY: number,
    direction: number,
    maxDistance: number = 5,
  ): { x: number; y: number } | null {
    const startTileX = Math.floor(startX / this.tileSize);
    const startTileY = Math.floor(startY / this.tileSize);

    for (let dx = 1; dx <= maxDistance; dx++) {
      const checkX = startTileX + dx * direction;

      // Find ground at this X position
      for (let dy = -2; dy <= 3; dy++) {
        const tile = this.groundLayer.getTileAt(checkX, startTileY + dy);
        const aboveTile = this.groundLayer.getTileAt(
          checkX,
          startTileY + dy - 1,
        );

        if (tile && tile.index !== -1 && tile.collides) {
          // Check there's space above
          if (!aboveTile || aboveTile.index === -1 || !aboveTile.collides) {
            // Check it's not a hazard
            if (!HAZARD_TILES.includes(tile.index)) {
              return {
                x: checkX * this.tileSize + this.tileSize / 2,
                y: (startTileY + dy - 1) * this.tileSize + this.tileSize / 2,
              };
            }
          }
        }
      }
    }

    return null;
  }

  // Check if a path is clear between two points
  isPathClear(fromX: number, fromY: number, toX: number, toY: number): boolean {
    const steps = Math.ceil(
      Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY)) / this.tileSize,
    );

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const checkX = Math.floor((fromX + (toX - fromX) * t) / this.tileSize);
      const checkY = Math.floor((fromY + (toY - fromY) * t) / this.tileSize);

      const tile = this.groundLayer.getTileAt(checkX, checkY);
      if (tile && tile.index !== -1 && tile.collides) {
        return false;
      }
    }

    return true;
  }

  // Get optimal jump trajectory to reach a platform
  calculateJumpToTarget(
    fromX: number,
    fromY: number,
    targetX: number,
    targetY: number,
    gravity: number = 800,
  ): { velocityX: number; velocityY: number } | null {
    const dx = targetX - fromX;
    const dy = targetY - fromY;

    // Can only jump up
    if (dy > 0) return null;

    // Calculate required jump velocity
    // Using basic projectile motion: vy = sqrt(2 * g * h)
    const jumpHeight = Math.abs(dy) + this.tileSize; // Add some margin
    const vy = -Math.sqrt(2 * gravity * jumpHeight);

    // Time to reach peak
    const timeToPeak = Math.abs(vy) / gravity;
    const totalTime = timeToPeak * 2;

    // Horizontal velocity needed
    const vx = dx / totalTime;

    // Cap velocities to reasonable values
    const maxVx = 300;
    const maxVy = -600;

    if (Math.abs(vx) > maxVx || vy < maxVy) {
      return null; // Target unreachable with normal jump
    }

    return { velocityX: vx, velocityY: vy };
  }
}
