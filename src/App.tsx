/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Eye, RefreshCw, Home, Swords, Gamepad2, Music, Zap, Flame, Shield, Sparkles } from 'lucide-react';
import ArcadeMode from './arcade/ArcadeMode';
import ArcadeRouteCard from './arcade/ArcadeRouteCard';
import { DEITIES } from './game/deities';
import type { DeityData, Pantheon } from './game/deities';
import { sounds } from './game/sound';
import { SIM_STEP_MS, checkAABB, spawnBloodBurst, renderParticles, updateParticles as updateParticlesList } from './game/core';
import type { Box, Difficulty, Particle } from './game/core';
import { drawDeityPortraitIcon, onPortraitLoad } from './game/portraits';
import { startGamepadBridge } from './game/gamepad';
import { ARENAS, drawArena } from './game/arenas';
import type { ArenaDef } from './game/arenas';
import { getSpriteSheetConfig, loadSpriteSheet } from './game/sprites';
import type { SpriteAnimationName, SpriteSheetConfig, SpriteSheetEntry } from './game/sprites';

/* ==========================================================================
   MYTHIC CLASH 2D - TORNEO DE DIOSES (EDICIÓN VISUAL PROFESIONAL)
   Motor de Lucha 2D en HTML5 Canvas con Sprites Procedurales de Alta Precisión,
   Retratos Mitológicos Ilustrados y Efectos Visuales de Impacto
   ========================================================================== */

export type GameState = 'MAIN_MENU' | 'DIFFICULTY_MENU' | 'CHAR_SELECT' | 'STAGE_SELECT' | 'FIGHT' | 'GAME_OVER' | 'ARCADE';
export type GameMode = 'PVP' | 'PVE' | 'ARCADE' | 'ARCADE_COOP';

// ==========================================================================
// COMPONENTE REACT: TARJETA DE VISTA PREVIA GRANDE DE PERSONAJE
// ==========================================================================
interface LargePreviewProps {
  deity: DeityData;
  playerTag: string;
  tagColor: string;
  isReady: boolean;
}

function DeityLargePreviewCard({ deity, playerTag, tagColor, isReady }: LargePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let animId: number;
    const startTime = performance.now();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const spriteConfig = getSpriteSheetConfig(deity);
    const sheet = loadSpriteSheet(spriteConfig.src);

    const renderPreview = (now: number) => {
      // Animación por tiempo real (igual a 60 Hz que a 144 Hz)
      const elapsed = Math.max(0, now - startTime);
      const t = elapsed * 0.0024;
      const tick = Math.floor(elapsed / SIM_STEP_MS);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2 + 10;
      const breath = Math.sin(t) * 4;

      // Aura pulsante de fondo
      const auraGrad = ctx.createRadialGradient(cx, cy - 60, 20, cx, cy - 60, 110);
      auraGrad.addColorStop(0, deity.auraColor);
      auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(cx, cy - 60, 110, 0, Math.PI * 2);
      ctx.fill();

      // Sombra en el suelo
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 95, 55, 15, 0, 0, Math.PI * 2);
      ctx.fill();

      // Con la hoja de sprites cargada se muestra la animación idle real, a la misma escala que en la arena
      if (sheet.status === 'ready') {
        const { frameWidth, frameHeight, scale, footOffset } = spriteConfig;
        const idle = spriteConfig.animations.idle;
        const frame = Math.floor(tick / idle.frameDuration) % idle.frames;
        const drawW = frameWidth * scale;
        const drawH = frameHeight * scale;
        ctx.imageSmoothingEnabled = !spriteConfig.pixelArt;
        ctx.drawImage(
          sheet.image,
          frame * frameWidth,
          idle.row * frameHeight,
          frameWidth,
          frameHeight,
          cx - drawW / 2,
          cy + 95 - drawH + footOffset * scale,
          drawW,
          drawH
        );
        animId = requestAnimationFrame(renderPreview);
        return;
      }

      // Capa / Ropajes dinámicos ondeando
      ctx.fillStyle = deity.secondaryColor;
      ctx.beginPath();
      const wave = Math.sin(t * 1.5) * 8;
      ctx.moveTo(cx - 20, cy - 40 + breath);
      ctx.lineTo(cx - 55 - wave, cy + 70);
      ctx.lineTo(cx + 10, cy + 75);
      ctx.lineTo(cx + 25, cy - 40 + breath);
      ctx.closePath();
      ctx.fill();

      // Piernas y grebas
      ctx.strokeStyle = deity.primaryColor;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 15, cy + 20);
      ctx.lineTo(cx - 20, cy + 90);
      ctx.moveTo(cx + 15, cy + 20);
      ctx.lineTo(cx + 20, cy + 90);
      ctx.stroke();

      // Torso / Armadura anatómica
      ctx.fillStyle = deity.primaryColor;
      ctx.beginPath();
      ctx.roundRect(cx - 28, cy - 60 + breath, 56, 75, 10);
      ctx.fill();
      ctx.strokeStyle = deity.accentColor;
      ctx.lineWidth = 3;
      ctx.stroke();

      // Cinturón sagrado
      ctx.fillStyle = deity.secondaryColor;
      ctx.fillRect(cx - 28, cy + 2 + breath, 56, 12);

      // Cuello y Cabeza
      ctx.fillStyle = '#fed7aa';
      ctx.beginPath();
      ctx.arc(cx, cy - 82 + breath, 22, 0, Math.PI * 2);
      ctx.fill();

      // Casco / Corona / Cabello según deidad
      ctx.fillStyle = deity.secondaryColor;
      ctx.beginPath();
      ctx.arc(cx, cy - 88 + breath, 23, Math.PI, Math.PI * 2);
      ctx.lineTo(cx + 20, cy - 82 + breath);
      ctx.lineTo(cx - 20, cy - 82 + breath);
      ctx.fill();

      // Elementos únicos (Zeus rayo / Ra disco solar)
      if (deity.id === 'zeus') {
        // Corona de laurel dorada
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy - 90 + breath, 26, -Math.PI * 0.8, -Math.PI * 0.2);
        ctx.stroke();

        // Ojos de electricidad
        ctx.fillStyle = '#38bdf8';
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 10;
        ctx.fillRect(cx + 5, cy - 86 + breath, 6, 4);
        ctx.shadowBlur = 0;

        // Rayo celestial sostenido en mano
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx + 38, cy - 130 + breath);
        ctx.lineTo(cx + 46, cy - 80 + breath);
        ctx.lineTo(cx + 32, cy - 30 + breath);
        ctx.stroke();
      } else if (deity.id === 'ra') {
        // Disco solar encima de la cabeza
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(cx, cy - 120 + breath, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Ojo de Halcón
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(cx + 6, cy - 85 + breath, 6, 4);

        // Báculo solar Was en mano
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(cx + 42, cy - 135 + breath);
        ctx.lineTo(cx + 42, cy + 90);
        ctx.stroke();
      } else {
        ctx.fillStyle = deity.accentColor;
        ctx.fillRect(cx + 5, cy - 85 + breath, 5, 4);
      }

      // Brazos y muñequeras
      ctx.strokeStyle = deity.accentColor;
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 26, cy - 45 + breath);
      ctx.lineTo(cx - 38, cy - 10 + breath);
      ctx.moveTo(cx + 26, cy - 45 + breath);
      ctx.lineTo(cx + 42, cy - 25 + breath);
      ctx.stroke();

      animId = requestAnimationFrame(renderPreview);
    };

    animId = requestAnimationFrame(renderPreview);
    return () => cancelAnimationFrame(animId);
  }, [deity]);

  return (
    <div className="bg-slate-900/90 border border-slate-700 rounded-2xl p-4 flex flex-col items-center text-center shadow-2xl relative overflow-hidden backdrop-blur-md">
      {/* Etiqueta del Jugador */}
      <div className={`absolute top-3 left-3 text-[11px] font-bold px-2.5 py-1 rounded border ${tagColor}`}>
        {playerTag}
      </div>
      {isReady && (
        <div className="absolute top-3 right-3 text-[11px] font-bold text-emerald-300 bg-emerald-500/20 px-2.5 py-1 rounded border border-emerald-400/40 animate-pulse">
          ¡LISTO!
        </div>
      )}

      {/* Canvas del Personaje Animado */}
      <div className="w-full flex justify-center my-2">
        <canvas ref={canvasRef} width={260} height={250} className="w-[220px] h-[210px] object-contain drop-shadow-xl" />
      </div>

      <div className="w-full border-t border-white/10 pt-3">
        <h3 className="font-cinzel text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500">
          {deity.name}
        </h3>
        <span className="text-xs font-semibold uppercase tracking-wider text-amber-300 block mb-1">
          {deity.pantheon} · {deity.title}
        </span>
        <p className="text-[12px] text-slate-300 line-clamp-2 leading-relaxed mb-3">
          {deity.lore}
        </p>

        {/* Barras de Atributos */}
        <div className="w-full bg-black/40 rounded-lg p-2.5 border border-white/5 space-y-1.5 text-xs text-left">
          <div className="flex justify-between items-center">
            <span className="text-slate-400 font-medium">Fuerza / Ataque:</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(v => (
                <div key={v} className={`w-3.5 h-2 rounded-sm ${v <= deity.stats.attack ? 'bg-amber-400' : 'bg-slate-800'}`} />
              ))}
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400 font-medium">Agilidad / Velocidad:</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(v => (
                <div key={v} className={`w-3.5 h-2 rounded-sm ${v <= deity.stats.speed ? 'bg-cyan-400' : 'bg-slate-800'}`} />
              ))}
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400 font-medium">Resistencia / Blindaje:</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(v => (
                <div key={v} className={`w-3.5 h-2 rounded-sm ${v <= deity.stats.defense ? 'bg-emerald-400' : 'bg-slate-800'}`} />
              ))}
            </div>
          </div>
        </div>

        {/* Ataque Especial */}
        <div className="mt-2.5 p-2 bg-amber-500/10 rounded-lg border border-amber-500/25 text-left">
          <div className="flex items-center gap-1.5 text-amber-300 font-bold text-xs">
            <Zap className="w-3.5 h-3.5" />
            <span>Poder Especial: {deity.specialName}</span>
          </div>
          <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
            {deity.specialDesc}
          </p>
        </div>
      </div>
    </div>
  );
}

// ==========================================================================
// COMPONENTE REACT: BOTÓN DE CASILLA DE SELECCIÓN CON RETRATO CANVAS
// ==========================================================================
interface GridSlotProps {
  deity: DeityData;
  isP1: boolean;
  isP2: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}

function DeityGridSlot({ deity, isP1, isP2, onClick, onMouseEnter }: GridSlotProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawDeityPortraitIcon(ctx, deity.id, canvas.width / 2, canvas.height / 2, 68);
    };
    draw();
    return onPortraitLoad(deity.id, draw);
  }, [deity]);

  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`p-2 rounded-xl border flex flex-col items-center justify-center transition-all relative ${
        isP1 && isP2
          ? 'ring-4 ring-purple-500 border-purple-400 bg-purple-950/70 scale-105 z-10 shadow-lg shadow-purple-900/50'
          : isP1
          ? 'ring-4 ring-blue-500 border-blue-400 bg-blue-950/70 scale-105 z-10 shadow-lg shadow-blue-900/50'
          : isP2
          ? 'ring-4 ring-red-500 border-red-400 bg-red-950/70 scale-105 z-10 shadow-lg shadow-red-900/50'
          : 'border-slate-800 bg-slate-900/70 hover:border-slate-600 hover:bg-slate-800 hover:scale-102'
      }`}
    >
      {/* Indicadores flotantes de P1 / P2 */}
      <div className="absolute top-1.5 left-1.5 flex gap-1 z-10">
        {isP1 && <span className="text-[10px] bg-blue-500 text-white font-black px-1.5 py-0.5 rounded shadow">P1</span>}
        {isP2 && <span className="text-[10px] bg-red-500 text-white font-black px-1.5 py-0.5 rounded shadow">P2</span>}
      </div>

      {deity.isUnique && (
        <span className="absolute top-1.5 right-1.5 text-[9px] bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.5 rounded border border-amber-400/40">
          ÚNICO
        </span>
      )}

      {/* Retrato Canvas Ilustrado */}
      <canvas ref={canvasRef} width={80} height={80} className="w-[68px] h-[68px] my-1" />

      <span className="font-cinzel text-xs font-bold text-slate-100">{deity.name}</span>
      <span className="text-[10px] text-amber-400/80 truncate max-w-[85px]">{deity.specialName}</span>
    </button>
  );
}

// ==========================================================================
// CLASE LUCHADOR CON SPRITES PROCEDURALES Y FÍSICAS DE ALTA PRECISIÓN (OOP)
// ==========================================================================
export class Fighter {
  public playerNumber: 1 | 2;
  public deity: DeityData;
  public isAI: boolean;

  public x: number;
  public y: number;
  public width: number = 85;
  public height: number = 155;
  public facing: 1 | -1;

