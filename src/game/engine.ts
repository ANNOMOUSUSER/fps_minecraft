import { GameState, Player, WEAPONS, Vec3 } from './types';
import { createWorld, getBlock, setBlock, findSpawnPoint, raycastWorld, getTerrainHeight } from './world';

const WORLD_SIZE = 100;
const WORLD_HEIGHT = 32;
const GRAVITY = -15;
const JUMP_FORCE = 7;
const PLAYER_SPEED = 6;
const ENEMY_COUNT = 15;

export function createGameState(): GameState {
  const world = createWorld(WORLD_SIZE, WORLD_HEIGHT);

  const state: GameState = {
    player: {
      pos: { x: WORLD_SIZE / 2, y: 20, z: WORLD_SIZE / 2 },
      vel: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      health: 100,
      maxHealth: 100,
      shield: 50,
      maxShield: 100,
      onGround: false,
      materials: 100,
      ammo: 120,
      kills: 0,
      weapon: 'rifle',
      lastShot: 0,
      buildMode: false,
      selectedBlock: 5,
      godMode: false,
    },
    enemies: [],
    particles: [],
    items: [],
    world,
    worldSize: WORLD_SIZE,
    worldHeight: WORLD_HEIGHT,
    stormRadius: WORLD_SIZE * 0.6,
    stormCenter: { x: WORLD_SIZE / 2, y: 0, z: WORLD_SIZE / 2 },
    stormDamageTimer: 0,
    gameTime: 0,
    gameOver: false,
    gameWon: false,
    playersAlive: ENEMY_COUNT + 1,
    totalPlayers: ENEMY_COUNT + 1,
    score: 0,
    wave: 1,
    showMessage: '',
    messageTimer: 0,
    screenShake: 0,
  };

  // Find spawn point for player
  state.player.pos = findSpawnPoint(state);

  // Spawn enemies
  const enemyColors = ['#e74c3c', '#9b59b6', '#e67e22', '#1abc9c', '#c0392b', '#8e44ad', '#d35400', '#16a085'];
  for (let i = 0; i < ENEMY_COUNT; i++) {
    const spawn = findSpawnPoint(state);
    state.enemies.push({
      id: i,
      pos: { ...spawn },
      vel: { x: 0, y: 0, z: 0 },
      health: 100,
      maxHealth: 100,
      yaw: Math.random() * Math.PI * 2,
      speed: 2 + Math.random() * 2,
      lastShot: 0,
      state: 'wander',
      targetPos: null,
      color: enemyColors[i % enemyColors.length],
      buildCooldown: 0,
    });
  }

  // Drop some items around the world
  for (let i = 0; i < 30; i++) {
    const ix = Math.random() * (WORLD_SIZE - 10) + 5;
    const iz = Math.random() * (WORLD_SIZE - 10) + 5;
    const iy = getTerrainHeight(Math.floor(ix), Math.floor(iz), WORLD_SIZE) + 0.5;
    const types: Array<'health' | 'shield' | 'ammo' | 'materials'> = ['health', 'shield', 'ammo', 'materials'];
    state.items.push({
      pos: { x: ix, y: iy, z: iz },
      type: types[Math.floor(Math.random() * types.length)],
      amount: 25 + Math.floor(Math.random() * 25),
      bobPhase: Math.random() * Math.PI * 2,
    });
  }

  state.showMessage = 'WELCOME TO VOXELROYALE!';
  state.messageTimer = 120;

  return state;
}

export function updateGame(state: GameState, dt: number, keys: Set<string>) {
  if (state.gameOver) return;

  state.gameTime += dt;
  state.screenShake = Math.max(0, state.screenShake - dt * 5);

  // Update message timer
  if (state.messageTimer > 0) state.messageTimer -= 1;

  // Update storm
  updateStorm(state, dt);

  // Update player
  updatePlayer(state, dt, keys);

  // Update enemies
  updateEnemies(state, dt);

  // Update particles
  updateParticles(state, dt);

  // Update items
  for (const item of state.items) {
    item.bobPhase += dt * 3;
  }

  // Pick up items
  pickupItems(state);

  // Check win condition
  if (state.enemies.length === 0 && !state.gameOver) {
    state.wave++;
    if (state.wave > 3) {
      state.gameOver = true;
      state.gameWon = true;
      state.showMessage = 'VICTORY ROYALE!';
      state.messageTimer = 300;
    } else {
      spawnNewWave(state);
      state.showMessage = `WAVE ${state.wave}!`;
      state.messageTimer = 120;
    }
  }
}

