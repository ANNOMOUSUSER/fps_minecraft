import { GameState, Vec3 } from './types';

export function createWorld(size: number, height: number): Uint8Array {
  const world = new Uint8Array(size * size * height);
  
  // Generate terrain with noise-like hills
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      const h = getTerrainHeight(x, z, size);
      for (let y = 0; y < h && y < height; y++) {
        const idx = x + z * size + y * size * size;
        if (y === h - 1) {
          world[idx] = 1; // grass top
        } else if (y > h - 4) {
          world[idx] = 2; // dirt
        } else {
          world[idx] = 3; // stone
        }
      }
    }
  }

  // Add trees
  for (let i = 0; i < size * 2; i++) {
    const tx = Math.floor(Math.random() * (size - 10)) + 5;
    const tz = Math.floor(Math.random() * (size - 10)) + 5;
    const th = getTerrainHeight(tx, tz, size);
    if (th > 2 && th < height - 8) {
      // Trunk
      for (let y = th; y < th + 5 && y < height; y++) {
        const idx = tx + tz * size + y * size * size;
        world[idx] = 4; // wood
      }
      // Leaves
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          for (let dy = 3; dy <= 6; dy++) {
            if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy - 4) < 5) {
              const lx = tx + dx, lz = tz + dz, ly = th + dy;
              if (lx >= 0 && lx < size && lz >= 0 && lz < size && ly < height) {
                const idx = lx + lz * size + ly * size * size;
                if (world[idx] === 0) world[idx] = 8; // green leaves
              }
            }
          }
        }
      }
    }
  }

  // Add some structures (small forts)
  for (let i = 0; i < 8; i++) {
    const sx = Math.floor(Math.random() * (size - 20)) + 10;
    const sz = Math.floor(Math.random() * (size - 20)) + 10;
    const sh = getTerrainHeight(sx, sz, size);
    buildFort(world, sx, sz, sh, size, height);
  }

  return world;
}

function buildFort(world: Uint8Array, x: number, z: number, groundY: number, size: number, height: number) {
  const w = 5, h = 4;
  for (let dx = 0; dx < w; dx++) {
    for (let dz = 0; dz < w; dz++) {
      for (let dy = 0; dy < h; dy++) {
        const bx = x + dx, bz = z + dz, by = groundY + dy;
        if (bx >= 0 && bx < size && bz >= 0 && bz < size && by < height) {
          // Walls only on edges, floor and ceiling
          if (dx === 0 || dx === w - 1 || dz === 0 || dz === w - 1 || dy === 0 || dy === h - 1) {
            // Leave door opening
            if (dx === 2 && dz === 0 && dy < 2) continue;
            // Windows
            if (dy === 2 && (dx === 0 || dx === w - 1 || dz === 0 || dz === w - 1) && (dx === 2 || dz === 2)) continue;
            const idx = bx + bz * size + by * size * size;
            world[idx] = dy === h - 1 ? 7 : 3; // orange roof, stone walls
          }
        }
      }
    }
  }
}

export function getTerrainHeight(x: number, z: number, size: number): number {
  // Simple pseudo-noise terrain
  let h = 3;
  h += Math.sin(x * 0.05) * 3;
  h += Math.cos(z * 0.07) * 2;
  h += Math.sin(x * 0.02 + z * 0.03) * 4;
  h += Math.cos(x * 0.1) * Math.sin(z * 0.08) * 2;
  // Create some flat areas
  const cx = size / 2, cz = size / 2;
  const dist = Math.sqrt((x - cx) ** 2 + (z - cz) ** 2);
  if (dist < 15) h = Math.max(h, 5);
  return Math.max(2, Math.min(Math.floor(h + 6), 20));
}

export function getBlock(state: GameState, x: number, y: number, z: number): number {
  const { world, worldSize, worldHeight } = state;
  if (x < 0 || x >= worldSize || z < 0 || z >= worldSize || y < 0 || y >= worldHeight) return 0;
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  return world[ix + iz * worldSize + iy * worldSize * worldSize];
}

export function setBlock(state: GameState, x: number, y: number, z: number, block: number): void {
  const { world, worldSize, worldHeight } = state;
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  if (ix < 0 || ix >= worldSize || iz < 0 || iz >= worldSize || iy < 0 || iy >= worldHeight) return;
  world[ix + iz * worldSize + iy * worldSize * worldSize] = block;
}

export function findSpawnPoint(state: GameState): Vec3 {
  const { worldSize } = state;
  for (let attempts = 0; attempts < 100; attempts++) {
    const x = Math.floor(Math.random() * (worldSize - 20)) + 10;
    const z = Math.floor(Math.random() * (worldSize - 20)) + 10;
    const h = getTerrainHeight(x, z, worldSize);
    // Check if space is clear
    if (getBlock(state, x, h, z) === 0 && getBlock(state, x, h + 1, z) === 0) {
      return { x: x + 0.5, y: h + 0.1, z: z + 0.5 };
    }
  }
  return { x: worldSize / 2, y: 15, z: worldSize / 2 };
}

export function raycastWorld(state: GameState, origin: Vec3, dir: Vec3, maxDist: number): { hit: boolean; pos: Vec3; normal: Vec3; blockPos: Vec3; dist: number } {
  // DDA raycasting
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = dir.x >= 0 ? 1 : -1;
  const stepY = dir.y >= 0 ? 1 : -1;
  const stepZ = dir.z >= 0 ? 1 : -1;

  const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : 1e10;
  const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : 1e10;
  const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : 1e10;

  let tMaxX = dir.x !== 0 ? ((dir.x > 0 ? x + 1 - origin.x : origin.x - x) * tDeltaX) : 1e10;
  let tMaxY = dir.y !== 0 ? ((dir.y > 0 ? y + 1 - origin.y : origin.y - y) * tDeltaY) : 1e10;
  let tMaxZ = dir.z !== 0 ? ((dir.z > 0 ? z + 1 - origin.z : origin.z - z) * tDeltaZ) : 1e10;

  let dist = 0;
  let normal: Vec3 = { x: 0, y: 0, z: 0 };

  for (let i = 0; i < maxDist * 2; i++) {
    const block = getBlock(state, x, y, z);
    if (block > 0) {
      return {
        hit: true,
        pos: { x: origin.x + dir.x * dist, y: origin.y + dir.y * dist, z: origin.z + dir.z * dist },
        normal,
        blockPos: { x, y, z },
        dist,
      };
    }

    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        dist = tMaxX;
        x += stepX;
        tMaxX += tDeltaX;
        normal = { x: -stepX, y: 0, z: 0 };
      } else {
        dist = tMaxZ;
        z += stepZ;
        tMaxZ += tDeltaZ;
        normal = { x: 0, y: 0, z: -stepZ };
      }
    } else {
      if (tMaxY < tMaxZ) {
        dist = tMaxY;
        y += stepY;
        tMaxY += tDeltaY;
        normal = { x: 0, y: -stepY, z: 0 };
      } else {
        dist = tMaxZ;
        z += stepZ;
        tMaxZ += tDeltaZ;
        normal = { x: 0, y: 0, z: -stepZ };
      }
    }

    if (dist > maxDist) break;
  }

  return {
    hit: false,
    pos: { x: origin.x + dir.x * maxDist, y: origin.y + dir.y * maxDist, z: origin.z + dir.z * maxDist },
    normal: { x: 0, y: 0, z: 0 },
    blockPos: { x: 0, y: 0, z: 0 },
    dist: maxDist,
  };
}