  public vx: number = 0;
  public vy: number = 0;
  public isGrounded: boolean = true;
  public readonly gravity: number = 0.88;
  public readonly groundY: number = 540;

  public hp: number = 100;
  public maxHp: number = 100;
  public displayHp: number = 100;

  public superMeter: number = 0;
  public wasSuperFull: boolean = false;

  public state: 'IDLE' | 'WALK' | 'JUMP' | 'CROUCH' | 'ATTACK_LIGHT' | 'ATTACK_HEAVY' | 'SPECIAL' | 'BLOCK' | 'HITSTUN' | 'KNOCKDOWN' | 'VICTORY' | 'DEFEAT' = 'IDLE';

  public animTimer: number = 0;
  public attackCooldown: number = 0;
  public hitRegistered: boolean = false;
  public isBlocking: boolean = false;
  public hitstunTimer: number = 0;
  public hitFlashTimer: number = 0; // Efecto de flash blanco al recibir golpe
  public pendingScreenShake: number = 0; // Intensidad de sacudida pedida al bucle cuando un especial conecta desde update()

  public stepTimer: number = 0;
  public comboCount: number = 0;
  public comboTimer: number = 0;

  public aiState: 'APPROACH' | 'RETREAT' | 'ATTACK' | 'DEFEND' | 'ZONING' | 'WAIT' = 'WAIT';
  public aiActionTimer: number = 0;

  constructor(playerNumber: 1 | 2, deity: DeityData, isAI: boolean, startX: number, facing: 1 | -1) {
    this.playerNumber = playerNumber;
    this.deity = deity;
    this.isAI = isAI;
    this.x = startX;
    this.y = this.groundY;
    this.facing = facing;
  }

  public getHurtboxes(): { head: Box; torso: Box; legs: Box } {
    const isCrouching = this.state === 'CROUCH' || (this.state === 'BLOCK' && this.isGrounded);
    const scaleY = isCrouching ? 0.65 : 1.0;
    const curHeight = this.height * scaleY;
    const curY = this.y - curHeight;
    const curW = this.width;
    const curX = this.x - curW / 2;

    return {
      head: {
        x: curX + (this.facing === 1 ? curW * 0.2 : curW * 0.1),
        y: curY,
        w: curW * 0.7,
        h: curHeight * 0.28
      },
      torso: {
        x: curX + curW * 0.15,
        y: curY + curHeight * 0.28,
        w: curW * 0.75,
        h: curHeight * 0.42
      },
      legs: {
        x: curX + curW * 0.1,
        y: curY + curHeight * 0.7,
        w: curW * 0.8,
        h: curHeight * 0.3
      }
    };
  }

  public getHitbox(): Box | null {
    if (this.hitRegistered) return null;

    if (this.state === 'ATTACK_LIGHT') {
      if (this.animTimer >= 4 && this.animTimer <= 12) {
        const boxW = 80;
        const boxH = 50;
        const boxX = this.facing === 1 ? this.x + 10 : this.x - 10 - boxW;
        const boxY = this.y - this.height * 0.72;
        return { x: boxX, y: boxY, w: boxW, h: boxH };
      }
    } else if (this.state === 'ATTACK_HEAVY') {
      if (this.animTimer >= 8 && this.animTimer <= 20) {
        const boxW = 110;
        const boxH = 80;
        const boxX = this.facing === 1 ? this.x + 15 : this.x - 15 - boxW;
        const boxY = this.y - this.height * 0.82;
        return { x: boxX, y: boxY, w: boxW, h: boxH };
      }
    } else if (this.state === 'SPECIAL') {
      // Zeus y Ra aplican el daño de su especial desde update(); una hitbox aquí los haría golpear dos veces
      if (this.deity.id === 'zeus' || this.deity.id === 'ra') return null;
      if (this.animTimer >= 12 && this.animTimer <= 46) {
        const boxW = 200;
        const boxH = 150;
        const boxX = this.facing === 1 ? this.x : this.x - boxW;
        const boxY = this.y - this.height;
        return { x: boxX, y: boxY, w: boxW, h: boxH };
      }
    }

    return null;
  }

  public update(arenaWidth: number, opponent: Fighter, difficulty: Difficulty, particles: Particle[]) {
    this.animTimer++;
    if (this.attackCooldown > 0) this.attackCooldown--;
    if (this.hitFlashTimer > 0) this.hitFlashTimer--;

    // Carga progresiva pasiva del Super Meter
    if (this.hp > 0 && opponent.hp > 0) {
      this.superMeter = Math.min(100, this.superMeter + 0.07);
    }

    if (this.superMeter >= 100 && !this.wasSuperFull) {
      this.wasSuperFull = true;
      sounds.playSuperReady();

      for (let i = 0; i < 18; i++) {
        particles.push({
          x: this.x + (Math.random() - 0.5) * 60,
          y: this.y - Math.random() * 130,
          vx: (Math.random() - 0.5) * 3,
          vy: -Math.random() * 4 - 2,
          radius: 3 + Math.random() * 3,
          color: '#fbbf24',
          alpha: 1,
          decay: 0.03,
          type: 'spark'
        });
      }
    } else if (this.superMeter < 100) {
      this.wasSuperFull = false;
    }

    // Partículas de aura constante en Super lleno
    if (this.superMeter >= 100 && Math.random() < 0.35) {
      particles.push({
        x: this.x + (Math.random() - 0.5) * 55,
        y: this.y - 10 - Math.random() * 140,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -Math.random() * 2.5 - 1.5,
        radius: 2.5 + Math.random() * 2.5,
        color: this.deity.id === 'zeus' ? '#38bdf8' : '#fbbf24',
        alpha: 0.9,
        decay: 0.03,
        type: 'spark'
      });
    }

    if (this.comboTimer > 0) {
      this.comboTimer--;
      if (this.comboTimer === 0) this.comboCount = 0;
    }

    if (this.displayHp > this.hp) {
      this.displayHp = Math.max(this.hp, this.displayHp - 0.45);
    }

    if (this.state === 'HITSTUN') {
      this.hitstunTimer--;
      if (this.hitstunTimer <= 0) {
        this.state = 'IDLE';
      }
    }

    // Físicas de gravedad y aceleración
    this.vy += this.gravity;
    this.x += this.vx;
    this.y += this.vy;

    if (this.isGrounded) {
      this.vx *= 0.84;
    } else {
      this.vx *= 0.95;
    }

    // Suelo y ráfagas de aire al aterrizar
    if (this.y >= this.groundY) {
      if (!this.isGrounded) {
        sounds.playStep();
        // Anillos de impacto de aire en el suelo
        particles.push({
          x: this.x,
          y: this.groundY,
          vx: 0,
          vy: 0,
          radius: 12,
          color: 'rgba(255, 255, 255, 0.6)',
          alpha: 0.8,
          decay: 0.04,
          type: 'ring'
        });

        // Polvo y ráfagas
        for (let i = 0; i < 6; i++) {
          particles.push({
            x: this.x + (Math.random() - 0.5) * 45,
            y: this.groundY,
            vx: (Math.random() - 0.5) * 6,
            vy: -Math.random() * 2.5,
            radius: 3 + Math.random() * 3,
            color: 'rgba(212, 212, 216, 0.5)',
            alpha: 0.7,
            decay: 0.035,
            type: 'dust'
          });
        }
      }
      this.y = this.groundY;
      this.vy = 0;
      this.isGrounded = true;

      if (this.state === 'JUMP') {
        this.state = 'IDLE';
      }
    } else {
      this.isGrounded = false;
    }

    // Efecto de ráfagas de viento y pasos al correr
    if (this.state === 'WALK' && this.isGrounded) {
      this.stepTimer++;
      if (this.stepTimer % 18 === 0) {
        sounds.playStep();
      }

      // Ráfagas de viento semi-transparentes detrás del personaje
      if (Math.random() < 0.45) {
        particles.push({
          x: this.x - this.facing * 35,
          y: this.y - 15 - Math.random() * 60,
          vx: -this.facing * (2 + Math.random() * 3),
          vy: (Math.random() - 0.5) * 1.5,
          radius: 8 + Math.random() * 10,
          color: 'rgba(255, 255, 255, 0.25)',
          alpha: 0.5,
          decay: 0.045,
          type: 'wind'
        });
      }
    } else {
      this.stepTimer = 0;
    }

    // Límites de la arena
    const minX = 75;
    const maxX = arenaWidth - 75;
    if (this.x < minX) {
      this.x = minX;
      this.vx = 0;
    } else if (this.x > maxX) {
      this.x = maxX;
      this.vx = 0;
    }

    // Orientación
    if (this.state !== 'ATTACK_LIGHT' && this.state !== 'ATTACK_HEAVY' && this.state !== 'SPECIAL' && this.state !== 'HITSTUN') {
      this.facing = this.x < opponent.x ? 1 : -1;
    }

    // Conclusión de animaciones
    if (this.state === 'ATTACK_LIGHT' && this.animTimer > 18) {
      this.state = 'IDLE';
      this.hitRegistered = false;
    } else if (this.state === 'ATTACK_HEAVY' && this.animTimer > 28) {
      this.state = 'IDLE';
      this.hitRegistered = false;
    } else if (this.state === 'SPECIAL') {
      // Especial de Zeus
      if (this.deity.id === 'zeus') {
        if (this.animTimer === 14 || this.animTimer === 26 || this.animTimer === 38) {
          sounds.playThunder();
          const targetOffset = this.animTimer === 14 ? -70 : this.animTimer === 26 ? 70 : 0;
          const strikeX = opponent.x + targetOffset;

          if (Math.abs(opponent.x - strikeX) < 90 && opponent.hp > 0) {
            opponent.hp = Math.max(0, opponent.hp - 12);
            opponent.vx = this.facing * 8;
            opponent.vy = -10;
            opponent.state = 'HITSTUN';
            opponent.hitstunTimer = 25;
            opponent.hitFlashTimer = 4;
            sounds.playHitHeavy();
            spawnBloodBurst(particles, opponent.x, opponent.y - opponent.height * 0.6, this.facing, opponent.groundY);
            this.pendingScreenShake = 22;
          }

          // Rayo colosal con ondas expansivas en suelo
          particles.push({
            x: strikeX,
            y: this.groundY,
            vx: 0,
            vy: 0,
            radius: 30,
            color: 'rgba(56, 189, 248, 0.8)',
            alpha: 1,
            decay: 0.04,
            type: 'ring'
          });

          for (let k = 0; k < 35; k++) {
            particles.push({
              x: strikeX + (Math.random() - 0.5) * 45,
              y: Math.random() * 540,
              vx: (Math.random() - 0.5) * 8,
              vy: Math.random() * 14 + 6,
              radius: 3 + Math.random() * 4,
              color: Math.random() < 0.6 ? '#38bdf8' : '#ffffff',
              alpha: 1,
              decay: 0.03,
              type: 'lightning'
            });
          }
        }
      }
      // Especial de Ra
      else if (this.deity.id === 'ra') {
        if (this.animTimer % 7 === 0 && this.animTimer >= 14 && this.animTimer <= 46) {
          sounds.playSolarBeam();
          const inBeamRange = this.facing === 1 ? opponent.x > this.x : opponent.x < this.x;
          if (inBeamRange && opponent.hp > 0) {
            opponent.hp = Math.max(0, opponent.hp - 7);
            opponent.vx = this.facing * 10;
            opponent.state = 'HITSTUN';
            opponent.hitstunTimer = 18;
            opponent.hitFlashTimer = 3;
            sounds.playHitLight();
            // El rayo solar impacta a la altura del haz (y - 120, alto 75), en el costado que mira a Ra
            spawnBloodBurst(particles, opponent.x - this.facing * opponent.width * 0.3, this.y - 82, this.facing, opponent.groundY);
            this.pendingScreenShake = 16;
          }

          for (let k = 0; k < 20; k++) {
            particles.push({
              x: this.x + this.facing * (Math.random() * 650),
              y: this.y - 120 + (Math.random() - 0.5) * 55,
              vx: this.facing * (16 + Math.random() * 12),
              vy: (Math.random() - 0.5) * 4,
              radius: 4 + Math.random() * 5,
              color: Math.random() < 0.5 ? '#f97316' : '#fde047',
              alpha: 0.9,
              decay: 0.04,
              type: 'solar'
            });
          }
        }
      }

      if (this.animTimer > 54) {
        this.state = 'IDLE';
        this.hitRegistered = false;
      }
    }

    if (this.isAI && this.hp > 0 && opponent.hp > 0) {
      this.updateAI(opponent, difficulty);
    }
  }