function updateStorm(state: GameState, dt: number) {
  // Slowly shrink storm
  state.stormRadius = Math.max(15, state.stormRadius - dt * 0.3);

  // Check if player is in storm
  const { player, stormCenter, stormRadius } = state;
  const dist = Math.sqrt(
    (player.pos.x - stormCenter.x) ** 2 +
    (player.pos.z - stormCenter.z) ** 2
  );

  if (dist > stormRadius) {
    state.stormDamageTimer += dt;
    if (state.stormDamageTimer > 1) {
      state.stormDamageTimer = 0;
      damagePlayer(state, 5);
    }
  }

  // Check enemies in storm
  for (const e of state.enemies) {
    const eDist = Math.sqrt(
      (e.pos.x - stormCenter.x) ** 2 +
      (e.pos.z - stormCenter.z) ** 2
    );
    if (eDist > stormRadius) {
      e.health -= dt * 5;
    }
  }
}

function updatePlayer(state: GameState, dt: number, keys: Set<string>) {
  const { player } = state;

  // Movement
  let moveX = 0, moveZ = 0;
  if (keys.has('w') || keys.has('arrowup')) { moveX += Math.cos(player.yaw); moveZ += Math.sin(player.yaw); }
  if (keys.has('s') || keys.has('arrowdown')) { moveX -= Math.cos(player.yaw); moveZ -= Math.sin(player.yaw); }
  if (keys.has('a') || keys.has('arrowleft')) { moveX += Math.cos(player.yaw - Math.PI / 2); moveZ += Math.sin(player.yaw - Math.PI / 2); }
  if (keys.has('d') || keys.has('arrowright')) { moveX -= Math.cos(player.yaw - Math.PI / 2); moveZ -= Math.sin(player.yaw - Math.PI / 2); }

  const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
  if (len > 0) {
    moveX /= len;
    moveZ /= len;
  }

  player.vel.x = moveX * PLAYER_SPEED;
  player.vel.z = moveZ * PLAYER_SPEED;

  // Gravity
  player.vel.y += GRAVITY * dt;

  // Jump
  if ((keys.has(' ') || keys.has('space')) && player.onGround) {
    player.vel.y = JUMP_FORCE;
    player.onGround = false;
  }

  // Apply velocity with collision
  applyPhysics(state, player.pos, player.vel, dt, 0.3, 1.8);

  // Ground check
  const feetBlock = getBlock(state, player.pos.x, player.pos.y - 0.1, player.pos.z);
  player.onGround = feetBlock > 0;
  if (player.onGround && player.vel.y < 0) {
    player.vel.y = 0;
    player.pos.y = Math.ceil(player.pos.y);
  }

  // Clamp to world bounds
  player.pos.x = Math.max(1, Math.min(WORLD_SIZE - 2, player.pos.x));
  player.pos.z = Math.max(1, Math.min(WORLD_SIZE - 2, player.pos.z));

  // Fall damage
  if (player.pos.y < 0) {
    player.pos.y = 20;
    damagePlayer(state, 30);
  }
}

function applyPhysics(state: GameState, pos: Vec3, vel: Vec3, dt: number, radius: number, height: number) {
  // X movement
  const newX = pos.x + vel.x * dt;
  if (!isColliding(state, newX, pos.y, pos.z, radius, height)) {
    pos.x = newX;
  } else {
    vel.x = 0;
  }

  // Z movement
  const newZ = pos.z + vel.z * dt;
  if (!isColliding(state, pos.x, pos.y, newZ, radius, height)) {
    pos.z = newZ;
  } else {
    vel.z = 0;
  }

  // Y movement
  const newY = pos.y + vel.y * dt;
  if (!isColliding(state, pos.x, newY, pos.z, radius, height)) {
    pos.y = newY;
  } else {
    if (vel.y < 0) {
      pos.y = Math.ceil(pos.y);
    }
    vel.y = 0;
  }
}

