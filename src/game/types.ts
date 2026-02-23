export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Player {
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  pitch: number;
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  onGround: boolean;
  materials: number;
  ammo: number;
  kills: number;
  weapon: WeaponType;
  lastShot: number;
  buildMode: boolean;
  selectedBlock: number;
  godMode: boolean;
}

export type WeaponType = 'pistol' | 'shotgun' | 'rifle';

export interface WeaponDef {
  name: string;
  damage: number;
  fireRate: number;
  spread: number;
  range: number;
  ammoPerShot: number;
  color: string;
  pellets: number;
}

export interface Enemy {
  id: number;
  pos: Vec3;
  vel: Vec3;
  health: number;
  maxHealth: number;
  yaw: number;
  speed: number;
  lastShot: number;
  state: 'wander' | 'chase' | 'attack' | 'build';
  targetPos: Vec3 | null;
  color: string;
  buildCooldown: number;
}

export interface Particle {
  pos: Vec3;
  vel: Vec3;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface DroppedItem {
  pos: Vec3;
  type: 'health' | 'shield' | 'ammo' | 'materials';
  amount: number;
  bobPhase: number;
}

export interface GameState {
  player: Player;
  enemies: Enemy[];
  particles: Particle[];
  items: DroppedItem[];
  world: Uint8Array;
  worldSize: number;
  worldHeight: number;
  stormRadius: number;
  stormCenter: Vec3;
  stormDamageTimer: number;
  gameTime: number;
  gameOver: boolean;
  gameWon: boolean;
  playersAlive: number;
  totalPlayers: number;
  score: number;
  wave: number;
  showMessage: string;
  messageTimer: number;
  screenShake: number;
}

export const WEAPONS: Record<WeaponType, WeaponDef> = {
  pistol: { name: 'Pistol', damage: 20, fireRate: 400, spread: 0.02, range: 80, ammoPerShot: 1, color: '#FFD700', pellets: 1 },
  shotgun: { name: 'Shotgun', damage: 12, fireRate: 900, spread: 0.1, range: 30, ammoPerShot: 2, color: '#FF6B35', pellets: 6 },
  rifle: { name: 'Assault Rifle', damage: 15, fireRate: 150, spread: 0.04, range: 100, ammoPerShot: 1, color: '#4ECDC4', pellets: 1 },
};

export const BLOCK_COLORS: Record<number, string> = {
  1: '#4a7c3f', // grass
  2: '#8B6914', // dirt
  3: '#888888', // stone
  4: '#6B4226', // wood
  5: '#3498db', // blue (player built)
  6: '#e74c3c', // red
  7: '#f39c12', // orange
  8: '#2ecc71', // green built
  9: '#1a1a2e', // dark
  10: '#ecf0f1', // white/snow
};