  private updateAI(opponent: Fighter, difficulty: Difficulty) {
    this.aiActionTimer++;

    let reactionInterval = 20;
    let blockProbability = 0.4;
    let aggression = 0.55;

    if (difficulty === 'FACIL') {
      reactionInterval = 36;
      blockProbability = 0.15;
      aggression = 0.35;
    } else if (difficulty === 'DIFICIL') {
      reactionInterval = 7;
      blockProbability = 0.85;
      aggression = 0.85;
    }

    const dist = Math.abs(this.x - opponent.x);
    const opponentAttacking = opponent.state === 'ATTACK_LIGHT' || opponent.state === 'ATTACK_HEAVY' || opponent.state === 'SPECIAL';

    if (opponentAttacking && dist < 170 && Math.random() < blockProbability) {
      this.isBlocking = true;
      this.state = 'BLOCK';
      this.vx = -this.facing * 1.8;
      return;
    } else {
      this.isBlocking = false;
      if (this.state === 'BLOCK') this.state = 'IDLE';
    }

    if (this.aiActionTimer % reactionInterval === 0 && this.state !== 'HITSTUN' && this.state !== 'ATTACK_LIGHT' && this.state !== 'ATTACK_HEAVY' && this.state !== 'SPECIAL') {
      if (this.superMeter >= 100 && (dist < 380 || this.deity.id === 'ra')) {
        this.executeSpecial(opponent);
        return;
      }

      if (dist > 300) {
        if (Math.random() < 0.7) {
          this.vx = this.facing * (this.deity.stats.speed * 1.2 + 2.5);
          this.state = 'WALK';
        } else if (this.isGrounded && Math.random() < 0.6) {
          this.jump();
          this.vx = this.facing * 4.5;
        }
      } else if (dist >= 120 && dist <= 300) {
        if (Math.random() < aggression) {
          this.vx = this.facing * 3.8;
          this.state = 'WALK';
        } else if (this.isGrounded && Math.random() < 0.4) {
          this.jump();
          this.vx = this.facing * 3.5;
        } else {
          this.vx = -this.facing * 2;
        }
      } else {
        const roll = Math.random();
        if (roll < 0.45) {
          this.executeLightAttack();
        } else if (roll < 0.85) {
          this.executeHeavyAttack();
        } else if (this.isGrounded) {
          this.jump();
          this.vx = -this.facing * 4;
        }
      }
    }
  }

  public executeLightAttack() {
    if (this.state === 'HITSTUN' || this.state === 'SPECIAL' || this.attackCooldown > 0) return;
    this.state = 'ATTACK_LIGHT';
    this.animTimer = 0;
    this.hitRegistered = false;
    this.attackCooldown = 14;
    sounds.playSwing();
  }

  public executeHeavyAttack() {
    if (this.state === 'HITSTUN' || this.state === 'SPECIAL' || this.attackCooldown > 0) return;
    this.state = 'ATTACK_HEAVY';
    this.animTimer = 0;
    this.hitRegistered = false;
    this.attackCooldown = 26;
    sounds.playHeavySwing();
  }

  public executeSpecial(opponent: Fighter) {
    if (this.superMeter < 100 || this.state === 'HITSTUN') return;
    this.superMeter = 0;
    this.state = 'SPECIAL';
    this.animTimer = 0;
    this.hitRegistered = false;
    this.attackCooldown = 50;

    sounds.playSuperActivation();
    if (this.deity.id === 'zeus') {
      sounds.playThunder();
    } else if (this.deity.id === 'ra') {
      sounds.playSolarBeam();
    } else {
      sounds.playHitHeavy();
    }
  }

  public moveLeft() {
    if (this.state === 'HITSTUN' || this.state === 'ATTACK_LIGHT' || this.state === 'ATTACK_HEAVY' || this.state === 'SPECIAL') return;
    const speed = this.deity.stats.speed * 1.1 + 3.2;
    this.vx = -speed;
    if (this.isGrounded) this.state = 'WALK';
  }

  public moveRight() {
    if (this.state === 'HITSTUN' || this.state === 'ATTACK_LIGHT' || this.state === 'ATTACK_HEAVY' || this.state === 'SPECIAL') return;
    const speed = this.deity.stats.speed * 1.1 + 3.2;
    this.vx = speed;
    if (this.isGrounded) this.state = 'WALK';
  }

  public jump() {
    if (this.isGrounded && this.state !== 'HITSTUN' && this.state !== 'SPECIAL') {
      this.vy = -16.5;
      this.isGrounded = false;
      this.state = 'JUMP';
      sounds.playJump();
    }
  }

  public crouchOrBlock(isHolding: boolean) {
    if (this.state === 'HITSTUN' || this.state === 'SPECIAL') return;
    if (isHolding && this.isGrounded) {
      this.isBlocking = true;
      this.state = 'BLOCK';
      this.vx *= 0.5;
    } else if (this.state === 'BLOCK' || this.state === 'CROUCH') {
      this.isBlocking = false;
      this.state = 'IDLE';
    }
  }