function isColliding(state: GameState, x: number, y: number, z: number, radius: number, height: number): boolean {
  // Check surrounding blocks
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = 0; dy < Math.ceil(height); dy++) {
        const bx = Math.floor(x + dx * radius);
        const bz = Math.floor(z + dz * radius);
        const by = Math.floor(y + dy);
        if (getBlock(state, bx, by, bz) > 0) {
          // AABB check
          const blockMinX = bx, blockMaxX = bx + 1;
          const blockMinZ = bz, blockMaxZ = bz + 1;
          const blockMinY = by, blockMaxY = by + 1;
          if (x + radius > blockMinX && x - radius < blockMaxX &&
              z + radius > blockMinZ && z - radius < blockMaxZ &&
              y + height > blockMinY && y < blockMaxY) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

function updateEnemies(state: GameState, dt: number) {
  const toRemove: number[] = [];

  for (let i = 0; i < state.enemies.length; i++) {
    const enemy = state.enemies[i];

    // Check death
    if (enemy.health <= 0) {
      toRemove.push(i);
      state.player.kills++;
      state.score += 100;
      state.playersAlive--;
      state.showMessage = `ELIMINATED! (${state.playersAlive} remaining)`;
      state.messageTimer = 90;

      // Death particles
      for (let p = 0; p < 15; p++) {
        state.particles.push({
          pos: { ...enemy.pos },
          vel: {
            x: (Math.random() - 0.5) * 8,
            y: Math.random() * 6,
            z: (Math.random() - 0.5) * 8,
          },
          life: 1,
          maxLife: 1,
          color: enemy.color,
          size: 0.3 + Math.random() * 0.3,
        });
      }

      // Drop loot
      const lootTypes: Array<'health' | 'shield' | 'ammo' | 'materials'> = ['health', 'shield', 'ammo', 'materials'];
      for (let l = 0; l < 2; l++) {
        state.items.push({
          pos: { x: enemy.pos.x + (Math.random() - 0.5) * 2, y: enemy.pos.y, z: enemy.pos.z + (Math.random() - 0.5) * 2 },
          type: lootTypes[Math.floor(Math.random() * lootTypes.length)],
          amount: 20 + Math.floor(Math.random() * 30),
          bobPhase: Math.random() * Math.PI * 2,
        });
      }
      continue;
    }

    // AI behavior
    const dx = state.player.pos.x - enemy.pos.x;
    const dz = state.player.pos.z - enemy.pos.z;
    const distToPlayer = Math.sqrt(dx * dx + dz * dz);

    if (distToPlayer < 30) {
      enemy.state = distToPlayer < 15 ? 'attack' : 'chase';
    } else {
      enemy.state = 'wander';
    }

    // Enemy building (Fortnite-style)
    if (enemy.state === 'attack' && enemy.buildCooldown <= 0 && Math.random() < 0.01) {
      // Build defensive wall
      const bx = Math.floor(enemy.pos.x + Math.cos(enemy.yaw) * 2);
      const bz = Math.floor(enemy.pos.z + Math.sin(enemy.yaw) * 2);
      const by = Math.floor(enemy.pos.y);
      for (let h = 0; h < 3; h++) {
        if (getBlock(state, bx, by + h, bz) === 0) {
          setBlock(state, bx, by + h, bz, 6); // red blocks
        }
      }
      enemy.buildCooldown = 3;
    }
    enemy.buildCooldown = Math.max(0, enemy.buildCooldown - dt);

    let moveX = 0, moveZ = 0;

    switch (enemy.state) {
      case 'wander':
        if (!enemy.targetPos || Math.random() < 0.02) {
          enemy.targetPos = {
            x: enemy.pos.x + (Math.random() - 0.5) * 20,
            y: enemy.pos.y,
            z: enemy.pos.z + (Math.random() - 0.5) * 20,
          };
        }
        moveX = enemy.targetPos.x - enemy.pos.x;
        moveZ = enemy.targetPos.z - enemy.pos.z;
        break;

      case 'chase':
        moveX = dx;
        moveZ = dz;
        enemy.yaw = Math.atan2(dz, dx);
        break;

      case 'attack':
        enemy.yaw = Math.atan2(dz, dx);
        // Strafe
        moveX = Math.cos(enemy.yaw + Math.PI / 2 + Math.sin(state.gameTime * 2 + enemy.id) * Math.PI);
        moveZ = Math.sin(enemy.yaw + Math.PI / 2 + Math.sin(state.gameTime * 2 + enemy.id) * Math.PI);

        // Shoot at player
        const now = Date.now();
        if (now - enemy.lastShot > 800 + Math.random() * 400) {
          enemy.lastShot = now;
          // Raycast towards player
          const dirLen = Math.sqrt(dx * dx + dz * dz);
          if (dirLen > 0) {
            const dy = (state.player.pos.y + 1) - (enemy.pos.y + 1.5);
            const totalLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const spread = 0.05;
            const shootDir: Vec3 = {
              x: dx / totalLen + (Math.random() - 0.5) * spread,
              y: dy / totalLen + (Math.random() - 0.5) * spread,
              z: dz / totalLen + (Math.random() - 0.5) * spread,
            };

            const result = raycastWorld(state, { x: enemy.pos.x, y: enemy.pos.y + 1.5, z: enemy.pos.z }, shootDir, 50);
            if (!result.hit || result.dist > distToPlayer - 1) {
              // Hit player
              const dmg = 8 + Math.random() * 7;
              damagePlayer(state, dmg);
              state.screenShake = 0.5;

              // Muzzle flash particles
              state.particles.push({
                pos: { x: enemy.pos.x + shootDir.x * 0.5, y: enemy.pos.y + 1.5 + shootDir.y * 0.5, z: enemy.pos.z + shootDir.z * 0.5 },
                vel: { x: shootDir.x * 5, y: shootDir.y * 5, z: shootDir.z * 5 },
                life: 0.2,
                maxLife: 0.2,
                color: '#FFD700',
                size: 0.3,
              });
            }
          }
        }
        break;
    }

    // Normalize movement
    const mLen = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (mLen > 0) {
      moveX = (moveX / mLen) * enemy.speed;
      moveZ = (moveZ / mLen) * enemy.speed;
      enemy.yaw = Math.atan2(moveZ, moveX);
    }

    enemy.vel.x = moveX;
    enemy.vel.z = moveZ;
    enemy.vel.y += GRAVITY * dt;

    applyPhysics(state, enemy.pos, enemy.vel, dt, 0.3, 1.8);

    // Ground check
    const feetBlock = getBlock(state, enemy.pos.x, enemy.pos.y - 0.1, enemy.pos.z);
    if (feetBlock > 0 && enemy.vel.y < 0) {
      enemy.vel.y = 0;
      enemy.pos.y = Math.ceil(enemy.pos.y);
    }

    // Jump if blocked
    const headBlock = getBlock(state, enemy.pos.x + Math.cos(enemy.yaw) * 0.5, enemy.pos.y + 0.5, enemy.pos.z + Math.sin(enemy.yaw) * 0.5);
    if (headBlock > 0 && feetBlock > 0) {
      enemy.vel.y = JUMP_FORCE;
    }

    // Clamp
    enemy.pos.x = Math.max(1, Math.min(WORLD_SIZE - 2, enemy.pos.x));
    enemy.pos.z = Math.max(1, Math.min(WORLD_SIZE - 2, enemy.pos.z));
    if (enemy.pos.y < 0) enemy.pos.y = 20;
  }

  // Remove dead enemies (reverse order)
  for (let i = toRemove.length - 1; i >= 0; i--) {
    state.enemies.splice(toRemove[i], 1);
  }
}

function updateParticles(state: GameState, dt: number) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.pos.z += p.vel.z * dt;
    p.vel.y += GRAVITY * 0.5 * dt;
    p.life -= dt;
    if (p.life <= 0) {
      state.particles.splice(i, 1);
    }
  }
}

