import { useRef, useEffect, useCallback, useState } from 'react';
import { createGameState, updateGame, playerShoot, playerDestroyBlock } from './game/engine';
import { renderGame } from './game/renderer';
import type { GameState, WeaponType } from './game/types';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const mouseButtonsRef = useRef<Set<number>>(new Set());
  const [isLocked, setIsLocked] = useState(false);
  const [showStart, setShowStart] = useState(true);
  const autoFireRef = useRef(false);
  const lastTimeRef = useRef(0);
  const animFrameRef = useRef(0);

  const initGame = useCallback(() => {
    stateRef.current = createGameState();
    setShowStart(false);
  }, []);

  const handlePointerLock = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.requestPointerLock();
  }, []);

  useEffect(() => {
    const handleLockChange = () => {
      setIsLocked(document.pointerLockElement === canvasRef.current);
    };
    document.addEventListener('pointerlockchange', handleLockChange);
    return () => document.removeEventListener('pointerlockchange', handleLockChange);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysRef.current.add(key);

      const state = stateRef.current;
      if (!state) return;

      if (key === 'q' || key === 'b') {
        state.player.buildMode = !state.player.buildMode;
      }
      if (key === '1') state.player.weapon = 'pistol' as WeaponType;
      if (key === '2') state.player.weapon = 'shotgun' as WeaponType;
      if (key === '3') state.player.weapon = 'rifle' as WeaponType;
      if (key === 'e') {
        state.player.selectedBlock = (state.player.selectedBlock % 10) + 1;
      }
      if (key === 'g') {
        state.player.godMode = !state.player.godMode;
        state.showMessage = state.player.godMode ? '⚡ GOD MODE ENABLED ⚡' : 'God Mode Disabled';
        state.messageTimer = 90;
      }
      if (key === 'r' && state.gameOver) {
        stateRef.current = createGameState();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isLocked) return;
      const state = stateRef.current;
      if (!state || state.gameOver) return;

      const sensitivity = 0.002;
      state.player.yaw += e.movementX * sensitivity;
      state.player.pitch -= e.movementY * sensitivity;
      state.player.pitch = Math.max(-1.2, Math.min(1.2, state.player.pitch));
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (!isLocked) {
        handlePointerLock();
        if (stateRef.current?.gameOver) {
          stateRef.current = createGameState();
        }
        return;
      }
      mouseButtonsRef.current.add(e.button);

      if (e.button === 0) {
        autoFireRef.current = true;
        playerShoot(stateRef.current!);
      }
      if (e.button === 2) {
        playerDestroyBlock(stateRef.current!);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      mouseButtonsRef.current.delete(e.button);
      if (e.button === 0) {
        autoFireRef.current = false;
      }
    };

    const handleContextMenu = (e: Event) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [isLocked, handlePointerLock]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gameLoop = (time: number) => {
      animFrameRef.current = requestAnimationFrame(gameLoop);

      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = time;

      // Resize canvas
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      const state = stateRef.current;
      if (!state) return;

      // Auto fire
      if (autoFireRef.current && !state.player.buildMode) {
        playerShoot(state);
      }

      updateGame(state, dt, keysRef.current);
      renderGame(ctx, state, w, h);
    };

    lastTimeRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-none"
        onClick={() => {
          if (showStart) {
            initGame();
            handlePointerLock();
          } else if (!isLocked) {
            handlePointerLock();
          }
        }}
      />

      {showStart && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-indigo-950 via-purple-950 to-black">
          <div className="text-center space-y-8 px-4">
            <div className="space-y-2">
              <h1 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 drop-shadow-lg tracking-tight">
                VOXELROYALE
              </h1>
              <p className="text-2xl text-purple-300 font-bold">
                ⛏️ Build. 🔫 Fight. 👑 Win.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto text-left">
              <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                <h3 className="text-yellow-400 font-bold mb-2">🎮 Movement</h3>
                <p className="text-gray-300 text-sm">WASD - Move</p>
                <p className="text-gray-300 text-sm">SPACE - Jump</p>
                <p className="text-gray-300 text-sm">Mouse - Look</p>
              </div>
              <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                <h3 className="text-red-400 font-bold mb-2">⚔️ Combat</h3>
                <p className="text-gray-300 text-sm">LMB - Shoot/Place</p>
                <p className="text-gray-300 text-sm">RMB - Destroy Block</p>
                <p className="text-gray-300 text-sm">1/2/3 - Weapons</p>
              </div>
              <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                <h3 className="text-cyan-400 font-bold mb-2">🔨 Building</h3>
                <p className="text-gray-300 text-sm">Q - Toggle Build</p>
                <p className="text-gray-300 text-sm">E - Cycle Blocks</p>
                <p className="text-gray-300 text-sm">LMB - Place Block</p>
              </div>
              <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                <h3 className="text-green-400 font-bold mb-2">🌀 Survival</h3>
                <p className="text-gray-300 text-sm">Storm shrinks!</p>
                <p className="text-gray-300 text-sm">Collect loot drops</p>
                <p className="text-gray-300 text-sm">G - God Mode</p>
              </div>
            </div>

            <button
              onClick={() => {
                initGame();
                handlePointerLock();
              }}
              className="px-12 py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white text-2xl font-black rounded-xl 
                         hover:from-orange-400 hover:to-red-500 transform hover:scale-105 transition-all duration-200
                         shadow-lg shadow-red-500/30 animate-pulse"
            >
              🎯 CLICK TO PLAY
            </button>

            <p className="text-gray-500 text-sm">
              Click to lock mouse • ESC to unlock
            </p>
          </div>
        </div>
      )}

      {!isLocked && !showStart && !stateRef.current?.gameOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-center space-y-4">
            <p className="text-white text-2xl font-bold">⏸ PAUSED</p>
            <p className="text-gray-300">Click to resume</p>
          </div>
        </div>
      )}
    </div>
  );
}