  // ========================================================================
  // RENDERIZADO PROCEDURAL DETALLADO DEL LUCHADOR (SPRITES COMPLEJOS)
  // ========================================================================
  public render(ctx: CanvasRenderingContext2D, showDebug: boolean) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.facing, 1);

    const isCrouch = this.state === 'CROUCH' || (this.state === 'BLOCK' && this.isGrounded);
    const scaleFactor = isCrouch ? 0.72 : 1.0;
    const breath = Math.sin(this.animTimer * 0.1) * 3.5;
    const isFlashing = this.hitFlashTimer > 0;

    // Sombra suave en suelo
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 46, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    // Aura Divina (más intensa en Super 100%)
    const auraRadius = this.superMeter >= 100 ? 88 : 72;
    const auraGrad = ctx.createRadialGradient(0, -75 * scaleFactor, 12, 0, -75 * scaleFactor, auraRadius);
    auraGrad.addColorStop(0, this.deity.auraColor);
    auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(0, -75 * scaleFactor, auraRadius, 0, Math.PI * 2);
    ctx.fill();

    // --- CAPA / ROPAJES ONDEANDO (CURVAS BEZIER Y FÍSICAS DE VIENTO) ---
    const windOffset = -this.vx * 3;
    const capeSwing = Math.sin(this.animTimer * 0.18) * 8 + windOffset;
    ctx.fillStyle = isFlashing ? '#ffffff' : this.deity.secondaryColor;
    ctx.beginPath();
    ctx.moveTo(-16, -112 * scaleFactor + breath);
    ctx.quadraticCurveTo(-45 + capeSwing, -60, -38 + capeSwing * 1.4, -10);
    ctx.lineTo(-10 + capeSwing * 0.8, -10);
    ctx.quadraticCurveTo(-15, -60, 6, -105 * scaleFactor + breath);
    ctx.closePath();
    ctx.fill();

    // Borde bordado dorado de la capa
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // --- PIERNAS Y GREBAS ARTICULADAS ---
    const walkSwing = this.state === 'WALK' ? Math.sin(this.animTimer * 0.25) * 22 : 0;

    // Pierna trasera
    ctx.strokeStyle = isFlashing ? '#ffffff' : this.deity.primaryColor;
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-12, -50 * scaleFactor);
    ctx.lineTo(-18 - walkSwing, -22);
    ctx.lineTo(-20 - walkSwing * 1.2, -4);
    ctx.stroke();

    // Grebas / Botas traseras doradas
    ctx.strokeStyle = isFlashing ? '#ffffff' : this.deity.accentColor;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-18 - walkSwing, -20);
    ctx.lineTo(-20 - walkSwing * 1.2, -4);
    ctx.stroke();

    // Pierna delantera
    ctx.strokeStyle = isFlashing ? '#ffffff' : this.deity.primaryColor;
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(10, -50 * scaleFactor);
    ctx.lineTo(16 + walkSwing, -22);
    ctx.lineTo(18 + walkSwing * 1.2, -4);
    ctx.stroke();

    // Grebas delanteras
    ctx.strokeStyle = isFlashing ? '#ffffff' : this.deity.accentColor;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(16 + walkSwing, -20);
    ctx.lineTo(18 + walkSwing * 1.2, -4);
    ctx.stroke();

    // --- FALDELLÍN / QUILTE / TOGA INFERIOR ---
    ctx.fillStyle = isFlashing ? '#ffffff' : this.deity.secondaryColor;
    ctx.beginPath();
    ctx.moveTo(-24, -65 * scaleFactor + breath);
    ctx.lineTo(24, -65 * scaleFactor + breath);
    ctx.lineTo(20, -32 * scaleFactor);
    ctx.lineTo(-20, -32 * scaleFactor);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.stroke();

    // --- TORSO / CORAZA DIVINA CON MÚSCULOS Y RELIEVES ---
    ctx.fillStyle = isFlashing ? '#ffffff' : this.deity.primaryColor;
    ctx.beginPath();
    ctx.roundRect(-24, -120 * scaleFactor + breath, 48, 62 * scaleFactor, 8);
    ctx.fill();
    ctx.strokeStyle = isFlashing ? '#ffffff' : this.deity.accentColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Relieves pectorales grabados en la armadura
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-10, -100 * scaleFactor + breath, 8, 0, Math.PI * 0.8);
    ctx.arc(10, -100 * scaleFactor + breath, 8, Math.PI * 0.2, Math.PI);
    ctx.stroke();

    // Hombreras doradas (Pauldrons)
    ctx.fillStyle = isFlashing ? '#ffffff' : '#facc15';
    ctx.beginPath();
    ctx.arc(-24, -114 * scaleFactor + breath, 9, 0, Math.PI * 2);
    ctx.arc(20, -114 * scaleFactor + breath, 9, 0, Math.PI * 2);
    ctx.fill();

    // Cinturón sagrado
    ctx.fillStyle = this.deity.secondaryColor;
    ctx.fillRect(-24, -65 * scaleFactor + breath, 48, 10);

    // --- CUELLO Y CABEZA ESCULPIDA ---
    const headY = -140 * scaleFactor + breath;
    ctx.fillStyle = isFlashing ? '#ffffff' : '#fed7aa';
    ctx.beginPath();
    ctx.arc(0, headY, 19, 0, Math.PI * 2);
    ctx.fill();

    // Cabellera y casco estilizado
    ctx.fillStyle = isFlashing ? '#ffffff' : this.deity.secondaryColor;
    ctx.beginPath();
    ctx.arc(0, headY - 4, 20, Math.PI, Math.PI * 2);
    ctx.lineTo(17, headY);
    ctx.lineTo(-17, headY);
    ctx.fill();

    // --- ATUENDO Y ARMAS ESPECÍFICAS DE CADA DIOS ---

    // ZEUS: Barba blanca, corona de laurel, ojos eléctricos y Rayo de plasma en mano
    if (this.deity.id === 'zeus') {
      // Barba griega esculpida
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.moveTo(-14, headY + 4);
      ctx.quadraticCurveTo(0, headY + 24, 14, headY + 4);
      ctx.lineTo(8, headY);
      ctx.lineTo(-8, headY);
      ctx.closePath();
      ctx.fill();

      // Corona de laurel
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, headY - 6, 23, -Math.PI * 0.8, -Math.PI * 0.2);
      ctx.stroke();

      // Ojos de electricidad pura
      ctx.fillStyle = '#38bdf8';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 10;
      ctx.fillRect(4, headY - 3, 5, 4);
      ctx.shadowBlur = 0;
    }

    // RA: Halcón dorado, disco solar ardiente con Uraeus y Báculo Was
    else if (this.deity.id === 'ra') {
      // Disco solar ardiente con llamaradas
      const discPulse = 16 + Math.sin(this.animTimer * 0.3) * 3;
      ctx.fillStyle = '#ef4444';
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(0, headY - 26, discPulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Pico curvado de halcón
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(12, headY - 4);
      ctx.lineTo(24, headY);
      ctx.lineTo(14, headY + 6);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ef4444';
      ctx.fillRect(4, headY - 3, 5, 3);
    } else {
      ctx.fillStyle = this.deity.accentColor;
      ctx.fillRect(4, headY - 3, 4, 3);
    }

    // --- BRAZOS Y ACCIONES (GOLPE, CORTE, BLOQUEO, ESPECIAL) ---
    ctx.strokeStyle = isFlashing ? '#ffffff' : this.deity.accentColor;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';

    if (this.state === 'ATTACK_LIGHT') {
      // Puñetazo / Estocada frontal con ráfagas
      const punchExt = Math.sin((this.animTimer / 18) * Math.PI) * 60;
      ctx.beginPath();
      ctx.moveTo(8, -100 * scaleFactor + breath);
      ctx.lineTo(38 + punchExt, -95 * scaleFactor);
      ctx.stroke();

      // Esfera de impacto
      ctx.fillStyle = this.deity.accentColor;
      ctx.beginPath();
      ctx.arc(42 + punchExt, -95 * scaleFactor, 14, 0, Math.PI * 2);
      ctx.fill();

      // Estela de aire / velocidad
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(10, -95 * scaleFactor);
      ctx.lineTo(38 + punchExt, -95 * scaleFactor);
      ctx.stroke();
    } else if (this.state === 'ATTACK_HEAVY') {
      // Golpe pesado con arco y arma
      const swingExt = Math.sin((this.animTimer / 28) * Math.PI) * 75;
      ctx.beginPath();
      ctx.moveTo(0, -100 * scaleFactor + breath);
      ctx.lineTo(28 + swingExt, -115 * scaleFactor + swingExt * 0.65);
      ctx.stroke();

      if (this.deity.id === 'zeus') {
        // Relámpago zigzagueante
        ctx.strokeStyle = '#ffffff';
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 12;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(28 + swingExt - 20, -135);
        ctx.lineTo(28 + swingExt + 10, -90);
        ctx.lineTo(28 + swingExt + 35, -65);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (this.deity.id === 'ra') {
        // Báculo solar con estela de fuego
        ctx.strokeStyle = '#facc15';
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 14;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(28 + swingExt, -145);
        ctx.lineTo(28 + swingExt, -25);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    } else if (this.state === 'BLOCK') {
      // Bloqueo con escudo frontal
      ctx.beginPath();
      ctx.moveTo(10, -100 * scaleFactor);
      ctx.lineTo(26, -92 * scaleFactor);
      ctx.lineTo(16, -75 * scaleFactor);
      ctx.stroke();

      // Escudo místico de luz
      ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(32, -82 * scaleFactor, 46, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (this.state === 'SPECIAL') {
      // Especial: pose monumental
      ctx.beginPath();
      ctx.moveTo(0, -100 * scaleFactor);
      ctx.lineTo(38, -145);
      ctx.stroke();

      const pulse = 24 + Math.sin(this.animTimer * 0.4) * 8;
      ctx.fillStyle = this.deity.accentColor;
      ctx.shadowColor = this.deity.accentColor;
      ctx.shadowBlur = 28;
      ctx.beginPath();
      ctx.arc(42, -145, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (this.deity.id === 'ra') {
        this.renderSolarBeam(ctx, -160);
      }
    } else {
      // Reposo: sosteniendo el arma divina
      ctx.beginPath();
      ctx.moveTo(6, -100 * scaleFactor + breath);
      ctx.lineTo(24, -82 * scaleFactor + breath);
      ctx.lineTo(16, -60 * scaleFactor + breath);
      ctx.stroke();

      if (this.deity.id === 'zeus') {
        // Relámpago en mano constante
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(24, -98 * scaleFactor + breath);
        ctx.lineTo(28, -80 * scaleFactor + breath);
        ctx.lineTo(20, -62 * scaleFactor + breath);
        ctx.stroke();
      } else if (this.deity.id === 'ra') {
        // Báculo Was
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(24, -130 + breath);
        ctx.lineTo(24, -10);
        ctx.stroke();
      }
    }

    ctx.restore();

    if (showDebug) this.renderDebug(ctx);
  }

  // Haz de plasma solar gigantesco de Ra, en coordenadas locales (origen en los pies, X hacia donde mira)
  protected renderSolarBeam(ctx: CanvasRenderingContext2D, top: number) {
    const height = 75 + Math.sin(this.animTimer * 0.8) * 6;
    const beamGrad = ctx.createLinearGradient(40, 0, 990, 0);
    beamGrad.addColorStop(0, '#ffffff');
    beamGrad.addColorStop(0.3, '#fde047');
    beamGrad.addColorStop(0.7, '#ea580c');
    beamGrad.addColorStop(1, 'rgba(234, 88, 12, 0)');
    ctx.fillStyle = beamGrad;
    ctx.fillRect(40, top + (75 - height) / 2, 950, height);
  }

  // Modo Debug visual de colisiones
  protected renderDebug(ctx: CanvasRenderingContext2D) {
    const hurt = this.getHurtboxes();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.85)';
    ctx.strokeRect(hurt.head.x, hurt.head.y, hurt.head.w, hurt.head.h);
    ctx.strokeRect(hurt.torso.x, hurt.torso.y, hurt.torso.w, hurt.torso.h);
    ctx.strokeRect(hurt.legs.x, hurt.legs.y, hurt.legs.w, hurt.legs.h);

    const hit = this.getHitbox();
    if (hit) {
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.95)';
      ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
      ctx.fillRect(hit.x, hit.y, hit.w, hit.h);
      ctx.strokeRect(hit.x, hit.y, hit.w, hit.h);
    }
  }
}

// Duración (ticks) de cada acción ofensiva; debe coincidir con la conclusión de animaciones en Fighter.update()
const ATTACK_DURATIONS: Partial<Record<Fighter['state'], number>> = {
  ATTACK_LIGHT: 18,
  ATTACK_HEAVY: 28,
  SPECIAL: 54
};

export class CanvasFighter extends Fighter {
  public spriteConfig: SpriteSheetConfig;
  public currentAnimation: SpriteAnimationName = 'idle';
  public frameIndex: number = 0;

  private sheet: SpriteSheetEntry;
  private frameTick: number = 0;
  private lastLogicalState: Fighter['state'] = 'IDLE';
  private lastAnimTimer: number = 0;
  private flashCanvas: HTMLCanvasElement | null = null;

  constructor(playerNumber: 1 | 2, deity: DeityData, isAI: boolean, startX: number, facing: 1 | -1) {
    super(playerNumber, deity, isAI, startX, facing);
    this.spriteConfig = getSpriteSheetConfig(deity);
    this.sheet = loadSpriteSheet(this.spriteConfig.src);
  }

  // Traduce el estado lógico (movido por teclado o IA) a la animación del sprite:
  // A/D o flechas → WALK → 'run'; J/K/L o U/I/O → ATTACK_* / SPECIAL → 'attack'; recibir daño → 'hit'
  public resolveAnimation(): SpriteAnimationName {
    switch (this.state) {
      case 'WALK':
        return 'run';
      case 'ATTACK_LIGHT':
      case 'ATTACK_HEAVY':
      case 'SPECIAL':
        return 'attack';
      case 'HITSTUN':
      case 'KNOCKDOWN':
      case 'DEFEAT':
        return 'hit';
      default:
        return 'idle';
    }
  }

  public setAnimation(name: SpriteAnimationName) {
    this.currentAnimation = name;
    this.frameIndex = 0;
    this.frameTick = 0;
  }

  public update(arenaWidth: number, opponent: Fighter, difficulty: Difficulty, particles: Particle[]) {
    super.update(arenaWidth, opponent, difficulty, particles);
    this.advanceAnimation();
  }

  private advanceAnimation() {
    const next = this.resolveAnimation();
    // animTimer vuelve a 0 al encadenar un golpe sin salir del estado de ataque
    const restarted = this.state !== this.lastLogicalState || this.animTimer < this.lastAnimTimer;
    this.lastLogicalState = this.state;
    this.lastAnimTimer = this.animTimer;

    if (next !== this.currentAnimation || restarted) {
      this.setAnimation(next);
      return;
    }

    const anim = this.spriteConfig.animations[this.currentAnimation];
    const attackDuration = ATTACK_DURATIONS[this.state];

    if (this.currentAnimation === 'attack' && attackDuration) {
      // Los cuadros activos del sprite coinciden con la ventana de la hitbox
      this.frameIndex = Math.min(anim.frames - 1, Math.floor((this.animTimer / attackDuration) * anim.frames));
      return;
    }

    // La fila de golpe se detiene en el cuadro tendido (algunas hojas traen después uno levantándose)
    const lastFrame = this.currentAnimation === 'hit' ? (this.spriteConfig.lyingFrame ?? anim.frames - 1) : anim.frames - 1;
    this.frameTick++;
    if (this.frameTick >= anim.frameDuration) {
      this.frameTick = 0;
      this.frameIndex = anim.loop ? (this.frameIndex + 1) % anim.frames : Math.min(this.frameIndex + 1, lastFrame);
    }
  }

  // Copia el cuadro actual teñido de blanco para el flash de impacto
  private getFlashFrame(sx: number, sy: number): HTMLCanvasElement | null {
    const { frameWidth, frameHeight } = this.spriteConfig;
    if (!this.flashCanvas) {
      this.flashCanvas = document.createElement('canvas');
      this.flashCanvas.width = frameWidth;
      this.flashCanvas.height = frameHeight;
    }
    const fctx = this.flashCanvas.getContext('2d');
    if (!fctx) return null;

    fctx.globalCompositeOperation = 'source-over';
    fctx.clearRect(0, 0, frameWidth, frameHeight);
    fctx.drawImage(this.sheet.image, sx, sy, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
    fctx.globalCompositeOperation = 'source-atop';
    fctx.fillStyle = '#ffffff';
    fctx.fillRect(0, 0, frameWidth, frameHeight);
    return this.flashCanvas;
  }

  public render(ctx: CanvasRenderingContext2D, showDebug: boolean) {
    // Mientras la hoja carga (o si falta el archivo) se mantiene el render procedural
    if (this.sheet.status !== 'ready') {
      super.render(ctx, showDebug);
      return;
    }

    // VICTORY/DEFEAT se asignan después de update(), así que se sincroniza antes de dibujar
    const expected = this.resolveAnimation();
    if (expected !== this.currentAnimation) this.setAnimation(expected);

    const cfg = this.spriteConfig;
    const anim = cfg.animations[this.currentAnimation];
    const sx = this.frameIndex * cfg.frameWidth;
    const sy = anim.row * cfg.frameHeight;
    const drawW = cfg.frameWidth * cfg.scale;
    const drawH = cfg.frameHeight * cfg.scale;
    const drawY = -drawH + cfg.footOffset * cfg.scale;

    ctx.save();
    ctx.translate(this.x, this.y);

    // Sombra suave en suelo
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 46, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    // Aura Divina (más intensa en Super 100%)
    const auraRadius = this.superMeter >= 100 ? 88 : 72;
    const auraGrad = ctx.createRadialGradient(0, -drawH * 0.5, 12, 0, -drawH * 0.5, auraRadius);
    auraGrad.addColorStop(0, this.deity.auraColor);
    auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(0, -drawH * 0.5, auraRadius, 0, Math.PI * 2);
    ctx.fill();

    // Las hojas miran a la derecha; se espejan según la orientación
    ctx.scale(this.facing, 1);
    ctx.imageSmoothingEnabled = !cfg.pixelArt;

    const flashFrame = this.hitFlashTimer > 0 ? this.getFlashFrame(sx, sy) : null;
    if (flashFrame) {
      ctx.drawImage(flashFrame, -drawW / 2, drawY, drawW, drawH);
    } else {
      ctx.drawImage(this.sheet.image, sx, sy, cfg.frameWidth, cfg.frameHeight, -drawW / 2, drawY, drawW, drawH);
    }

    // El haz de Ra no viene en la hoja: se dibuja a la altura de su zona de daño mientras está activo
    if (this.state === 'SPECIAL' && this.deity.id === 'ra' && this.animTimer >= 12 && this.animTimer <= 46) {
      this.renderSolarBeam(ctx, -120);
    }

    ctx.restore();

    if (showDebug) this.renderDebug(ctx);
  }
}

// ==========================================================================
// COMPONENTE PRINCIPAL APP
// ==========================================================================
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [gameState, setGameState] = useState<GameState>('MAIN_MENU');
  const [gameMode, setGameMode] = useState<GameMode>('PVE');
  const [difficulty, setDifficulty] = useState<Difficulty>('NORMAL');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showHitboxes, setShowHitboxes] = useState<boolean>(false);
  const [showTouchControls, setShowTouchControls] = useState<boolean>(false);

  // Selección de personajes
  const [p1DeityIndex, setP1DeityIndex] = useState<number>(0); // Zeus
  const [p2DeityIndex, setP2DeityIndex] = useState<number>(3); // Ra
  const [p1Ready, setP1Ready] = useState<boolean>(false);
  const [p2Ready, setP2Ready] = useState<boolean>(false);

  // Menús
  const [mainMenuSelected, setMainMenuSelected] = useState<number>(0);
  const [diffMenuSelected, setDiffMenuSelected] = useState<number>(1);
  const [stageSelected, setStageSelected] = useState<number>(0); // 0 = aleatorio, 1.. = ARENAS[i - 1]
  const arenaRef = useRef<ArenaDef>(ARENAS[0]);

  // Ganador
  const [winner, setWinner] = useState<DeityData | null>(null);

  // Referencias para el ciclo a 60 FPS
  const p1Ref = useRef<Fighter | null>(null);
  const p2Ref = useRef<Fighter | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const matchTimerRef = useRef<number>(99);
  const frameCountRef = useRef<number>(0);
  const hitstopFramesRef = useRef<number>(0);
  const cameraShakeRef = useRef<number>(0);
  const superCinematicRef = useRef<{ active: boolean; caster: DeityData; timer: number } | null>(null);
  const keysPressedRef = useRef<{ [key: string]: boolean }>({});
  const screenShakeRef = useRef<{ intensity: number; duration: number; until: number } | null>(null);

  // Sacudida de cámara por tiempo real (no por frames): se mantiene aunque haya hitstop
  const shakeScreen = (intensity: number, durationMs: number = 150) => {
    const current = screenShakeRef.current;
    const now = performance.now();
    // No pisar una sacudida más fuerte que siga activa
    if (current && current.until > now && current.intensity > intensity) return;
    screenShakeRef.current = { intensity, duration: durationMs, until: now + durationMs };
  };

  useEffect(() => {
    sounds.isMuted = isMuted;
  }, [isMuted]);

  // Precarga todas las hojas de sprites para que la selección no muestre el dibujo procedural mientras descargan
  useEffect(() => {
    DEITIES.forEach(d => loadSpriteSheet(getSpriteSheetConfig(d).src));
    ARENAS.forEach(a => loadSpriteSheet(a.src));
  }, []);

  useEffect(() => {
    if (gameState === 'MAIN_MENU' || gameState === 'DIFFICULTY_MENU' || gameState === 'CHAR_SELECT' || gameState === 'STAGE_SELECT') {
      sounds.playBGM('MENU');
    } else if (gameState === 'FIGHT') {
      sounds.playBGM('BATTLE');
    } else if (gameState === 'GAME_OVER') {
      sounds.stopBGM();
    }
  }, [gameState]);

  // Abre la selección con las confirmaciones reiniciadas (si no, al volver de una partida empezaría sola)
  const openCharSelect = (mode: GameMode) => {
    setGameMode(mode);
    setP1Ready(false);
    setP2Ready(false);
    setGameState('CHAR_SELECT');
  };

  // Mandos: se traducen a las mismas teclas (1.er mando = P1, 2.º = P2)
  useEffect(() => startGamepadBridge(), []);

  // Teclado Dual Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      sounds.init();

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      keysPressedRef.current[e.key.toLowerCase()] = true;
      keysPressedRef.current[e.code] = true;

      if (e.key.toLowerCase() === 'b') {
        setShowHitboxes(prev => !prev);
      }

      // Menú Principal
      if (gameState === 'MAIN_MENU') {
        if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
          setMainMenuSelected(prev => {
            const next = prev > 0 ? prev - 1 : 4;
            sounds.playNav();
            return next;
          });
        } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
          setMainMenuSelected(prev => {
            const next = prev < 4 ? prev + 1 : 0;
            sounds.playNav();
            return next;
          });
        } else if (e.key === 'j' || e.key === 'J' || e.key === 'Enter' || e.key === ' ') {
          sounds.playSelect();
          if (mainMenuSelected === 0) {
            openCharSelect('PVP');
          } else if (mainMenuSelected === 1) {
            openCharSelect('PVE');
          } else if (mainMenuSelected === 2) {
            openCharSelect('ARCADE');
          } else if (mainMenuSelected === 3) {
            openCharSelect('ARCADE_COOP');
          } else if (mainMenuSelected === 4) {
            setGameState('DIFFICULTY_MENU');
          }
        }
      }

      // Menú de Dificultad
      else if (gameState === 'DIFFICULTY_MENU') {
        if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
          setDiffMenuSelected(prev => {
            const next = prev > 0 ? prev - 1 : 2;
            sounds.playNav();
            return next;
          });
        } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
          setDiffMenuSelected(prev => {
            const next = prev < 2 ? prev + 1 : 0;
            sounds.playNav();
            return next;
          });
        } else if (e.key === 'j' || e.key === 'J' || e.key === 'Enter' || e.key === ' ') {
          sounds.playSelect();
          const diffs: Difficulty[] = ['FACIL', 'NORMAL', 'DIFICIL'];
          setDifficulty(diffs[diffMenuSelected]);
          setGameState('MAIN_MENU');
        } else if (e.key === 'Escape') {
          sounds.playNav();
          setGameState('MAIN_MENU');
        }
      }

      // Selección de Personajes
      else if (gameState === 'CHAR_SELECT') {
        if (!p1Ready) {
          if (e.key === 'a' || e.key === 'A') {
            setP1DeityIndex(i => (i > 0 ? i - 1 : DEITIES.length - 1));
            sounds.playNav();
          } else if (e.key === 'd' || e.key === 'D') {
            setP1DeityIndex(i => (i < DEITIES.length - 1 ? i + 1 : 0));
            sounds.playNav();
          } else if (e.key === 'w' || e.key === 'W') {
            setP1DeityIndex(i => (i >= 3 ? i - 3 : i + 9));
            sounds.playNav();
          } else if (e.key === 's' || e.key === 'S') {
            setP1DeityIndex(i => (i <= 8 ? i + 3 : i - 9));
            sounds.playNav();
          } else if (e.key === 'j' || e.key === 'J') {
            sounds.playSelect();
            setP1Ready(true);
            if (gameMode === 'PVE' || gameMode === 'ARCADE') {
              setP2Ready(true);
            }
          }
        }

        // En el arcade cooperativo el 2P también elige (y confirma además con su tecla de ataque)
        if ((gameMode === 'PVP' || gameMode === 'ARCADE_COOP') && !p2Ready) {
          if (e.key === 'ArrowLeft') {
            setP2DeityIndex(i => (i > 0 ? i - 1 : DEITIES.length - 1));
            sounds.playNav();
          } else if (e.key === 'ArrowRight') {
            setP2DeityIndex(i => (i < DEITIES.length - 1 ? i + 1 : 0));
            sounds.playNav();
          } else if (e.key === 'ArrowUp') {
            setP2DeityIndex(i => (i >= 3 ? i - 3 : i + 9));
            sounds.playNav();
          } else if (e.key === 'ArrowDown') {
            setP2DeityIndex(i => (i <= 8 ? i + 3 : i - 9));
            sounds.playNav();
          } else if (e.key === 'u' || e.key === 'U' || (gameMode === 'ARCADE_COOP' && (e.code === 'Numpad1' || e.code === 'Comma'))) {
            sounds.playSelect();
            setP2Ready(true);
          }
        }

        if (e.key === 'Escape') {
          setP1Ready(false);
          setP2Ready(false);
          setGameState('MAIN_MENU');
        }
      }

      // Selección de Arena (cualquiera de los dos jugadores puede moverla)
      else if (gameState === 'STAGE_SELECT') {
        const count = ARENAS.length + 1;
        if (['a', 'A', 'ArrowLeft'].includes(e.key)) {
          setStageSelected(i => (i + count - 1) % count);
          sounds.playNav();
        } else if (['d', 'D', 'ArrowRight'].includes(e.key)) {
          setStageSelected(i => (i + 1) % count);
          sounds.playNav();
        } else if (['j', 'J', 'u', 'U', 'Enter', ' '].includes(e.key)) {
          chooseStage(stageSelected);
        } else if (e.key === 'Escape') {
          sounds.playNav();
          openCharSelect(gameMode);
        }
      }

      // Game Over
      else if (gameState === 'GAME_OVER') {
        if (e.key === 'Enter' || e.key === 'j' || e.key === 'J' || e.key === ' ') {
          startFight();
        } else if (e.key === 'Escape' || e.key === 'k' || e.key === 'K') {
          setGameState('MAIN_MENU');
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressedRef.current[e.key.toLowerCase()] = false;
      keysPressedRef.current[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState, gameMode, mainMenuSelected, diffMenuSelected, stageSelected, p1Ready, p2Ready]);

  useEffect(() => {
    if (gameState === 'CHAR_SELECT' && p1Ready && p2Ready) {
      const timeout = setTimeout(() => {
        if (gameMode === 'ARCADE' || gameMode === 'ARCADE_COOP') {
          startFight();
          return;
        }
        // Versus: se elige arena, empezando por la del reino del rival
        const rival = DEITIES[p2DeityIndex].pantheon;
        setStageSelected(ARENAS.findIndex(a => a.pantheon === rival) + 1);
        setGameState('STAGE_SELECT');
      }, 700);
      return () => clearTimeout(timeout);
    }
  }, [p1Ready, p2Ready, gameState]);

  const chooseStage = (index: number) => {
    arenaRef.current = index === 0 ? ARENAS[Math.floor(Math.random() * ARENAS.length)] : ARENAS[index - 1];
    startFight();
  };

  const startFight = () => {
    sounds.init();
    if (gameMode === 'ARCADE' || gameMode === 'ARCADE_COOP') {
      setGameState('ARCADE');
      return;
    }
    const d1 = DEITIES[p1DeityIndex];
    const d2 = DEITIES[p2DeityIndex];

    p1Ref.current = new CanvasFighter(1, d1, false, 280, 1);
    p2Ref.current = new CanvasFighter(2, d2, gameMode === 'PVE', 1000, -1);

    particlesRef.current = [];
    matchTimerRef.current = 99;
    frameCountRef.current = 0;
    hitstopFramesRef.current = 0;
    cameraShakeRef.current = 0;
    screenShakeRef.current = null;
    superCinematicRef.current = null;
    setWinner(null);
    setGameState('FIGHT');
    sounds.playSelect();
  };

  // --- BUCLE A 60 FPS ---
  useEffect(() => {
    let animationFrameId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 1280;
    canvas.height = 720;

    // Evita repetir el K.O. si en el mismo cuadro de pantalla se ejecutan varios pasos de simulación
    let matchOver = false;

    // Un paso de simulación = 1/60 s, independiente de la frecuencia del monitor
    const stepSimulation = () => {
      frameCountRef.current++;

      if (cameraShakeRef.current > 0) {
        cameraShakeRef.current *= 0.88;
        if (cameraShakeRef.current < 0.5) cameraShakeRef.current = 0;
      }

      if (superCinematicRef.current && superCinematicRef.current.timer > 0) {
        superCinematicRef.current.timer--;
        return;
      }

      if (hitstopFramesRef.current > 0) {
        hitstopFramesRef.current--;
        return;
      }

      if (gameState === 'FIGHT' && p1Ref.current && p2Ref.current) {
        const p1 = p1Ref.current;
        const p2 = p2Ref.current;
        const keys = keysPressedRef.current;

        // Cronómetro
        if (frameCountRef.current % 60 === 0 && matchTimerRef.current > 0 && p1.hp > 0 && p2.hp > 0) {
          matchTimerRef.current--;
          if (matchTimerRef.current === 0) {
            if (p1.hp >= p2.hp) {
              setWinner(p1.deity);
              sounds.playVictory();
            } else {
              setWinner(p2.deity);
              sounds.playVictory();
            }
            sounds.playKO();
            setGameState('GAME_OVER');
            matchOver = true;
          }
        }

        // P1 Inputs
        if (p1.hp > 0 && p2.hp > 0) {
          const isWalkingBackP1 = (p1.facing === 1 && (keys['a'] || keys['KeyA'])) || (p1.facing === -1 && (keys['d'] || keys['KeyD']));
          if (keys['s'] || keys['KeyS'] || isWalkingBackP1) {
            p1.crouchOrBlock(true);
          } else {
            p1.crouchOrBlock(false);
          }

          if (keys['a'] || keys['KeyA']) {
            p1.moveLeft();
          } else if (keys['d'] || keys['KeyD']) {
            p1.moveRight();
          } else if (p1.state === 'WALK') {
            p1.state = 'IDLE';
          }

          if (keys['w'] || keys['KeyW']) {
            p1.jump();
          }

          if (keys['j'] || keys['KeyJ']) {
            p1.executeLightAttack();
            keys['j'] = false;
            keys['KeyJ'] = false;
          } else if (keys['k'] || keys['KeyK']) {
            p1.executeHeavyAttack();
            keys['k'] = false;
            keys['KeyK'] = false;
          } else if (keys['l'] || keys['KeyL']) {
            if (p1.superMeter >= 100) {
              p1.executeSpecial(p2);
              triggerSpecialCinematic(p1);
            }
            keys['l'] = false;
            keys['KeyL'] = false;
          }
        }

        // P2 Inputs (PVP)
        if (gameMode === 'PVP' && p2.hp > 0 && p1.hp > 0) {
          const isWalkingBackP2 = (p2.facing === 1 && keys['ArrowLeft']) || (p2.facing === -1 && keys['ArrowRight']);
          if (keys['ArrowDown'] || isWalkingBackP2) {
            p2.crouchOrBlock(true);
          } else {
            p2.crouchOrBlock(false);
          }

          if (keys['ArrowLeft']) {
            p2.moveLeft();
          } else if (keys['ArrowRight']) {
            p2.moveRight();
          } else if (p2.state === 'WALK') {
            p2.state = 'IDLE';
          }

          if (keys['ArrowUp']) {
            p2.jump();
          }

          if (keys['u'] || keys['KeyU']) {
            p2.executeLightAttack();
            keys['u'] = false;
            keys['KeyU'] = false;
          } else if (keys['i'] || keys['KeyI']) {
            p2.executeHeavyAttack();
            keys['i'] = false;
            keys['KeyI'] = false;
          } else if (keys['o'] || keys['KeyO']) {
            if (p2.superMeter >= 100) {
              p2.executeSpecial(p1);
              triggerSpecialCinematic(p2);
            }
            keys['o'] = false;
            keys['KeyO'] = false;
          }
        }

        p1.update(canvas.width, p2, difficulty, particlesRef.current);
        p2.update(canvas.width, p1, difficulty, particlesRef.current);

        // Especiales que dañan desde update() (Zeus, Ra) piden la sacudida por aquí
        [p1, p2].forEach(f => {
          if (f.pendingScreenShake > 0) {
            shakeScreen(f.pendingScreenShake);
            f.pendingScreenShake = 0;
          }
        });

        checkCombatHits(p1, p2);
        checkCombatHits(p2, p1);

        updateParticles();

        if (p1.hp <= 0 && p2.hp > 0) {
          p1.state = 'DEFEAT';
          p2.state = 'VICTORY';
          setWinner(p2.deity);
          sounds.playKO();
          sounds.playVictory();
          setGameState('GAME_OVER');
          matchOver = true;
        } else if (p2.hp <= 0 && p1.hp > 0) {
          p2.state = 'DEFEAT';
          p1.state = 'VICTORY';
          setWinner(p1.deity);
          sounds.playKO();
          sounds.playVictory();
          setGameState('GAME_OVER');
          matchOver = true;
        }
      }
    };

    let lastTime = performance.now();
    let accumulator = 0;
    const gameLoop = (now: number) => {
      // Tope de 250 ms: al volver de una pestaña en segundo plano no se simulan cientos de pasos de golpe
      accumulator += Math.min(now - lastTime, 250);
      lastTime = now;
      while (accumulator >= SIM_STEP_MS && !matchOver) {
        stepSimulation();
        accumulator -= SIM_STEP_MS;
      }

      if (gameState === 'FIGHT' || gameState === 'GAME_OVER') {
        renderFightScene(ctx, canvas.width, canvas.height);
      }

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState, gameMode, difficulty]);

  const triggerSpecialCinematic = (caster: Fighter) => {
    superCinematicRef.current = {
      active: true,
      caster: caster.deity,
      timer: 20
    };
    cameraShakeRef.current = 28;

    particlesRef.current.push({
      x: 640,
      y: 300,
      vx: 0,
      vy: -1,
      radius: 0,
      color: '#fbbf24',
      alpha: 1,
      decay: 0.015,
      type: 'text',
      text: `¡${caster.deity.specialName.toUpperCase()}!`
    });
  };

  const checkCombatHits = (attacker: Fighter, defender: Fighter) => {
    const hitbox = attacker.getHitbox();
    if (!hitbox || attacker.hitRegistered || defender.hp <= 0) return;

    const defenderHurt = defender.getHurtboxes();
    const hitHead = checkAABB(hitbox, defenderHurt.head);
    const hitTorso = checkAABB(hitbox, defenderHurt.torso);
    const hitLegs = checkAABB(hitbox, defenderHurt.legs);

    if (hitHead || hitTorso || hitLegs) {
      attacker.hitRegistered = true;

      let dmgMultiplier = 1.0;
      if (attacker.isAI) {
        dmgMultiplier = difficulty === 'FACIL' ? 0.7 : difficulty === 'DIFICIL' ? 1.3 : 1.0;
      }

      let baseDamage = 9;
      let knockX = 6;
      let knockY = -3;
      let hitstunTime = 14;

      if (attacker.state === 'ATTACK_HEAVY') {
        baseDamage = 20;
        knockX = 14;
        knockY = -6;
        hitstunTime = 26;
      } else if (attacker.state === 'SPECIAL') {
        baseDamage = 38;
        knockX = 18;
        knockY = -8;
        hitstunTime = 36;
      }

      if (defender.isBlocking) {
        const blockedDamage = Math.max(1, Math.floor(baseDamage * 0.15 * dmgMultiplier));
        defender.hp = Math.max(0, defender.hp - blockedDamage);
        sounds.playBlock();

        defender.superMeter = Math.min(100, defender.superMeter + 7);
        attacker.superMeter = Math.min(100, attacker.superMeter + 4);

        defender.vx = attacker.facing * 4;
        attacker.vx = -attacker.facing * 3;

        // Anillo de choque de bloqueo
        particlesRef.current.push({
          x: hitbox.x + hitbox.w / 2,
          y: hitbox.y + hitbox.h / 2,
          vx: 0,
          vy: 0,
          radius: 16,
          color: 'rgba(56, 189, 248, 0.9)',
          alpha: 1,
          decay: 0.05,
          type: 'ring'
        });

        for (let i = 0; i < 14; i++) {
          particlesRef.current.push({
            x: hitbox.x + hitbox.w / 2,
            y: hitbox.y + hitbox.h / 2,
            vx: -attacker.facing * (3 + Math.random() * 4),
            vy: (Math.random() - 0.5) * 6,
            radius: 3 + Math.random() * 3,
            color: '#38bdf8',
            alpha: 0.9,
            decay: 0.05,
            type: 'block'
          });
        }

        particlesRef.current.push({
          x: defender.x,
          y: defender.y - 140,
          vx: 0,
          vy: -1.2,
          radius: 0,
          color: '#38bdf8',
          alpha: 1,
          decay: 0.025,
          type: 'text',
          text: '¡BLOQUEO!'
        });
      } else {
        // Golpe limpio
        const finalDamage = Math.floor(baseDamage * dmgMultiplier);
        defender.hp = Math.max(0, defender.hp - finalDamage);

        defender.vx = attacker.facing * knockX;
        defender.vy = knockY;
        defender.state = 'HITSTUN';
        defender.hitstunTimer = hitstunTime;
        defender.hitFlashTimer = 3; // Destello blanco en el sprite

        attacker.superMeter = Math.min(100, attacker.superMeter + (attacker.state === 'ATTACK_HEAVY' ? 18 : 10));
        defender.superMeter = Math.min(100, defender.superMeter + 14);

        hitstopFramesRef.current = attacker.state === 'ATTACK_HEAVY' ? 5 : attacker.state === 'SPECIAL' ? 8 : 3;
        if (attacker.state === 'ATTACK_HEAVY') {
          shakeScreen(16);
        } else if (attacker.state === 'SPECIAL') {
          shakeScreen(26);
        } else {
          cameraShakeRef.current = 7;
        }

        // Sangre desde el centro de la zona donde la hitbox se cruza con la hurtbox golpeada
        const struck = hitHead ? defenderHurt.head : hitTorso ? defenderHurt.torso : defenderHurt.legs;
        const overlapLeft = Math.max(hitbox.x, struck.x);
        const overlapRight = Math.min(hitbox.x + hitbox.w, struck.x + struck.w);
        const overlapTop = Math.max(hitbox.y, struck.y);
        const overlapBottom = Math.min(hitbox.y + hitbox.h, struck.y + struck.h);
        spawnBloodBurst(
          particlesRef.current,
          (overlapLeft + overlapRight) / 2,
          (overlapTop + overlapBottom) / 2,
          attacker.facing,
          defender.groundY
        );

        sounds.playHurt();
        if (attacker.state === 'ATTACK_HEAVY') {
          sounds.playHitHeavy();
        } else {
          sounds.playHitLight();
        }

        attacker.comboCount++;
        attacker.comboTimer = 75;

        // Onda expansiva de impacto
        particlesRef.current.push({
          x: hitbox.x + hitbox.w / 2,
          y: hitbox.y + hitbox.h / 2,
          vx: 0,
          vy: 0,
          radius: attacker.state === 'ATTACK_HEAVY' ? 24 : 14,
          color: 'rgba(255, 255, 255, 0.85)',
          alpha: 1,
          decay: 0.06,
          type: 'ring'
        });

        // 25+ chispas direccionales con fuerza visual
        const sparkColor = attacker.deity.accentColor;
        for (let i = 0; i < (attacker.state === 'ATTACK_HEAVY' ? 26 : 14); i++) {
          particlesRef.current.push({
            x: hitbox.x + hitbox.w / 2,
            y: hitbox.y + hitbox.h / 2,
            vx: attacker.facing * (Math.random() * 8 + 3) + (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 12,
            radius: 3 + Math.random() * 4,
            color: Math.random() < 0.5 ? sparkColor : '#ffffff',
            alpha: 1,
            decay: 0.04,
            type: 'spark'
          });
        }

        if (attacker.comboCount >= 2) {
          particlesRef.current.push({
            x: attacker.x + (attacker.facing * 40),
            y: attacker.y - 150,
            vx: attacker.facing * 0.5,
            vy: -1.5,
            radius: 0,
            color: '#fbbf24',
            alpha: 1,
            decay: 0.02,
            type: 'text',
            text: `${attacker.comboCount} HITS!`
          });
        }
      }
    }
  };

  const updateParticles = () => updateParticlesList(particlesRef.current);

  // --- RENDERIZADO VISUAL DEL COMBATE ---
  const renderFightScene = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.save();

    if (cameraShakeRef.current > 0) {
      const shakeAmt = cameraShakeRef.current;
      ctx.translate((Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt);
    }

    const shake = screenShakeRef.current;
    if (shake) {
      const remaining = shake.until - performance.now();
      if (remaining > 0) {
        // La amplitud cae linealmente hasta cero al final de la duración
        const amt = shake.intensity * (remaining / shake.duration);
        ctx.translate((Math.random() - 0.5) * amt, (Math.random() - 0.5) * amt);
      } else {
        screenShakeRef.current = null;
      }
    }

    const arenaArt = loadSpriteSheet(arenaRef.current.src);
    if (arenaArt.status === 'ready') {
      drawArena(ctx, arenaArt.image, arenaRef.current, w, h, frameCountRef.current);
    } else {
      renderFallbackStage(ctx, w, h);
    }

    // Renderizar Luchadores
    if (p1Ref.current) p1Ref.current.render(ctx, showHitboxes);
    if (p2Ref.current) p2Ref.current.render(ctx, showHitboxes);
    renderFightOverlays(ctx, w, h);
  };

  // Templo cósmico dibujado por código: se ve mientras carga la arena o si falta la imagen
  const renderFallbackStage = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    // Cielo cósmico
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, '#020617');
    skyGrad.addColorStop(0.4, '#0f172a');
    skyGrad.addColorStop(0.7, '#1e1b4b');
    skyGrad.addColorStop(1, '#090d16');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // Estrellas
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    for (let i = 0; i < 40; i++) {
      const starX = (i * 97) % w;
      const starY = (i * 53) % 360;
      const twinkle = Math.sin(frameCountRef.current * 0.05 + i) * 0.5 + 0.5;
      ctx.beginPath();
      ctx.arc(starX, starY, 1.2 * twinkle, 0, Math.PI * 2);
      ctx.fill();
    }

    // Columnas de Mármol de Templo
    const pillarPositions = [120, 320, 880, 1080];
    pillarPositions.forEach(px => {
      ctx.fillStyle = '#475569';
      ctx.fillRect(px - 10, 80, 90, 25);
      ctx.fillRect(px - 10, 520, 90, 25);

      const pillarGrad = ctx.createLinearGradient(0, 0, 0, h);
      pillarGrad.addColorStop(0, '#334155');
      pillarGrad.addColorStop(0.5, '#1e293b');
      pillarGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = pillarGrad;
      ctx.fillRect(px, 105, 70, 415);

      ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px + 35, 300, 14, 0, Math.PI * 2);
      ctx.moveTo(px + 35, 280);
      ctx.lineTo(px + 35, 320);
      ctx.stroke();
    });

    // Piras Sagradas
    const renderTorch = (tx: number, ty: number) => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(tx - 15, ty, 30, 90);
      ctx.fillStyle = '#334155';
      ctx.fillRect(tx - 25, ty - 12, 50, 16);

      const flameH = 35 + Math.sin(frameCountRef.current * 0.2 + tx) * 8;
      const flameGrad = ctx.createRadialGradient(tx, ty - 20, 4, tx, ty - 20, 35);
      flameGrad.addColorStop(0, '#fef08a');
      flameGrad.addColorStop(0.3, '#f97316');
      flameGrad.addColorStop(0.8, '#dc2626');
      flameGrad.addColorStop(1, 'rgba(220, 38, 38, 0)');
      ctx.fillStyle = flameGrad;
      ctx.beginPath();
      ctx.arc(tx, ty - 18, flameH * 0.7, 0, Math.PI * 2);
      ctx.fill();
    };
    renderTorch(60, 440);
    renderTorch(1220, 440);

    // Suelo
    const groundY = 540;
    const floorGrad = ctx.createLinearGradient(0, groundY, 0, h);
    floorGrad.addColorStop(0, '#1e293b');
    floorGrad.addColorStop(0.2, '#0f172a');
    floorGrad.addColorStop(1, '#020617');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, groundY, w, h - groundY);

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(w, groundY);
    ctx.stroke();
  };

  const renderFightOverlays = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    // Partículas y efectos de viento/anillos
    renderParticles(ctx, particlesRef.current);

    if (superCinematicRef.current && superCinematicRef.current.timer > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect(0, 0, w, h);

      ctx.font = '900 48px "Cinzel", serif';
      ctx.fillStyle = '#fbbf24';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 20;
      ctx.fillText(`¡${superCinematicRef.current.caster.specialName.toUpperCase()}!`, w / 2, 280);
      ctx.restore();
    }

    renderHUD(ctx, w);

    ctx.restore();
  };

  // --- HUD DE COMBATE ---
  const renderHUD = (ctx: CanvasRenderingContext2D, w: number) => {
    if (!p1Ref.current || !p2Ref.current) return;
    const p1 = p1Ref.current;
    const p2 = p2Ref.current;

    const barWidth = 430;
    const barHeight = 24;
    const barY = 40;

    // --- P1 ---
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(50, barY, barWidth, barHeight);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(50, barY, barWidth, barHeight);

    const p1LagW = (p1.displayHp / p1.maxHp) * barWidth;
    ctx.fillStyle = '#facc15';
    ctx.fillRect(50 + (barWidth - p1LagW), barY, p1LagW, barHeight);

    const p1HpW = (p1.hp / p1.maxHp) * barWidth;
    const p1Grad = ctx.createLinearGradient(50, 0, 50 + barWidth, 0);
    p1Grad.addColorStop(0, '#ef4444');
    p1Grad.addColorStop(0.4, '#eab308');
    p1Grad.addColorStop(1, '#22c55e');
    ctx.fillStyle = p1Grad;
    ctx.fillRect(50 + (barWidth - p1HpW), barY, p1HpW, barHeight);

    ctx.font = 'bold 20px "Cinzel", serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(`${p1.deity.name.toUpperCase()} (${p1.deity.pantheon})`, 50, barY - 10);

    // Super Meter P1
    const superBarW = 340;
    const superBarH = 14;
    const superY = barY + barHeight + 8;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.fillRect(50 + (barWidth - superBarW), superY, superBarW, superBarH);
    ctx.strokeStyle = p1.superMeter >= 100 ? '#facc15' : '#38bdf8';
    ctx.lineWidth = p1.superMeter >= 100 ? 2.5 : 1.5;
    ctx.strokeRect(50 + (barWidth - superBarW), superY, superBarW, superBarH);

    for (let div = 1; div < 4; div++) {
      const divX = 50 + (barWidth - superBarW) + (superBarW * (div / 4));
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.moveTo(divX, superY);
      ctx.lineTo(divX, superY + superBarH);
      ctx.stroke();
    }

    const p1SuperW = (p1.superMeter / 100) * superBarW;
    const superGrad1 = ctx.createLinearGradient(50, 0, 50 + barWidth, 0);
    superGrad1.addColorStop(0, '#38bdf8');
    superGrad1.addColorStop(0.6, '#a855f7');
    superGrad1.addColorStop(1, '#eab308');
    ctx.fillStyle = p1.superMeter >= 100 ? '#facc15' : superGrad1;
    ctx.fillRect(50 + (barWidth - p1SuperW), superY, p1SuperW, superBarH);

    ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
    if (p1.superMeter >= 100) {
      ctx.fillStyle = '#fde047';
      ctx.textAlign = 'right';
      ctx.fillText('⚡ ¡PODER ESPECIAL LISTO! [L]', 50 + barWidth, superY + superBarH + 16);
    } else {
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'right';
      ctx.fillText(`SUPER: ${Math.floor(p1.superMeter)}%`, 50 + barWidth, superY + superBarH + 16);
    }

    // --- P2 ---
    const p2BarX = w - 50 - barWidth;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(p2BarX, barY, barWidth, barHeight);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(p2BarX, barY, barWidth, barHeight);

    const p2LagW = (p2.displayHp / p2.maxHp) * barWidth;
    ctx.fillStyle = '#facc15';
    ctx.fillRect(p2BarX, barY, p2LagW, barHeight);

    const p2HpW = (p2.hp / p2.maxHp) * barWidth;
    const p2Grad = ctx.createLinearGradient(p2BarX, 0, p2BarX + barWidth, 0);
    p2Grad.addColorStop(0, '#22c55e');
    p2Grad.addColorStop(0.6, '#eab308');
    p2Grad.addColorStop(1, '#ef4444');
    ctx.fillStyle = p2Grad;
    ctx.fillRect(p2BarX, barY, p2HpW, barHeight);

    ctx.font = 'bold 20px "Cinzel", serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    const p2Label = p2.isAI ? `${p2.deity.name.toUpperCase()} (IA · ${difficulty})` : `${p2.deity.name.toUpperCase()} (P2)`;
    ctx.fillText(p2Label, w - 50, barY - 10);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.fillRect(p2BarX, superY, superBarW, superBarH);
    ctx.strokeStyle = p2.superMeter >= 100 ? '#facc15' : '#38bdf8';
    ctx.lineWidth = p2.superMeter >= 100 ? 2.5 : 1.5;
    ctx.strokeRect(p2BarX, superY, superBarW, superBarH);

    for (let div = 1; div < 4; div++) {
      const divX = p2BarX + (superBarW * (div / 4));
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.moveTo(divX, superY);
      ctx.lineTo(divX, superY + superBarH);
      ctx.stroke();
    }

    const p2SuperW = (p2.superMeter / 100) * superBarW;
    ctx.fillStyle = p2.superMeter >= 100 ? '#facc15' : superGrad1;
    ctx.fillRect(p2BarX, superY, p2SuperW, superBarH);

    ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
    if (p2.superMeter >= 100) {
      ctx.fillStyle = '#fde047';
      ctx.textAlign = 'left';
      ctx.fillText(p2.isAI ? '⚡ ¡ESPECIAL IA CARGADO!' : '⚡ ¡PODER ESPECIAL LISTO! [O]', p2BarX, superY + superBarH + 16);
    } else {
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'left';
      ctx.fillText(`SUPER: ${Math.floor(p2.superMeter)}%`, p2BarX, superY + superBarH + 16);
    }

    // Cronómetro central
    const timerBoxW = 80;
    const timerBoxH = 50;
    const timerX = w / 2 - timerBoxW / 2;
    const timerY = barY - 10;

    ctx.fillStyle = '#090d16';
    ctx.fillRect(timerX, timerY, timerBoxW, timerBoxH);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(timerX, timerY, timerBoxW, timerBoxH);

    ctx.font = '900 32px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = matchTimerRef.current <= 15 ? '#ef4444' : '#fbbf24';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(matchTimerRef.current.toString().padStart(2, '0'), w / 2, timerY + timerBoxH / 2);

    if (frameCountRef.current < 90) {
      ctx.font = '900 64px "Cinzel", serif';
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 6;
      ctx.strokeText('¡A LA BATALLA!', w / 2, 280);
      ctx.fillText('¡A LA BATALLA!', w / 2, 280);
    }
  };

  const handleVirtualInput = (action: string) => {
    sounds.init();
    if (!p1Ref.current) return;
    const p1 = p1Ref.current;
    if (action === 'left') p1.moveLeft();
    else if (action === 'right') p1.moveRight();
    else if (action === 'jump') p1.jump();
    else if (action === 'block') p1.crouchOrBlock(true);
    else if (action === 'unblock') p1.crouchOrBlock(false);
    else if (action === 'light') p1.executeLightAttack();
    else if (action === 'heavy') p1.executeHeavyAttack();
    else if (action === 'special' && p2Ref.current) {
      if (p1.superMeter >= 100) {
        p1.executeSpecial(p2Ref.current);
        triggerSpecialCinematic(p1);
      }
    }
  };

  return (
    <div
      onClick={() => sounds.init()}
      className="relative w-screen h-screen bg-[#04060a] text-slate-100 flex flex-col items-center justify-center overflow-hidden select-none font-sans"
    >
      {/* BARRA SUPERIOR MINIMALISTA */}
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-6 py-3 border-b border-white/10 bg-black/60 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Swords className="w-5 h-5 text-amber-400" />
          <span className="font-cinzel text-lg font-bold tracking-wider text-amber-400 uppercase">
            Mythic Clash 2D
          </span>
          <span className="text-xs text-slate-400 hidden md:inline">
            Torneo de Dioses · Físicas y Colisiones Reales
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-400 bg-white/5 rounded border border-white/10">
            <Music className="w-3.5 h-3.5 text-amber-400" />
            <span>{gameState === 'FIGHT' ? 'BGM: Furia Divina' : 'BGM: Ecos del Olimpo'}</span>
          </div>

          <button
            onClick={() => setShowHitboxes(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
              showHitboxes
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
            }`}
            title="Alternar cajas de colisión Hurtbox / Hitbox (Tecla B)"
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Hitboxes (B)</span>
          </button>

          <button
            onClick={() => setShowTouchControls(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
              showTouchControls
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
            }`}
            title="Alternar controles en pantalla"
          >
            <Gamepad2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Controles Touch</span>
          </button>

          <button
            onClick={() => setIsMuted(prev => !prev)}
            className="p-1.5 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded transition-colors"
            title={isMuted ? 'Activar sonido' : 'Silenciar sonido'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          {gameState !== 'MAIN_MENU' && (
            <button
              onClick={() => {
                sounds.playNav();
                setGameState('MAIN_MENU');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 transition-colors"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Menú</span>
            </button>
          )}
        </div>
      </header>

      {/* ÁREA DEL CANVAS DE JUEGO */}
      <div className="relative w-full h-full flex items-center justify-center p-0">
        <canvas
          ref={canvasRef}
          className="w-full h-full max-w-[1400px] max-h-[787px] object-contain shadow-2xl bg-black"
        />

        {/* --- ESCENA 1: MENÚ PRINCIPAL --- */}
        {gameState === 'MAIN_MENU' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm p-6 text-center">
            <div className="mb-8">
              <span className="text-amber-400 text-xs font-semibold tracking-widest uppercase mb-2 block flex items-center justify-center gap-2">
                <Flame className="w-4 h-4" /> Torneo Arcano de Divinidades <Flame className="w-4 h-4" />
              </span>
              <h1 className="font-cinzel text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 tracking-wider drop-shadow-md">
                MYTHIC CLASH 2D
              </h1>
              <p className="text-slate-400 text-sm mt-3 max-w-lg mx-auto">
                Combate con los dioses supremos de Grecia, Egipto, México y Japón. Retratos ilustrados, físicas de impacto y poderes celestiales.
              </p>
            </div>

            <div className="w-full max-w-md space-y-3">
              {[
                { label: 'Jugar Modo Versus Local (P1 vs P2)', mode: 'PVP' as GameMode },
                { label: `Jugar contra la IA (${difficulty})`, mode: 'PVE' as GameMode },
                { label: 'Modo Arcade: Camino de los Dioses', mode: 'ARCADE' as GameMode },
                { label: 'Arcade Cooperativo (2 Jugadores)', mode: 'ARCADE_COOP' as GameMode },
                { label: `Opciones de Dificultad: ${difficulty}`, mode: null }
              ].map((item, idx) => {
                const isSelected = mainMenuSelected === idx;
                return (
                  <button
                    key={idx}
                    onMouseEnter={() => {
                      setMainMenuSelected(idx);
                      sounds.playNav();
                    }}
                    onClick={() => {
                      sounds.playSelect();
                      if (item.mode) {
                        openCharSelect(item.mode);
                      } else {
                        setGameState('DIFFICULTY_MENU');
                      }
                    }}
                    className={`w-full py-3.5 px-6 rounded-lg text-sm font-semibold transition-all flex items-center justify-between border ${
                      isSelected
                        ? 'bg-gradient-to-r from-amber-600/30 to-amber-500/20 border-amber-400 text-amber-200 shadow-lg shadow-amber-900/30 translate-x-1'
                        : 'bg-slate-900/60 border-slate-700/60 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-amber-400 animate-pulse' : 'bg-transparent'}`} />
                      {item.label}
                    </span>
                    <span className="text-xs text-amber-400/70 font-mono">
                      {isSelected ? '[ENTER / J]' : ''}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-8 p-4 rounded-lg bg-black/40 border border-white/10 text-xs text-slate-400 max-w-xl text-left grid grid-cols-2 gap-4">
              <div>
                <span className="text-amber-300 font-semibold block mb-1">🎮 Jugador 1:</span>
                <div>Mover: <b className="text-slate-200">A / D</b> · Saltar: <b className="text-slate-200">W</b> · Bloquear: <b className="text-slate-200">S</b></div>
                <div>Golpe Rápido: <b className="text-slate-200">J</b> · Fuerte: <b className="text-slate-200">K</b> · <span className="text-amber-300 font-bold">Super: L</span></div>
              </div>
              <div>
                <span className="text-amber-300 font-semibold block mb-1">⚔️ Jugador 2 / IA:</span>
                <div>Mover: <b className="text-slate-200">← →</b> · Saltar: <b className="text-slate-200">↑</b> · Bloquear: <b className="text-slate-200">↓</b></div>
                <div>Golpe Rápido: <b className="text-slate-200">U</b> · Fuerte: <b className="text-slate-200">I</b> · <span className="text-amber-300 font-bold">Super: O</span></div>
              </div>
            </div>
          </div>
        )}

        {/* --- ESCENA 2: MENÚ DE DIFICULTAD --- */}
        {gameState === 'DIFFICULTY_MENU' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm p-6 text-center">
            <h2 className="font-cinzel text-3xl md:text-4xl font-bold text-amber-400 mb-2">
              Dificultad de la IA
            </h2>
            <p className="text-slate-400 text-sm mb-6 max-w-md">
              Ajusta la velocidad de reacción, agresividad en combos y porcentaje de defensa del enemigo.
            </p>

            <div className="w-full max-w-md space-y-4">
              {[
                {
                  id: 'FACIL' as Difficulty,
                  title: 'Fácil',
                  desc: 'IA lenta y contemplativa. Daño reducido (-30%). Ideal para novatos.',
                  color: 'border-emerald-500/50'
                },
                {
                  id: 'NORMAL' as Difficulty,
                  title: 'Normal',
                  desc: 'IA equilibrada con zonificación, ataques aéreos y bloqueo del 45%.',
                  color: 'border-amber-500/50'
                },
                {
                  id: 'DIFICIL' as Difficulty,
                  title: 'Difícil',
                  desc: 'IA implacable, castiga saltos, bloqueo del 85%, combos letales y daño +30%.',
                  color: 'border-red-500/50'
                }
              ].map((item, idx) => {
                const isSelected = diffMenuSelected === idx;
                return (
                  <button
                    key={item.id}
                    onMouseEnter={() => {
                      setDiffMenuSelected(idx);
                      sounds.playNav();
                    }}
                    onClick={() => {
                      setDifficulty(item.id);
                      sounds.playSelect();
                      setGameState('MAIN_MENU');
                    }}
                    className={`w-full p-4 rounded-lg text-left transition-all border ${
                      isSelected
                        ? `bg-slate-800/90 ${item.color} shadow-lg ring-1 ring-amber-400`
                        : 'bg-slate-900/60 border-slate-700/60 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-cinzel font-bold text-lg text-slate-100">{item.title}</span>
                      {difficulty === item.id && (
                        <span className="text-xs bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded border border-amber-400/30">
                          ACTUAL
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{item.desc}</p>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => {
                sounds.playNav();
                setGameState('MAIN_MENU');
              }}
              className="mt-8 px-6 py-2 rounded border border-slate-600 text-xs text-slate-300 hover:bg-slate-800"
            >
              Volver al Menú Principal (ESC)
            </button>
          </div>
        )}

        {/* --- ESCENA 3: PANTALLA DE SELECCIÓN CON RETRATOS CANVAS Y VISTA PREVIA DETALLADA --- */}
        {gameState === 'CHAR_SELECT' && (
          <div className="absolute inset-0 z-20 flex flex-col justify-between bg-black/85 backdrop-blur-md p-5 overflow-hidden">
            <div className="text-center mb-1">
              <span className="text-amber-400 text-xs font-semibold tracking-widest uppercase">
                {gameMode === 'PVP'
                  ? 'Modo Versus Local (2 Jugadores)'
                  : gameMode === 'ARCADE'
                  ? `Modo Arcade · Camino de los Dioses (${difficulty})`
                  : gameMode === 'ARCADE_COOP'
                  ? `Arcade Cooperativo · 2 Jugadores (${difficulty})`
                  : `Modo Solitario vs IA (${difficulty})`}
              </span>
              <h2 className="font-cinzel text-2xl md:text-3xl font-extrabold text-slate-100">
                Selección de Divinidades
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch max-w-7xl mx-auto w-full my-auto">
              {/* Tarjeta de Vista Previa Grande P1 (Izquierda) */}
              <div className="lg:col-span-3 flex justify-center">
                <DeityLargePreviewCard
                  deity={DEITIES[p1DeityIndex]}
                  playerTag="JUGADOR 1"
                  tagColor="bg-blue-500/20 text-blue-400 border-blue-400/40"
                  isReady={p1Ready}
                />
              </div>

              {/* Cuadrícula Central de los 12 Dioses con Iconos de Rostro Ilustrados */}
              <div className="lg:col-span-6 bg-slate-950/80 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-2xl">
                {(['Grecia', 'Egipto', 'México', 'Japón'] as Pantheon[]).map(pantheon => {
                  const pantheonDeities = DEITIES.filter(d => d.pantheon === pantheon);
                  return (
                    <div key={pantheon} className="mb-2 last:mb-0">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                        <span>Mitología de {pantheon}</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {pantheonDeities.map(d => {
                          const globalIdx = DEITIES.findIndex(x => x.id === d.id);
                          const isP1 = p1DeityIndex === globalIdx;
                          const isP2 = gameMode !== 'ARCADE' && p2DeityIndex === globalIdx;

                          return (
                            <DeityGridSlot
                              key={d.id}
                              deity={d}
                              isP1={isP1}
                              isP2={isP2}
                              onMouseEnter={() => {
                                if (!p1Ready) {
                                  setP1DeityIndex(globalIdx);
                                  sounds.playNav();
                                }
                              }}
                              onClick={() => {
                                if (!p1Ready) {
                                  setP1DeityIndex(globalIdx);
                                  sounds.playSelect();
                                } else if ((gameMode === 'PVP' || gameMode === 'ARCADE_COOP') && !p2Ready) {
                                  setP2DeityIndex(globalIdx);
                                  sounds.playSelect();
                                }
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tarjeta de Vista Previa Grande P2 / IA (Derecha), o la ruta de jefes en modo arcade */}
              <div className="lg:col-span-3 flex justify-center">
                {gameMode === 'ARCADE' ? (
                  <ArcadeRouteCard hero={DEITIES[p1DeityIndex]} />
                ) : (
                  <DeityLargePreviewCard
                    deity={DEITIES[p2DeityIndex]}
                    playerTag={gameMode === 'PVE' ? 'IA CHALLENGER' : 'JUGADOR 2'}
                    tagColor="bg-red-500/20 text-red-400 border-red-400/40"
                    isReady={p2Ready}
                  />
                )}
              </div>
            </div>

            {/* Barra Inferior de Confirmación e Instrucciones */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 max-w-6xl mx-auto w-full pt-3 border-t border-white/10 text-xs text-slate-400">
              <div className="flex gap-4">
                <div>P1: <b className="text-slate-200">WASD</b> · <b className="text-blue-400">J</b> confirmar</div>
                {gameMode === 'PVP' && (
                  <div>P2: <b className="text-slate-200">Flechas</b> · <b className="text-red-400">U</b> confirmar</div>
                )}
                {gameMode === 'ARCADE_COOP' && (
                  <div>P2: <b className="text-slate-200">Flechas</b> · <b className="text-red-400">1</b> o <b className="text-red-400">U</b> confirmar</div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    sounds.playNav();
                    setGameState('MAIN_MENU');
                  }}
                  className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600"
                >
                  Volver (ESC)
                </button>
                <button
                  onClick={() => {
                    sounds.playSelect();
                    setP1Ready(true);
                    setP2Ready(true);
                  }}
                  className="px-6 py-2 rounded font-semibold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black shadow-lg shadow-amber-900/40"
                >
                  {gameMode === 'ARCADE' || gameMode === 'ARCADE_COOP' ? '¡Comenzar Aventura!' : '¡Comenzar Combate!'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- ESCENA 4B: MODO ARCADE --- */}
        {gameState === 'STAGE_SELECT' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-6 text-center">
            <h2 className="font-cinzel text-3xl md:text-4xl font-bold text-amber-400 mb-1">Elige la Arena</h2>
            <p className="text-slate-400 text-sm mb-6">
              {DEITIES[p1DeityIndex].name} vs {DEITIES[p2DeityIndex].name}
            </p>

            <div className="grid grid-cols-5 gap-3 w-full max-w-5xl">
              {[null, ...ARENAS].map((arena, idx) => {
                const isSelected = stageSelected === idx;
                return (
                  <button
                    key={arena?.pantheon ?? 'random'}
                    onMouseEnter={() => {
                      if (!isSelected) sounds.playNav();
                      setStageSelected(idx);
                    }}
                    onClick={() => chooseStage(idx)}
                    className={`rounded-lg overflow-hidden border transition-all ${
                      isSelected
                        ? 'border-amber-400 ring-2 ring-amber-400 scale-105 shadow-lg shadow-amber-500/30'
                        : 'border-slate-700/60 opacity-70 hover:opacity-100'
                    }`}
                  >
                    {arena ? (
                      <img src={arena.src} alt={arena.name} className="w-full aspect-video object-cover" />
                    ) : (
                      <div className="w-full aspect-video flex items-center justify-center bg-slate-900 font-cinzel text-5xl text-amber-400">?</div>
                    )}
                    <div className="bg-slate-900/90 px-2 py-2">
                      <div className="font-cinzel font-bold text-sm text-slate-100">{arena?.name ?? 'Aleatoria'}</div>
                      <div className="text-xs text-slate-400">{arena?.pantheon ?? 'Cualquier reino'}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="mt-6 text-xs text-slate-400">A / D o ← / → para elegir · J o U para pelear · ESC para volver</p>
          </div>
        )}

        {gameState === 'ARCADE' && (
          <ArcadeMode
            deities={gameMode === 'ARCADE_COOP' ? [DEITIES[p1DeityIndex], DEITIES[p2DeityIndex]] : [DEITIES[p1DeityIndex]]}
            difficulty={difficulty}
            onExit={() => {
              setP1Ready(false);
              setP2Ready(false);
              setGameState('MAIN_MENU');
            }}
          />
        )}

        {/* --- ESCENA 5: GAME OVER --- */}
        {gameState === 'GAME_OVER' && winner && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-6 text-center">
            <span className="text-amber-400 text-sm font-semibold tracking-widest uppercase mb-1">
              K.O. - COMBATE FINALIZADO
            </span>
            <h2 className="font-cinzel text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-100 via-amber-300 to-amber-500 mb-2">
              ¡VICTORIA DE {winner.name.toUpperCase()}!
            </h2>
            <p className="text-slate-300 text-sm mb-6 font-cinzel">
              {winner.title} · {winner.pantheon}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
              <button
                onClick={startFight}
                className="flex-1 py-3 px-6 rounded-lg font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-900/50 flex items-center justify-center gap-2 transition-transform hover:scale-105"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reiniciar Combate (ENTER)</span>
              </button>
              <button
                onClick={() => {
                  sounds.playNav();
                  setGameState('MAIN_MENU');
                }}
                className="flex-1 py-3 px-6 rounded-lg font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 flex items-center justify-center gap-2 transition-colors"
              >
                <Home className="w-4 h-4" />
                <span>Menú Principal (ESC)</span>
              </button>
            </div>
          </div>
        )}

        {/* CONTROLES TÁCTILES VIRTUALES */}
        {showTouchControls && gameState === 'FIGHT' && (
          <div className="absolute bottom-4 left-0 right-0 z-20 px-8 flex justify-between pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-2 bg-black/60 p-2 rounded-xl backdrop-blur-md border border-white/10">
              <button
                onMouseDown={() => handleVirtualInput('left')}
                onTouchStart={() => handleVirtualInput('left')}
                className="w-14 h-14 bg-slate-800 hover:bg-slate-700 active:bg-amber-600 text-white font-bold rounded-lg flex items-center justify-center text-lg border border-slate-600 shadow"
              >
                ←
              </button>
              <div className="flex flex-col gap-2">
                <button
                  onMouseDown={() => handleVirtualInput('jump')}
                  onTouchStart={() => handleVirtualInput('jump')}
                  className="w-14 h-14 bg-slate-800 hover:bg-slate-700 active:bg-amber-600 text-white font-bold rounded-lg flex items-center justify-center text-lg border border-slate-600 shadow"
                >
                  ↑
                </button>
                <button
                  onMouseDown={() => handleVirtualInput('block')}
                  onMouseUp={() => handleVirtualInput('unblock')}
                  onTouchStart={() => handleVirtualInput('block')}
                  onTouchEnd={() => handleVirtualInput('unblock')}
                  className="w-14 h-14 bg-slate-800 hover:bg-slate-700 active:bg-blue-600 text-white font-bold rounded-lg flex items-center justify-center text-xs border border-slate-600 shadow"
                >
                  DEF
                </button>
              </div>
              <button
                onMouseDown={() => handleVirtualInput('right')}
                onTouchStart={() => handleVirtualInput('right')}
                className="w-14 h-14 bg-slate-800 hover:bg-slate-700 active:bg-amber-600 text-white font-bold rounded-lg flex items-center justify-center text-lg border border-slate-600 shadow"
              >
                →
              </button>
            </div>

            <div className="pointer-events-auto flex items-center gap-3 bg-black/60 p-2 rounded-xl backdrop-blur-md border border-white/10">
              <button
                onClick={() => handleVirtualInput('light')}
                className="w-14 h-14 bg-blue-600/80 hover:bg-blue-500 active:scale-95 text-white font-bold rounded-full flex flex-col items-center justify-center text-xs border border-blue-400 shadow"
              >
                <span>J</span>
                <span className="text-[9px] text-blue-200">GOLPE</span>
              </button>
              <button
                onClick={() => handleVirtualInput('heavy')}
                className="w-14 h-14 bg-orange-600/80 hover:bg-orange-500 active:scale-95 text-white font-bold rounded-full flex flex-col items-center justify-center text-xs border border-orange-400 shadow"
              >
                <span>K</span>
                <span className="text-[9px] text-orange-200">FUERTE</span>
              </button>
              <button
                onClick={() => handleVirtualInput('special')}
                className="w-16 h-16 bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-extrabold rounded-full flex flex-col items-center justify-center text-xs border-2 border-amber-300 shadow-lg shadow-amber-500/30"
              >
                <span>L</span>
                <span className="text-[9px] font-black">SUPER</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