function pickupItems(state: GameState) {
  const { player } = state;
  for (let i = state.items.length - 1; i >= 0; i--) {
    const item = state.items[i];
    const dx = player.pos.x - item.pos.x;
    const dy = player.pos.y - item.pos.y;
    const dz = player.pos.z - item.pos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 1.5) {
      switch (item.type) {
        case 'health':
          player.health = Math.min(player.maxHealth, player.health + item.amount);
          break;
        case 'shield':
          player.shield = Math.min(player.maxShield, player.shield + item.amount);
          break;
        case 'ammo':
          player.ammo += item.amount;
          break;
        case 'materials':
          player.materials += item.amount;
          break;
      }
      state.items.splice(i, 1);
    }
  }
}

function damagePlayer(state: GameState, damage: number) {
  const { player } = state;
  
  // God mode - no damage taken
  if (player.godMode) {
    return;
  }
  
  if (player.shield > 0) {
    const shieldDmg = Math.min(player.shield, damage);
    player.shield -= shieldDmg;
    damage -= shieldDmg;
  }
  player.health -= damage;
  state.screenShake = Math.max(state.screenShake, damage / 20);

  if (player.health <= 0) {
    player.health = 0;
    state.gameOver = true;
    state.gameWon = false;
  }
}

export function playerShoot(state: GameState) {
  if (state.gameOver) return;

  const { player } = state;
  const weapon = WEAPONS[player.weapon];
  const now = Date.now();

  if (player.buildMode) {
    // Place block
    if (player.materials < 10) return;
    const dir = getPlayerLookDir(player);
    const result = raycastWorld(state,
      { x: player.pos.x, y: player.pos.y + 1.6, z: player.pos.z },
      dir, 6
    );
    if (result.hit) {
      const px = Math.floor(result.blockPos.x + result.normal.x);
      const py = Math.floor(result.blockPos.y + result.normal.y);
      const pz = Math.floor(result.blockPos.z + result.normal.z);
      if (getBlock(state, px, py, pz) === 0) {
        setBlock(state, px, py, pz, player.selectedBlock);
        player.materials -= 10;
        // Place sound particle
        state.particles.push({
          pos: { x: px + 0.5, y: py + 0.5, z: pz + 0.5 },
          vel: { x: 0, y: 2, z: 0 },
          life: 0.3,
          maxLife: 0.3,
          color: '#fff',
          size: 0.5,
        });
      }
    }
    return;
  }

  if (now - player.lastShot < weapon.fireRate) return;
  if (player.ammo < weapon.ammoPerShot) return;

  player.lastShot = now;
  player.ammo -= weapon.ammoPerShot;
  state.screenShake = 0.3;

  for (let pellet = 0; pellet < weapon.pellets; pellet++) {
    const dir = getPlayerLookDir(player);
    dir.x += (Math.random() - 0.5) * weapon.spread;
    dir.y += (Math.random() - 0.5) * weapon.spread;
    dir.z += (Math.random() - 0.5) * weapon.spread;

    // Normalize
    const len = Math.sqrt(dir.x ** 2 + dir.y ** 2 + dir.z ** 2);
    dir.x /= len; dir.y /= len; dir.z /= len;

    const origin = { x: player.pos.x, y: player.pos.y + 1.6, z: player.pos.z };
    const result = raycastWorld(state, origin, dir, weapon.range);

    // Check enemy hits
    let hitEnemy = false;
    for (const enemy of state.enemies) {
      const toEnemy = {
        x: enemy.pos.x - origin.x,
        y: enemy.pos.y + 0.9 - origin.y,
        z: enemy.pos.z - origin.z,
      };
      const dot = toEnemy.x * dir.x + toEnemy.y * dir.y + toEnemy.z * dir.z;
      if (dot < 0 || dot > weapon.range) continue;

      const closestPoint = {
        x: origin.x + dir.x * dot,
        y: origin.y + dir.y * dot,
        z: origin.z + dir.z * dot,
      };
      const dx = closestPoint.x - enemy.pos.x;
      const dy = closestPoint.y - (enemy.pos.y + 0.9);
      const dz = closestPoint.z - enemy.pos.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq < 0.6 && (!result.hit || dot < result.dist)) {
        enemy.health -= weapon.damage;
        hitEnemy = true;
        state.score += 10;

        // Hit particles
        for (let p = 0; p < 5; p++) {
          state.particles.push({
            pos: { ...closestPoint },
            vel: {
              x: (Math.random() - 0.5) * 5,
              y: Math.random() * 3,
              z: (Math.random() - 0.5) * 5,
            },
            life: 0.5,
            maxLife: 0.5,
            color: '#e74c3c',
            size: 0.2,
          });
        }
        break;
      }
    }

    if (!hitEnemy && result.hit) {
      // Block hit particles
      for (let p = 0; p < 3; p++) {
        state.particles.push({
          pos: { ...result.pos },
          vel: {
            x: result.normal.x * 3 + (Math.random() - 0.5) * 3,
            y: result.normal.y * 3 + Math.random() * 2,
            z: result.normal.z * 3 + (Math.random() - 0.5) * 3,
          },
          life: 0.4,
          maxLife: 0.4,
          color: '#aaa',
          size: 0.15,
        });
      }
    }
  }
}

