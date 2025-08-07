import Phaser from "phaser";

export function placeTile(
  map: Phaser.Tilemaps.Tilemap,
  layer: Phaser.Tilemaps.TilemapLayer,
  tileID: number,
  pointer: Phaser.Input.Pointer,
): void {
  const tileX = map.worldToTileX(pointer.worldX);
  const tileY = map.worldToTileY(pointer.worldY);
  if (tileX && tileY) {
    map.putTileAt(tileID, tileX, tileY, true, layer);
  }
}
