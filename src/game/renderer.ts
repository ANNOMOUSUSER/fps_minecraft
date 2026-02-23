import { GameState, BLOCK_COLORS, WEAPONS } from './types';
import { getBlock } from './world';

const SKY_TOP = '#1a1a3e';
const SKY_BOTTOM = '#4a90d9';

export function renderGame(ctx: CanvasRenderingContext2D, state: GameState, width: number, height: number) {
  // Clear with sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, height / 2);
  skyGrad.addColorStop(0, SKY_TOP);
  skyGrad.addColorStop(1, SKY_BOTTOM);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, width, height / 2);

  // Ground color below horizon
  ctx.fillStyle = '#3a5a2a';
  ctx.fillRect(0, height / 2, width, height / 2);

  const { player } = state;
  const eyeY = player.pos.y + 1.6;

  const fov = Math.PI / 3;
  const numColumns = Math.min(width, 320);
  const colWidth = width / numColumns;

  // Screen shake offset
  const shakeX = state.screenShake > 0 ? (Math.random() - 0.5) * state.screenShake * 4 : 0;
  const shakeY = state.screenShake > 0 ? (Math.random() - 0.5) * state.screenShake * 4 : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);

  // Render columns (raycasting)
  const depthBuffer: number[] = new Array(numColumns).fill(1000);
  
  for (let col = 0; col < numColumns; col++) {
    const screenX = (col / numColumns) * 2 - 1;
    const rayAngle = player.yaw + screenX * fov / 2;
    const cosRay = Math.cos(rayAngle);
    const sinRay = Math.sin(rayAngle);

    // Cast ray through voxel world
    const result = castColumnRay(state, player.pos.x, eyeY, player.pos.z, cosRay, sinRay, player.pitch, 60);
    
    for (const hit of result) {
      const perpDist = hit.dist * Math.cos(screenX * fov / 2);
      depthBuffer[col] = Math.min(depthBuffer[col], perpDist);
      
      const wallHeight = (height / perpDist) * 1;
      const wallTop = height / 2 - wallHeight * (hit.topY - eyeY) / 1 + player.pitch * height;
      const wallBottom = height / 2 - wallHeight * (hit.bottomY - eyeY) / 1 + player.pitch * height;
      
      // Get block color
      const baseColor = BLOCK_COLORS[hit.block] || '#888';
      const shade = Math.max(0.3, 1 - perpDist / 60);
      const sideShade = hit.side === 0 ? 1 : hit.side === 1 ? 0.85 : 0.7;
      
      ctx.fillStyle = shadeColor(baseColor, shade * sideShade);
      ctx.fillRect(col * colWidth, wallTop, colWidth + 1, wallBottom - wallTop + 1);
      
      // Add edge lines for Minecraft feel
      if (colWidth > 1.5) {
        ctx.fillStyle = shadeColor(baseColor, shade * sideShade * 0.7);
        ctx.fillRect(col * colWidth, wallTop, 1, wallBottom - wallTop + 1);
      }
    }
  }

  // Render enemies (billboard sprites)
  const sortedEnemies = state.enemies
    .map(e => {
      const dx = e.pos.x - player.pos.x;
      const dz = e.pos.z - player.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      return { ...e, dist, dx, dz };
    })
    .filter(e => e.dist > 0.5 && e.dist < 60)
    .sort((a, b) => b.dist - a.dist);

  for (const enemy of sortedEnemies) {
    const angle = Math.atan2(enemy.dz, enemy.dx) - player.yaw;
    let normAngle = angle;
    while (normAngle > Math.PI) normAngle -= Math.PI * 2;
    while (normAngle < -Math.PI) normAngle += Math.PI * 2;
    
    if (Math.abs(normAngle) < fov) {
      const screenX = (normAngle / fov + 0.5) * width;
      const spriteHeight = (height / enemy.dist) * 1.8;
      const spriteWidth = spriteHeight * 0.6;
      const spriteY = height / 2 - spriteHeight / 2 + player.pitch * height + 
        (eyeY - enemy.pos.y - 0.9) * (height / enemy.dist);

      // Check depth buffer
      const spriteCol = Math.floor(screenX / colWidth);
      if (spriteCol >= 0 && spriteCol < numColumns && enemy.dist < depthBuffer[spriteCol] + 1) {
        const shade = Math.max(0.3, 1 - enemy.dist / 60);
        
        // Body
        ctx.fillStyle = shadeColor(enemy.color, shade);
        ctx.fillRect(screenX - spriteWidth / 3, spriteY + spriteHeight * 0.3, spriteWidth * 0.66, spriteHeight * 0.5);
        
        // Head
        ctx.fillStyle = shadeColor('#FFD5B4', shade);
        const headSize = spriteWidth * 0.4;
        ctx.fillRect(screenX - headSize / 2, spriteY + spriteHeight * 0.05, headSize, headSize);
        
        // Eyes
        ctx.fillStyle = shadeColor('#222', shade);
        const eyeSize = headSize * 0.15;
        ctx.fillRect(screenX - headSize * 0.2, spriteY + spriteHeight * 0.12, eyeSize, eyeSize);
        ctx.fillRect(screenX + headSize * 0.1, spriteY + spriteHeight * 0.12, eyeSize, eyeSize);
        
        // Legs
        ctx.fillStyle = shadeColor('#333', shade);
        ctx.fillRect(screenX - spriteWidth / 4, spriteY + spriteHeight * 0.8, spriteWidth * 0.2, spriteHeight * 0.2);
        ctx.fillRect(screenX + spriteWidth / 12, spriteY + spriteHeight * 0.8, spriteWidth * 0.2, spriteHeight * 0.2);

        // Health bar
        if (enemy.health < enemy.maxHealth) {
          const barW = spriteWidth * 0.8;
          const barH = 4;
          const barX = screenX - barW / 2;
          const barY = spriteY - 8;
          ctx.fillStyle = '#333';
          ctx.fillRect(barX, barY, barW, barH);
          ctx.fillStyle = enemy.health > 50 ? '#2ecc71' : enemy.health > 25 ? '#f39c12' : '#e74c3c';
          ctx.fillRect(barX, barY, barW * (enemy.health / enemy.maxHealth), barH);
        }
      }
    }
  }

  // Render dropped items
  for (const item of state.items) {
    const dx = item.pos.x - player.pos.x;
    const dz = item.pos.z - player.pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.5 && dist < 30) {
      const angle = Math.atan2(dz, dx) - player.yaw;
      let normAngle = angle;
      while (normAngle > Math.PI) normAngle -= Math.PI * 2;
      while (normAngle < -Math.PI) normAngle += Math.PI * 2;
      
      if (Math.abs(normAngle) < fov) {
        const screenX = (normAngle / fov + 0.5) * width;
        const size = (height / dist) * 0.3;
        const bob = Math.sin(item.bobPhase) * size * 0.2;
        const spriteY = height / 2 + player.pitch * height + (eyeY - item.pos.y - 0.5) * (height / dist) + bob;
        
        const colors: Record<string, string> = {
          health: '#e74c3c', shield: '#3498db', ammo: '#f39c12', materials: '#8B6914'
        };
        ctx.fillStyle = colors[item.type] || '#fff';
        ctx.fillRect(screenX - size / 2, spriteY - size / 2, size, size);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(screenX - size / 2, spriteY - size / 2, size, size);
      }
    }
  }

  // Render particles
  for (const p of state.particles) {
    const dx = p.pos.x - player.pos.x;
    const dz = p.pos.z - player.pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.2 && dist < 40) {
      const angle = Math.atan2(dz, dx) - player.yaw;
      let normAngle = angle;
      while (normAngle > Math.PI) normAngle -= Math.PI * 2;
      while (normAngle < -Math.PI) normAngle += Math.PI * 2;
      
      if (Math.abs(normAngle) < fov) {
        const screenX = (normAngle / fov + 0.5) * width;
        const size = (height / dist) * p.size * 0.2;
        const spriteY = height / 2 + player.pitch * height + (eyeY - p.pos.y) * (height / dist);
        
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(screenX - size / 2, spriteY - size / 2, size, size);
        ctx.globalAlpha = 1;
      }
    }
  }

  ctx.restore();

  // Draw weapon
  drawWeapon(ctx, state, width, height);

  // Draw crosshair
  drawCrosshair(ctx, width, height, state.player.buildMode);

  // Draw HUD
  drawHUD(ctx, state, width, height);

  // Storm warning
  const playerDist = Math.sqrt(
    (player.pos.x - state.stormCenter.x) ** 2 + 
    (player.pos.z - state.stormCenter.z) ** 2
  );
  if (playerDist > state.stormRadius * 0.8) {
    ctx.fillStyle = `rgba(128, 0, 255, ${0.1 + Math.sin(state.gameTime * 3) * 0.05})`;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#ff6b6b';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⚠ STORM APPROACHING - MOVE TO SAFE ZONE ⚠', width / 2, 80);
  }

  // Message display
  if (state.messageTimer > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, state.messageTimer / 30)})`;
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(state.showMessage, width / 2, height / 3);
  }

  // Game over screen
  if (state.gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center';
    
    if (state.gameWon) {
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 48px monospace';
      ctx.fillText('🏆 VICTORY ROYALE! 🏆', width / 2, height / 2 - 40);
    } else {
      ctx.fillStyle = '#e74c3c';
      ctx.font = 'bold 48px monospace';
      ctx.fillText('ELIMINATED', width / 2, height / 2 - 40);
    }
    
    ctx.fillStyle = '#fff';
    ctx.font = '20px monospace';
    ctx.fillText(`Score: ${state.score} | Kills: ${state.player.kills}`, width / 2, height / 2 + 20);
    ctx.fillText('Click to play again', width / 2, height / 2 + 60);
  }
}

function castColumnRay(
  state: GameState,
  ox: number, _oy: number, oz: number,
  dirX: number, dirZ: number,
  _pitch: number,
  maxDist: number
): Array<{ dist: number; block: number; topY: number; bottomY: number; side: number }> {
  const results: Array<{ dist: number; block: number; topY: number; bottomY: number; side: number }> = [];
  
  let x = Math.floor(ox);
  let z = Math.floor(oz);
  
  const stepX = dirX >= 0 ? 1 : -1;
  const stepZ = dirZ >= 0 ? 1 : -1;
  
  const tDeltaX = dirX !== 0 ? Math.abs(1 / dirX) : 1e10;
  const tDeltaZ = dirZ !== 0 ? Math.abs(1 / dirZ) : 1e10;
  
  let tMaxX = dirX !== 0 ? ((dirX > 0 ? x + 1 - ox : ox - x) * tDeltaX) : 1e10;
  let tMaxZ = dirZ !== 0 ? ((dirZ > 0 ? z + 1 - oz : oz - z) * tDeltaZ) : 1e10;
  
  let dist = 0;
  let side = 0;
  
  for (let i = 0; i < maxDist * 2; i++) {
    // Check column at (x, z) for blocks
    for (let y = 0; y < state.worldHeight; y++) {
      const block = getBlock(state, x, y, z);
      if (block > 0) {
        results.push({ dist, block, topY: y + 1, bottomY: y, side });
      }
    }
    
    if (tMaxX < tMaxZ) {
      dist = tMaxX;
      x += stepX;
      tMaxX += tDeltaX;
      side = 0;
    } else {
      dist = tMaxZ;
      z += stepZ;
      tMaxZ += tDeltaZ;
      side = 1;
    }
    
    if (dist > maxDist) break;
  }
  
  return results;
}

function drawWeapon(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number) {
  const weapon = WEAPONS[state.player.weapon];
  const now = Date.now();
  const timeSinceShot = now - state.player.lastShot;
  const recoil = timeSinceShot < 100 ? (1 - timeSinceShot / 100) * 15 : 0;
  const bob = Math.sin(state.gameTime * 5) * 3;

  if (state.player.buildMode) {
    // Draw building tool
    const bx = w * 0.7;
    const by = h * 0.65 + bob - recoil;
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(bx, by, 15, 80);
    ctx.fillStyle = '#aaa';
    ctx.fillRect(bx - 10, by - 5, 35, 15);
    
    // Block preview
    ctx.fillStyle = BLOCK_COLORS[state.player.selectedBlock] || '#888';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.fillRect(w * 0.7 - 20, h * 0.55, 30, 30);
    ctx.strokeRect(w * 0.7 - 20, h * 0.55, 30, 30);
  } else {
    // Draw weapon
    const wx = w * 0.65;
    const wy = h * 0.6 + bob - recoil;
    
    // Barrel
    ctx.fillStyle = '#555';
    ctx.fillRect(wx + 10, wy - 5, 60, 10);
    
    // Body
    ctx.fillStyle = weapon.color;
    ctx.fillRect(wx - 5, wy, 50, 20);
    
    // Handle
    ctx.fillStyle = '#333';
    ctx.fillRect(wx + 5, wy + 15, 15, 35);
    
    // Muzzle flash
    if (timeSinceShot < 50) {
      ctx.fillStyle = `rgba(255, 200, 50, ${1 - timeSinceShot / 50})`;
      ctx.beginPath();
      ctx.arc(wx + 75, wy, 15 + Math.random() * 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCrosshair(ctx: CanvasRenderingContext2D, w: number, h: number, buildMode: boolean) {
  const cx = w / 2;
  const cy = h / 2;
  const size = 12;
  const gap = 4;

  ctx.strokeStyle = buildMode ? '#4ECDC4' : '#fff';
  ctx.lineWidth = 2;
  
  // Top
  ctx.beginPath();
  ctx.moveTo(cx, cy - gap);
  ctx.lineTo(cx, cy - size);
  ctx.stroke();
  // Bottom
  ctx.beginPath();
  ctx.moveTo(cx, cy + gap);
  ctx.lineTo(cx, cy + size);
  ctx.stroke();
  // Left
  ctx.beginPath();
  ctx.moveTo(cx - gap, cy);
  ctx.lineTo(cx - size, cy);
  ctx.stroke();
  // Right
  ctx.beginPath();
  ctx.moveTo(cx + gap, cy);
  ctx.lineTo(cx + size, cy);
  ctx.stroke();
  
  if (buildMode) {
    ctx.strokeStyle = '#4ECDC4';
    ctx.strokeRect(cx - size, cy - size, size * 2, size * 2);
  }
}

function drawHUD(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number) {
  const p = state.player;
  const weapon = WEAPONS[p.weapon];
  
  // Bottom HUD background
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, h - 80, w, 80);
  
  // Health bar
  const barX = 15;
  const barY = h - 65;
  const barW = 200;
  const barH = 20;
  
  ctx.fillStyle = '#333';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = p.health > 60 ? '#2ecc71' : p.health > 30 ? '#f39c12' : '#e74c3c';
  ctx.fillRect(barX, barY, barW * (p.health / p.maxHealth), barH);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, barH);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`HP ${Math.ceil(p.health)}`, barX + barW / 2, barY + 15);
  
  // Shield bar
  ctx.fillStyle = '#333';
  ctx.fillRect(barX, barY + 25, barW, barH);
  ctx.fillStyle = '#3498db';
  ctx.fillRect(barX, barY + 25, barW * (p.shield / p.maxShield), barH);
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(barX, barY + 25, barW, barH);
  ctx.fillStyle = '#fff';
  ctx.fillText(`SHIELD ${Math.ceil(p.shield)}`, barX + barW / 2, barY + 40);
  
  // Weapon info
  ctx.textAlign = 'left';
  ctx.font = 'bold 14px monospace';
  ctx.fillStyle = weapon.color;
  ctx.fillText(weapon.name, barX + barW + 20, barY + 15);
  ctx.fillStyle = '#fff';
  ctx.fillText(`Ammo: ${p.ammo}`, barX + barW + 20, barY + 35);
  
  // Materials
  ctx.fillStyle = '#8B6914';
  ctx.fillRect(barX + barW + 160, barY, 20, 20);
  ctx.fillStyle = '#fff';
  ctx.fillText(`${p.materials}`, barX + barW + 185, barY + 15);
  
  // Mode indicator
  ctx.fillStyle = p.buildMode ? '#4ECDC4' : '#FFD700';
  ctx.font = 'bold 16px monospace';
  ctx.fillText(p.buildMode ? '🔨 BUILD MODE' : '🔫 COMBAT MODE', barX + barW + 20, barY + 55);
  
  // God mode indicator
  if (p.godMode) {
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('⚡ GOD MODE ⚡', barX + barW + 250, barY + 35);
  }
  
  // Top HUD
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, w, 50);
  
  // Players alive
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`👥 ${state.playersAlive} alive`, w / 2, 20);
  
  // Kills
  ctx.textAlign = 'left';
  ctx.fillText(`💀 ${p.kills} kills`, 15, 20);
  
  // Score
  ctx.fillText(`⭐ ${state.score}`, 15, 40);
  
  // Wave
  ctx.textAlign = 'right';
  ctx.fillText(`Wave: ${state.wave}`, w - 15, 20);
  
  // Storm timer
  ctx.fillStyle = '#c084fc';
  ctx.fillText(`Storm: ${Math.ceil(state.stormRadius)}m`, w - 15, 40);
  
  // Minimap
  drawMinimap(ctx, state, w - 120, 60, 100);
  
  // Controls hint
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('WASD:Move SPACE:Jump Q:Build 1-3:Weapons E:Block G:GodMode LMB:Shoot/Place RMB:Destroy', 10, h - 5);
}

function drawMinimap(ctx: CanvasRenderingContext2D, state: GameState, x: number, y: number, size: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, size, size);
  
  const scale = size / state.worldSize;
  const p = state.player;
  
  // Storm circle
  ctx.strokeStyle = 'rgba(128, 0, 255, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(
    x + state.stormCenter.x * scale,
    y + state.stormCenter.z * scale,
    state.stormRadius * scale,
    0, Math.PI * 2
  );
  ctx.stroke();
  
  // Enemies
  for (const e of state.enemies) {
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(x + e.pos.x * scale - 1, y + e.pos.z * scale - 1, 3, 3);
  }
  
  // Player
  ctx.fillStyle = '#2ecc71';
  ctx.fillRect(x + p.pos.x * scale - 2, y + p.pos.z * scale - 2, 5, 5);
  
  // Player direction
  ctx.strokeStyle = '#2ecc71';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + p.pos.x * scale, y + p.pos.z * scale);
  ctx.lineTo(
    x + (p.pos.x + Math.cos(p.yaw) * 5) * scale,
    y + (p.pos.z + Math.sin(p.yaw) * 5) * scale
  );
  ctx.stroke();
}

function shadeColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.floor(r * factor)}, ${Math.floor(g * factor)}, ${Math.floor(b * factor)})`;
}