export function playerDestroyBlock(state: GameState) {
  if (state.gameOver) return;
  const { player } = state;
  const dir = getPlayerLookDir(player);
  const result = raycastWorld(state,
    { x: player.pos.x, y: player.pos.y + 1.6, z: player.pos.z },
    dir, 6
  );
  if (result.hit) {
    const block = getBlock(state, result.blockPos.x, result.blockPos.y, result.blockPos.z);
    if (block > 0) {
      setBlock(state, result.blockPos.x, result.blockPos.y, result.blockPos.z, 0);
      player.materials += 5;

      // Destruction particles
      for (let p = 0; p < 8; p++) {
        state.particles.push({
          pos: { x: result.blockPos.x + 0.5, y: result.blockPos.y + 0.5, z: result.blockPos.z + 0.5 },
          vel: {
            x: (Math.random() - 0.5) * 6,
            y: Math.random() * 4,
            z: (Math.random() - 0.5) * 6,
          },
          life: 0.6,
          maxLife: 0.6,
          color: '#8B6914',
          size: 0.2,
        });
      }
    }
  }
}

function getPlayerLookDir(player: Player): Vec3 {
  return {
    x: Math.cos(player.yaw) * Math.cos(player.pitch),
    y: Math.sin(player.pitch),
    z: Math.sin(player.yaw) * Math.cos(player.pitch),
  };
}

function spawnNewWave(state: GameState) {
  const count = 10 + state.wave * 5;
  const enemyColors = ['#e74c3c', '#9b59b6', '#e67e22', '#1abc9c', '#c0392b', '#8e44ad', '#d35400', '#16a085'];

  for (let i = 0; i < count; i++) {
    const spawn = findSpawnPoint(state);
    state.enemies.push({
      id: i + state.wave * 100,
      pos: { ...spawn },
      vel: { x: 0, y: 0, z: 0 },
      health: 80 + state.wave * 20,
      maxHealth: 80 + state.wave * 20,
      yaw: Math.random() * Math.PI * 2,
      speed: 2 + Math.random() * 2 + state.wave * 0.5,
      lastShot: 0,
      state: 'wander',
      targetPos: null,
      color: enemyColors[i % enemyColors.length],
      buildCooldown: 0,
    });
  }

  state.playersAlive = state.enemies.length + 1;

  // Drop supplies
  for (let i = 0; i < 10; i++) {
    const ix = Math.random() * (WORLD_SIZE - 10) + 5;
    const iz = Math.random() * (WORLD_SIZE - 10) + 5;
    const iy = getTerrainHeight(Math.floor(ix), Math.floor(iz), WORLD_SIZE) + 0.5;
    const types: Array<'health' | 'shield' | 'ammo' | 'materials'> = ['health', 'shield', 'ammo', 'materials'];
    state.items.push({
      pos: { x: ix, y: iy, z: iz },
      type: types[Math.floor(Math.random() * types.length)],
      amount: 30 + Math.floor(Math.random() * 30),
      bobPhase: Math.random() * Math.PI * 2,
    });
  }
}
