/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Eye, RefreshCw, Home, Swords, Gamepad2, Music } from 'lucide-react';
import ArcadeMode from './arcade/ArcadeMode';
import CharacterSelect from './CharacterSelect';
import MainMenu from './MainMenu';
import DifficultyMenu from './DifficultyMenu';
import ArenaSelect from './ArenaSelect';
import { moveRoster } from './game/roster';
import { MatchFlow, VERSUS_HEALTH, drawMatchFlow } from './game/match';
import type { RoundWinner } from './game/match';
import { victoryFrame, heavyFrame, jumpFrame, castFrame, versusSuperRelease } from './game/spriteMotion';
import { profileFor, GUARD_WINDOW, GUARD_RECOVERY, INPUT_BUFFER } from './game/combat';
import { awardMastery } from './game/progression';
import { DEITIES } from './game/deities';
import type { DeityData } from './game/deities';
import { sounds } from './game/sound';
import { SIM_STEP_MS, checkAABB, spawnBloodBurst, renderParticles, updateParticles as updateParticlesList } from './game/core';
import type { Box, Difficulty, Particle } from './game/core';
import { drawDeityPortraitIcon, onPortraitLoad } from './game/portraits';
import { startGamepadBridge } from './game/gamepad';
import { startKeyRemapper } from './game/controls';
import ControlsMenu from './ControlsMenu';
import TouchControls from './TouchControls';
import { ARENAS, ORIGEN_ARENA, drawArena } from './game/arenas';
import { ORIGEN } from './arcade/levels';
import { TOWER_ENDINGS, buildTower, towerSkill } from './game/tower';
import type { TowerRun } from './game/tower';
import { PASSIVE, STYLE_ATTACK_SPEED, STYLE_KNOCKBACK_TAKEN, STYLE_REACH, statDamageMul, statDefenseMul } from './game/styles';

import type { ArenaDef } from './game/arenas';
import { EXTRA_ROWS, drawLoading, getExtraSheetConfig, getSpriteSheetConfig, isLoading, loadSpriteSheet } from './game/sprites';
import type { SpriteAnimationName, SpriteSheetConfig, SpriteSheetEntry } from './game/sprites';

/* ==========================================================================
   MYTHIC CLASH 2D - TORNEO DE DIOSES (EDICIÓN VISUAL PROFESIONAL)
   Motor de Lucha 2D en HTML5 Canvas con Sprites Procedurales de Alta Precisión,
   Retratos Mitológicos Ilustrados y Efectos Visuales de Impacto
   ========================================================================== */

export type GameState = 'MAIN_MENU' | 'DIFFICULTY_MENU' | 'CHAR_SELECT' | 'STAGE_SELECT' | 'TOWER_MAP' | 'TOWER_END' | 'CONTROLS_MENU' | 'FIGHT' | 'GAME_OVER' | 'ARCADE';
export type GameMode = 'PVP' | 'PVE' | 'ARCADE' | 'ARCADE_COOP' | 'TOWER';

// Medallón de un dios dibujado en canvas (se redibuja cuando carga su imagen)
function Medallion({ deityId, size }: { deityId: string; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const draw = () => {
      ctx.clearRect(0, 0, size, size);
      drawDeityPortraitIcon(ctx, deityId, size / 2, size / 2, size * 0.86);
    };
    draw();
    return onPortraitLoad(deityId, draw);
  }, [deityId, size]);
  return <canvas ref={canvasRef} width={size} height={size} style={{ width: size, height: size }} className="shrink-0" />;
}

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
  public fallingHit = false;
  public landingPoseTicks = 0;
  public hitFlashTimer: number = 0; // Efecto de flash blanco al recibir golpe
  public pendingScreenShake: number = 0; // Intensidad de sacudida pedida al bucle cuando un especial conecta desde update()

  public guardAge = 999;
  public guardCooldown = 0;
  public guardStun = 0;
  public guardIntegrity = 100;
  public guardHeld = false;
  public chargeTicks = 0;
  private heavyWasHeld = false;
  public chargedHeavy = false;
  public attackConnected = false;
  public chainStep = 0;
  public riposteTicks = 0;
  private queuedAttack: 'light' | 'heavy' | null = null;
  private queueTicks = 0;

  public get heavyImpactTick() { return profileFor(this.deity.id).heavyStartup * this.attackSpeed; }
  public get attackDuration() {
    return Math.ceil((this.state === 'ATTACK_HEAVY' ? profileFor(this.deity.id).heavyDuration : 21) * this.attackSpeed);
  }
  private get attacking() { return this.state === 'ATTACK_LIGHT' || this.state === 'ATTACK_HEAVY'; }
  public stepTimer: number = 0;
  public comboCount: number = 0;
  public comboTimer: number = 0;

  public aiState: 'APPROACH' | 'RETREAT' | 'ATTACK' | 'DEFEND' | 'ZONING' | 'WAIT' = 'WAIT';
  public aiActionTimer: number = 0;

  // Torre: qué tan lista es la IA en este piso (0-1); null = según la dificultad del menú
  public aiSkill: number | null = null;

  // Daño recibido extra (Origen recibe el doble mientras usa un poder)
  public damageTakenMul(): number {
    return 1;
  }

  // Súper de cada dios
  public slowTimer: number = 0;    // Balanza de Anubis: el rival se mueve lento
  public screenFlash: number = 0;  // Espejo de Amaterasu: destello que ciega la pantalla
  private superX: number = 0;      // Posición de la ola, el tornado o la marca del súper en curso
  private superCaught: boolean = false;

  // Códice de Osiris: su barrera para todo golpe mientras dura el súper
  public get shielded(): boolean {
    return this.deity.id === 'osiris' && this.state === 'SPECIAL';
  }

  // Estilo de pelea y pasiva del dios
  public burnTimer: number = 0; // Quemadura de Ra
  private revived: boolean = false; // Osiris
  private airJumped: boolean = false; // Quetzalcóatl
  private jumpHeld: boolean = false;

  public get damageMul(): number {
    const fury = this.deity.id === 'huitzilopochtli' && this.hp < this.maxHp * PASSIVE.furyBelow ? PASSIVE.furyMul : 1;
    return statDamageMul(this.deity.stats.attack) * fury;
  }

  public get defMul(): number {
    return statDefenseMul(this.deity.stats.defense);
  }

  public get meterMul(): number {
    return this.deity.id === 'amaterasu' ? PASSIVE.meterMul : 1;
  }

  // Los estilos rápidos atacan con menos tiempo de preparación y recuperación
  private get attackSpeed(): number {
    return STYLE_ATTACK_SPEED[this.deity.style];
  }

  // Osiris vuelve una vez de la muerte
  public tryRevive(): boolean {
    if (this.deity.id !== 'osiris' || this.revived || this.hp > 0) return false;
    this.revived = true;
    this.hp = Math.round(this.maxHp * PASSIVE.reviveHp);
    this.displayHp = this.hp;
    this.state = 'IDLE';
    this.hitstunTimer = 0;
    return true;
  }

  constructor(playerNumber: 1 | 2, deity: DeityData, isAI: boolean, startX: number, facing: 1 | -1) {
    this.playerNumber = playerNumber;
    this.deity = deity;
    this.isAI = isAI;
    this.x = startX;
    this.y = this.groundY;
    this.facing = facing;
  }

  public enterHitstun(ticks: number, falling = false) {
    this.state = 'HITSTUN'; this.animTimer = 0;
    this.hitstunTimer = ticks; this.fallingHit = falling;
    this.isBlocking = false;
  }

  public advanceFinish() {
    this.animTimer++;
    this.vy += this.gravity;
    this.x = Math.max(120, Math.min(1160, this.x + this.vx));
    this.y = Math.min(this.groundY, this.y + this.vy);
    this.isGrounded = this.y >= this.groundY;
    if (this.isGrounded) this.vy = 0;
    this.vx *= 0.9;
    if (this.hitFlashTimer > 0) this.hitFlashTimer--;
  }

  public getHurtboxes(): { head: Box; torso: Box; legs: Box } {
    const isCrouching = this.state === 'CROUCH';
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

    const sp = this.attackSpeed;
    const reach = STYLE_REACH[this.deity.style];
    if (this.state === 'ATTACK_LIGHT') {
      if (this.animTimer >= 4 * sp && this.animTimer <= 12 * sp) {
        const boxW = profileFor(this.deity.id).lightReach * reach;
        const boxH = 50;
        const boxX = this.facing === 1 ? this.x + 10 : this.x - 10 - boxW;
        const boxY = this.y - this.height * 0.72;
        return { x: boxX, y: boxY, w: boxW, h: boxH };
      }
    } else if (this.state === 'ATTACK_HEAVY') {
      if (this.animTimer >= this.heavyImpactTick && this.animTimer <= this.heavyImpactTick + 5 * sp) {
        const boxW = profileFor(this.deity.id).heavyReach * reach;
        const boxH = 80;
        const boxX = this.facing === 1 ? this.x + 15 : this.x - 15 - boxW;
        const boxY = this.y - this.height * 0.82;
        return { x: boxX, y: boxY, w: boxW, h: boxH };
      }
    }

    return null;
  }

  public update(arenaWidth: number, opponent: Fighter, difficulty: Difficulty, particles: Particle[]) {
    this.animTimer++;
    if (this.landingPoseTicks > 0) this.landingPoseTicks--;
    this.guardAge++;
    if (this.guardCooldown > 0) this.guardCooldown--;
    if (this.guardStun > 0) this.guardStun--;
    if (this.riposteTicks > 0) this.riposteTicks--;
    if (!this.isBlocking && !this.attacking) this.guardIntegrity = Math.min(100, this.guardIntegrity + 0.45);
    if (this.queueTicks > 0 && --this.queueTicks === 0) this.queuedAttack = null;
    if (this.state === 'HITSTUN') { this.chargeTicks = 0; this.isBlocking = false; this.queuedAttack = null; this.chainStep = 0; }
    if (this.attackCooldown > 0) this.attackCooldown--;
    if (this.hitFlashTimer > 0) this.hitFlashTimer--;

    // Carga progresiva pasiva del Super Meter
    if (this.hp > 0 && opponent.hp > 0) {
      this.superMeter = Math.min(100, this.superMeter + 0.07 * this.meterMul);
    }

    if (this.screenFlash > 0) this.screenFlash--;
    if (this.slowTimer > 0) {
      this.slowTimer--;
      this.vx *= 0.6;
    }

    // Quemadura de Ra: nunca remata, solo desgasta
    if (this.burnTimer > 0) {
      this.burnTimer--;
      if (this.burnTimer % PASSIVE.burnEvery === 0 && this.hp > 1) {
        this.hp = Math.max(1, this.hp - PASSIVE.burnDamage);
        particles.push({ x: this.x + (Math.random() - 0.5) * 40, y: this.y - 60 - Math.random() * 60, vx: 0, vy: -2, radius: 4, color: '#f97316', alpha: 1, decay: 0.04, type: 'spark' });
      }
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
        this.landingPoseTicks = 6;
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
    if (this.state === 'ATTACK_LIGHT' && this.animTimer >= this.attackDuration) {
      this.state = 'IDLE';
      this.hitRegistered = false;
    } else if (this.state === 'ATTACK_HEAVY' && this.animTimer >= this.attackDuration) {
      this.state = 'IDLE';
      this.hitRegistered = false;
    } else if (this.state === 'SPECIAL') {
      // Especial de Zeus
      if (this.deity.id === 'zeus') {
        if (this.animTimer === 1 || this.animTimer === 17 || this.animTimer === 29) this.superX = opponent.x;
        if (this.animTimer === 14 || this.animTimer === 26 || this.animTimer === 38) {
          sounds.playThunder();
          const targetOffset = this.animTimer === 14 ? -70 : this.animTimer === 26 ? 70 : 0;
          const strikeX = this.superX + targetOffset;

          if (Math.abs(opponent.x - strikeX) < 90 && opponent.hp > 0 && !opponent.shielded) {
            opponent.hp = Math.max(0, opponent.hp - Math.round(12 * this.damageMul * opponent.defMul * opponent.damageTakenMul()));
            opponent.vx = this.facing * 8;
            opponent.vy = -10;
            opponent.enterHitstun(25, true);
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
          if (inBeamRange && opponent.hp > 0 && Math.abs(opponent.y - this.y) < 110 && !opponent.shielded) {
            opponent.hp = Math.max(0, opponent.hp - Math.round(7 * this.damageMul * opponent.defMul * opponent.damageTakenMul()));
            opponent.vx = this.facing * 10;
            opponent.enterHitstun(18, false);
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

      else {
        this.updateSuper(opponent, particles);
      }

      if (this.animTimer > 54) {
        this.state = 'IDLE';
        this.hitRegistered = false;
      }
    }

    if (this.queuedAttack && this.queueTicks > 0) {
      const canChain = this.state === 'ATTACK_LIGHT' && this.attackConnected && this.animTimer >= 6 * this.attackSpeed && this.chainStep < 2;
      if (canChain || (!this.attacking && this.state !== 'HITSTUN' && this.state !== 'SPECIAL' && this.attackCooldown <= 0)) {
        const action = this.queuedAttack;
        this.queuedAttack = null;
        this.beginAttack(action, canChain);
      }
    }

    if (this.isAI && this.hp > 0 && opponent.hp > 0) {
      this.updateAI(opponent, difficulty);
    }
  }

  // Golpe de un súper: no se bloquea (salvo la barrera de Osiris)
  private superHit(opponent: Fighter, damage: number, knockX: number, knockY: number, stun: number, particles: Particle[], color: string) {
    if (opponent.hp <= 0 || opponent.shielded) return;
    opponent.hp = Math.max(0, opponent.hp - Math.round(damage * this.damageMul * opponent.defMul * opponent.damageTakenMul()));
    const dir = opponent.x >= this.x ? 1 : -1;
    opponent.vx = dir * knockX;
    opponent.vy = knockY;
    opponent.enterHitstun(stun, stun >= 24);
    opponent.hitFlashTimer = 4;
    sounds.playHitHeavy();
    spawnBloodBurst(particles, opponent.x, opponent.y - opponent.height * 0.6, dir, opponent.groundY);
    for (let i = 0; i < 14; i++) {
      particles.push({ x: opponent.x, y: opponent.y - opponent.height * 0.5, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, radius: 3 + Math.random() * 3, color, alpha: 1, decay: 0.04, type: 'spark' });
    }
    this.pendingScreenShake = Math.max(this.pendingScreenShake, 16);
  }

  // Súper propio de los dioses sin cinemática especial (Zeus y Ra tienen la suya arriba)
  private updateSuper(opponent: Fighter, particles: Particle[]) {
    const t = this.animTimer;
    const dist = Math.abs(opponent.x - this.x);
    const spark = (x: number, y: number, color: string, type: Particle['type'] = 'spark', spread: number = 6) => {
      particles.push({ x, y, vx: (Math.random() - 0.5) * spread, vy: (Math.random() - 0.5) * spread, radius: 3 + Math.random() * 4, color, alpha: 1, decay: 0.04, type });
    };

    switch (this.deity.id) {
      case 'hades': {
        // Niebla del Tártaro: llamas oscuras sobre donde estaba el rival que lo desgarran mientras siga dentro
        if (t === 12) this.superX = opponent.x;
        if (t >= 12 && t <= 46) {
          for (let i = 0; i < 3; i++) spark(this.superX + (Math.random() - 0.5) * 200, this.groundY - Math.random() * 220, i % 2 ? '#7c3aed' : '#1e1b4b', 'smoke', 3);
          if (t % 8 === 0 && Math.abs(opponent.x - this.superX) < 120) this.superHit(opponent, 7, 1, 0, 14, particles, '#a855f7');
        }
        break;
      }
      case 'poseidon': {
        // Maremoto Sísmico: una ola que recorre la arena y arrastra al rival
        if (t === 12) {
          this.superX = this.x;
          this.superCaught = false;
        }
        if (t >= 12 && t <= 50) {
          this.superX += this.facing * 26;
          for (let i = 0; i < 6; i++) spark(this.superX, this.groundY - Math.random() * 200, i % 2 ? '#38bdf8' : '#e0f2fe', 'wind', 4);
          if (!this.superCaught && Math.abs(opponent.x - this.superX) < 60) {
            this.superCaught = true;
            this.superHit(opponent, 30, 24, -9, 34, particles, '#38bdf8');
          }
        }
        break;
      }
      case 'anubis': {
        // Balanza del Destino: cruza al rival como una sombra, le desgarra la vida y lo deja lento
        if (t === 12) this.superCaught = false;
        if (t >= 12 && t <= 22) {
          this.vx = this.facing * 30;
          spark(this.x, this.y - 80, '#facc15', 'smoke', 2);
          if (!this.superCaught && dist < 70) {
            this.superCaught = true;
            this.superHit(opponent, 24, 4, -4, 30, particles, '#facc15');
            opponent.slowTimer = 240;
          }
        }
        break;
      }
      case 'osiris': {
        // Códice Eterno: barrera de arena (no recibe daño), se regenera y los pilares empujan al rival
        if (t % 4 === 0) spark(this.x + (Math.random() - 0.5) * 120, this.y - Math.random() * 160, '#fde68a', 'dust', 3);
        if (t % 6 === 0 && this.hp > 0) this.hp = Math.min(this.maxHp, this.hp + 2);
        if (t === 24 && dist < 260) this.superHit(opponent, 16, 18, -7, 26, particles, '#fde68a');
        break;
      }
      case 'quetzalcoatl': {
        // Vórtice de Jade: un torbellino avanza, atrapa al rival y lo azota en el aire
        if (t === 12) {
          this.superX = this.x + this.facing * 60;
          this.superCaught = false;
        }
        if (t >= 12 && t <= 52) {
          if (!this.superCaught) this.superX += this.facing * 10;
          for (let i = 0; i < 3; i++) {
            const a = t * 0.5 + i * 2.1;
            spark(this.superX + Math.cos(a) * 45, this.groundY - ((t * 9 + i * 70) % 240), i % 2 ? '#10b981' : '#a7f3d0', 'wind', 2);
          }
          if (!this.superCaught && Math.abs(opponent.x - this.superX) < 70) this.superCaught = true;
          if (this.superCaught) {
            opponent.x = this.superX;
            opponent.vy = Math.min(opponent.vy, -3);
            if (t % 8 === 0) this.superHit(opponent, 7, 0, -6, 16, particles, '#10b981');
          }
        }
        break;
      }
      case 'huitzilopochtli': {
        // Llamarada Xiuhcóatl: embestida en llamas que quema al rival
        if (t === 12) this.superCaught = false;
        if (t >= 12 && t <= 32) {
          this.vx = this.facing * 22;
          for (let i = 0; i < 3; i++) spark(this.x - this.facing * 30, this.y - Math.random() * 140, i % 2 ? '#f97316' : '#1c1917', 'solar', 4);
          if (!this.superCaught && dist < 80) {
            this.superCaught = true;
            this.superHit(opponent, 32, 16, -8, 32, particles, '#f97316');
            opponent.burnTimer = PASSIVE.burnTicks;
          }
        }
        break;
      }
      case 'mictlantecuhtli': {
        // Desgarro del Mictlán: marca el suelo bajo el rival y brotan garras de hueso (se esquiva moviéndose o saltando)
        if (t === 10) this.superX = opponent.x;
        if (t >= 10 && t < 26 && t % 3 === 0) particles.push({ x: this.superX, y: this.groundY, vx: 0, vy: 0, radius: 40 + (t - 10) * 2, color: 'rgba(168, 85, 247, 0.8)', alpha: 1, decay: 0.08, type: 'ring' });
        if (t === 26) {
          for (let i = 0; i < 24; i++) spark(this.superX + (Math.random() - 0.5) * 120, this.groundY - Math.random() * 30, i % 2 ? '#e7e5e4' : '#581c87', 'spark', 3);
          for (let i = 0; i < 24; i++) particles.push({ x: this.superX + (Math.random() - 0.5) * 120, y: this.groundY, vx: 0, vy: -8 - Math.random() * 8, radius: 4, color: '#e7e5e4', alpha: 1, decay: 0.03, type: 'spark' });
          if (Math.abs(opponent.x - this.superX) < 95 && opponent.y > opponent.groundY - 60) {
            this.superHit(opponent, 30, 0, 0, 55, particles, '#e7e5e4');
          }
        }
        break;
      }
      case 'amaterasu': {
        // Espejo Sagrado Yata: destello solar que ciega y aturde al rival dondequiera que esté
        if (t === 16) {
          this.screenFlash = 24;
          this.superHit(opponent, 18, 6, -3, 70, particles, '#fef08a');
        }
        if (t >= 10 && t <= 20) spark(this.x + this.facing * 40, this.y - 110, '#fef08a', 'solar', 12);
        break;
      }
      case 'susanoo': {
        // Tajo del Dragón Marino: cinco cortes de viento que cruzan la pantalla hacia el frente
        if ([14, 20, 26, 32, 38].includes(t)) {
          sounds.playHeavySwing();
          for (let i = 0; i < 18; i++) {
            particles.push({ x: this.x + this.facing * (40 + Math.random() * 600), y: this.y - 70 - (t % 12) * 4 + (Math.random() - 0.5) * 20, vx: this.facing * 22, vy: 0, radius: 3 + Math.random() * 3, color: i % 2 ? '#bae6fd' : '#ffffff', alpha: 0.9, decay: 0.06, type: 'wind' });
          }
          const ahead = this.facing === 1 ? opponent.x > this.x : opponent.x < this.x;
          if (ahead && dist < 700) this.superHit(opponent, 7, 5, -2, 16, particles, '#bae6fd');
        }
        break;
      }
      case 'raijin': {
        // Redoble Estruendoso: tres ondas sónicas eléctricas que expulsan al rival
        if ([14, 26, 38].includes(t)) {
          sounds.playThunder();
          particles.push({ x: this.x, y: this.y - 80, vx: 0, vy: 0, radius: 40, color: 'rgba(96, 165, 250, 0.9)', alpha: 1, decay: 0.03, type: 'ring' });
          for (let i = 0; i < 20; i++) spark(this.x, this.y - 80, i % 2 ? '#60a5fa' : '#fde047', 'lightning', 14);
          if (dist < 280) this.superHit(opponent, 11, 13, -5, 20, particles, '#60a5fa');
        }
        break;
      }
    }
  }

  protected updateAI(opponent: Fighter, difficulty: Difficulty) {
    this.aiActionTimer++;
    if (this.isGrounded) this.releaseJump();

    let reactionInterval = 20;
    let blockProbability = 0.4;
    let aggression = 0.55;

    if (this.aiSkill !== null) {
      // Torre: de torpe en el piso 1 a implacable en el 8
      reactionInterval = Math.round(36 - this.aiSkill * 29);
      blockProbability = 0.15 + this.aiSkill * 0.7;
      aggression = 0.35 + this.aiSkill * 0.5;
    } else if (difficulty === 'FACIL') {
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

    if (this.attacking || this.state === 'SPECIAL' || this.state === 'HITSTUN' || this.guardStun > 0) return;
    if (this.aiActionTimer % reactionInterval !== 0) return;

    if (opponentAttacking && dist < 220 && Math.random() < blockProbability) {
      this.crouchOrBlock(true);
      this.vx = -this.facing * 1.8;
      return;
    } else {
      this.crouchOrBlock(false);
      if (this.state === 'BLOCK') this.state = 'IDLE';
    }

    if (this.aiActionTimer % reactionInterval === 0) {
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
          this.chargeTicks = opponent.isBlocking ? 24 : 0;
          this.executeHeavyAttack();
        } else if (this.isGrounded) {
          this.jump();
          this.vx = -this.facing * 4;
        }
      }
    }
  }

  private requestAttack(action: 'light' | 'heavy') {
    if (this.hp <= 0 || this.state === 'HITSTUN' || this.state === 'SPECIAL' || this.guardStun > 0) return;
    if (this.attacking || this.attackCooldown > 0) {
      this.queuedAttack = action;
      this.queueTicks = INPUT_BUFFER;
      return;
    }
    this.beginAttack(action, false);
  }

  private beginAttack(action: 'light' | 'heavy', chained: boolean) {
    this.chainStep = chained ? this.chainStep + 1 : 0;
    this.state = action === 'light' ? 'ATTACK_LIGHT' : 'ATTACK_HEAVY';
    this.animTimer = 0;
    this.isBlocking = false;
    this.hitRegistered = false;
    this.attackConnected = false;
    this.chargedHeavy = action === 'heavy' && this.chargeTicks >= 24;
    this.chargeTicks = 0;
    this.attackCooldown = this.attackDuration;
    if (action === 'heavy') sounds.playHeavySwing(); else sounds.playSwing();
  }

  public releaseHeavyInput() {
    if (!this.heavyWasHeld) this.executeHeavyAttack();
    else this.holdHeavy(false);
  }

  public tryPerfectGuard(attacker: Fighter, damage: number) {
    if (!this.isBlocking || this.guardAge > GUARD_WINDOW || this.shielded) return false;
    this.guardAge = 999;
    this.guardIntegrity = Math.min(100, this.guardIntegrity + 18);
    this.superMeter = Math.min(100, this.superMeter + 12 * this.meterMul);
    this.riposteTicks = 45;
    if (this.deity.id === 'anubis') this.vx = -attacker.facing * 9;
    if (this.deity.id === 'mictlantecuhtli') attacker.hp = Math.max(0, attacker.hp - Math.round(damage * PASSIVE.reflect));
    attacker.enterHitstun(18, false);
    attacker.comboCount = 0;
    return true;
  }

  public executeLightAttack() { this.requestAttack('light'); }
  public executeHeavyAttack() { this.requestAttack('heavy'); }
  public holdHeavy(held: boolean) {
    if (held && !this.heavyWasHeld && this.attacking) this.requestAttack('heavy');
    this.heavyWasHeld = held;
    if (held && !this.attacking && this.state !== 'HITSTUN' && this.state !== 'SPECIAL' && this.guardStun <= 0) {
      this.chargeTicks = Math.min(40, this.chargeTicks + 1);
      this.isBlocking = false;
      this.vx *= 0.7;
    } else if (!held && this.chargeTicks > 0) {
      this.executeHeavyAttack();
      this.chargeTicks = 0;
    }
  }

  public executeSpecial(opponent: Fighter) {
    if (this.superMeter < 100 || this.hp <= 0 || this.state === 'HITSTUN' || this.state === 'SPECIAL' || this.attacking || this.guardStun > 0) return false;
    this.superMeter = 0;
    this.isBlocking = false;
    this.chargeTicks = 0;
    this.queuedAttack = null;
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
    return true;
  }

  public moveLeft() {
    if (this.state === 'HITSTUN' || this.state === 'ATTACK_LIGHT' || this.state === 'ATTACK_HEAVY' || this.state === 'SPECIAL') return;
    if (this.guardStun > 0 || this.chargeTicks > 0) return;
    const speed = this.deity.stats.speed * 1.1 + 3.2;
    this.vx = -speed;
    if (this.isGrounded) this.state = 'WALK';
  }

  public moveRight() {
    if (this.state === 'HITSTUN' || this.state === 'ATTACK_LIGHT' || this.state === 'ATTACK_HEAVY' || this.state === 'SPECIAL') return;
    if (this.guardStun > 0 || this.chargeTicks > 0) return;
    const speed = this.deity.stats.speed * 1.1 + 3.2;
    this.vx = speed;
    if (this.isGrounded) this.state = 'WALK';
  }

  public jump() {
    const fresh = !this.jumpHeld;
    this.jumpHeld = true;
    if (fresh && this.isGrounded && !this.attacking && this.guardStun <= 0 && this.state !== 'HITSTUN' && this.state !== 'SPECIAL') {
      this.isBlocking = false;
      this.vy = -16.5;
      this.isGrounded = false;
      this.state = 'JUMP';
      this.animTimer = 0; this.landingPoseTicks = 0;
      this.airJumped = false;
      sounds.playJump();
    } else if (fresh && this.deity.id === 'quetzalcoatl' && this.state === 'JUMP' && !this.airJumped) {
      this.airJumped = true;
      this.animTimer = 0;
      this.vy = -14;
      sounds.playJump();
    }
  }

  public releaseJump() {
    this.jumpHeld = false;
  }

  public crouchOrBlock(isHolding: boolean) {
    const fresh = isHolding && !this.guardHeld;
    this.guardHeld = isHolding;
    if (this.state === 'HITSTUN' || this.state === 'SPECIAL' || this.attacking || this.chargeTicks > 0) { this.isBlocking = false; return; }
    if (isHolding && this.isGrounded) {
      if (fresh && this.guardCooldown <= 0) { this.guardAge = 0; this.guardCooldown = GUARD_RECOVERY; }
      this.isBlocking = true;
      this.state = 'BLOCK';
      this.vx *= 0.5;
    } else {
      this.isBlocking = false;
      if (this.state === 'BLOCK' || this.state === 'CROUCH') this.state = 'IDLE';
    }
  }

  // ========================================================================
  // RENDERIZADO PROCEDURAL DETALLADO DEL LUCHADOR (SPRITES COMPLEJOS)
  // ========================================================================
  public render(ctx: CanvasRenderingContext2D, showDebug: boolean) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.facing, 1);

    const isCrouch = this.state === 'CROUCH';
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

export class CanvasFighter extends Fighter {
  public spriteConfig: SpriteSheetConfig;
  public currentAnimation: SpriteAnimationName = 'idle';
  public frameIndex: number = 0;

  public sheet: SpriteSheetEntry;
  // Segunda hoja: salto, defensa, súper, golpe fuerte y victoria (si el dios ya la tiene)
  private extraConfig: SpriteSheetConfig | null;
  private extraSheet: SpriteSheetEntry | null;
  protected sizeMul: number = 1;
  private frameTick: number = 0;
  private lastLogicalState: Fighter['state'] = 'IDLE';
  private lastAnimTimer: number = 0;
  private flashCanvas: HTMLCanvasElement | null = null;

  constructor(playerNumber: 1 | 2, deity: DeityData, isAI: boolean, startX: number, facing: 1 | -1) {
    super(playerNumber, deity, isAI, startX, facing);
    this.spriteConfig = getSpriteSheetConfig(deity);
    this.sheet = loadSpriteSheet(this.spriteConfig.src);
    this.extraConfig = getExtraSheetConfig(deity);
    this.extraSheet = this.extraConfig ? loadSpriteSheet(this.extraConfig.src) : null;
  }

  public get loading() { return isLoading([this.sheet, this.extraSheet]); }

  // Cuadro de la segunda hoja para el estado actual, o null si se usa la primera
  protected extraPose(): { row: number; frame: number } | null {
    if (this.extraSheet?.status !== 'ready') return null;
    switch (this.state) {
      case 'JUMP':
        // y crece hacia abajo: subiendo vy < 0
        return { row: EXTRA_ROWS.jump, frame: jumpFrame(this.animTimer, -this.vy, this.groundY - this.y) };
      case 'BLOCK':
        return { row: EXTRA_ROWS.defense, frame: this.hitFlashTimer > 0 || this.guardStun > 0 ? 1 : 0 };
      case 'CROUCH':
        return { row: EXTRA_ROWS.defense, frame: 2 };
      case 'IDLE':
        return this.landingPoseTicks > 0 ? { row: EXTRA_ROWS.jump, frame: 3 } : null;
      case 'SPECIAL':
        return { row: EXTRA_ROWS.super, frame: castFrame(this.animTimer, versusSuperRelease(this.deity.id), 54) };
      case 'ATTACK_HEAVY':
        return { row: EXTRA_ROWS.finish, frame: heavyFrame(this.animTimer, this.heavyImpactTick) };
      case 'VICTORY':
        return !this.isGrounded ? { row: EXTRA_ROWS.jump, frame: jumpFrame(3, -this.vy, this.groundY - this.y) } : { row: EXTRA_ROWS.finish, frame: victoryFrame(this.animTimer) };
      default:
        return null;
    }
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
    const attackDuration = this.state === 'SPECIAL' ? 54 : this.state === 'ATTACK_LIGHT' || this.state === 'ATTACK_HEAVY' ? this.attackDuration : undefined;

    if (this.currentAnimation === 'attack' && attackDuration) {
      // Los cuadros activos del sprite coinciden con la ventana de la hitbox
      this.frameIndex = Math.min(anim.frames - 1, Math.floor((this.animTimer / attackDuration) * anim.frames));
      return;
    }

    if (this.state === 'HITSTUN') {
      const lying = this.spriteConfig.lyingFrame ?? anim.frames - 1;
      this.frameIndex = !this.fallingHit ? 0
        : this.isGrounded && this.hitstunTimer <= 6 && this.spriteConfig.getupFrame !== undefined ? this.spriteConfig.getupFrame
        : Math.min(lying, Math.floor(this.animTimer / anim.frameDuration));
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

  public advanceFinish() {
    super.advanceFinish();
    this.advanceAnimation();
  }

  // Copia el cuadro actual teñido de blanco para el flash de impacto
  private getFlashFrame(sx: number, sy: number, image: HTMLImageElement, cfg: SpriteSheetConfig): HTMLCanvasElement | null {
    const { frameWidth, frameHeight } = cfg;
    if (!this.flashCanvas) {
      this.flashCanvas = document.createElement('canvas');
    }
    if (this.flashCanvas.width !== frameWidth) this.flashCanvas.width = frameWidth;
    if (this.flashCanvas.height !== frameHeight) this.flashCanvas.height = frameHeight;
    const fctx = this.flashCanvas.getContext('2d');
    if (!fctx) return null;

    fctx.globalCompositeOperation = 'source-over';
    fctx.clearRect(0, 0, frameWidth, frameHeight);
    fctx.drawImage(image, sx, sy, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
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

    const extra = this.extraPose();
    const cfg = extra && this.extraConfig ? this.extraConfig : this.spriteConfig;
    const image = extra && this.extraSheet ? this.extraSheet.image : this.sheet.image;
    const anim = cfg.animations[this.currentAnimation];
    const sx = (extra ? extra.frame : this.frameIndex) * cfg.frameWidth;
    const sy = (extra ? extra.row : anim.row) * cfg.frameHeight;
    const drawW = cfg.frameWidth * cfg.scale * this.sizeMul;
    const drawH = cfg.frameHeight * cfg.scale * this.sizeMul;
    const drawY = -drawH + cfg.footOffset * cfg.scale * this.sizeMul;

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

    const flashFrame = this.hitFlashTimer > 0 ? this.getFlashFrame(sx, sy, image, cfg) : null;
    if (flashFrame) {
      ctx.drawImage(flashFrame, -drawW / 2, drawY, drawW, drawH);
    } else {
      ctx.drawImage(image, sx, sy, cfg.frameWidth, cfg.frameHeight, -drawW / 2, drawY, drawW, drawH);
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
// ORIGEN EN VERSUS: jefe de la cima de la torre, al doble de tamaño
// Se teletransporta a la espalda, lanza esferas que se esquivan saltando y,
// con poca vida, colapsa el cosmos: solo el círculo de luz protege.
// ==========================================================================
type OrigenMove = 'teleport' | 'orb' | 'collapse';
const COLLAPSE_WARN = 150;
const SAFE_RADIUS = 110;

export class OrigenFighter extends CanvasFighter {
  private move: OrigenMove | null = null;
  private moveTimer: number = 0;
  private moveCooldown: number = 180;
  private orbs: { x: number; vx: number; t: number }[] = [];
  private safeX: number | null = null;

  constructor(deity: DeityData, startX: number, facing: 1 | -1) {
    super(2, deity, true, startX, facing);
    this.sizeMul = 1.2;
    this.width = 130;
    this.height = 300;
    this.maxHp = 180;
    this.hp = 180;
    this.displayHp = 180;
    this.aiSkill = 1;
  }

  public get heavyImpactTick() { return 8; }

  protected extraPose(): { row: number; frame: number } | null {
    const pose = super.extraPose();
    if (pose && this.state === 'SPECIAL' && this.move) {
      const release = this.move === 'collapse' ? COLLAPSE_WARN : 20;
      return { row: EXTRA_ROWS.super, frame: castFrame(this.moveTimer, release, this.move === 'collapse' ? COLLAPSE_WARN + 30 : 65) };
    }
    return pose;
  }

  public damageTakenMul(): number {
    return this.move ? 2 : 1;
  }

  // Golpes anchos y a la altura del rival (su cuerpo mide el doble)
  public getHitbox(): Box | null {
    if (this.hitRegistered) return null;
    const heavy = this.state === 'ATTACK_HEAVY';
    const active = heavy ? this.animTimer >= 8 && this.animTimer <= 20 : this.state === 'ATTACK_LIGHT' && this.animTimer >= 4 && this.animTimer <= 12;
    if (!active) return null;
    const boxW = heavy ? 230 : 180;
    return { x: this.facing === 1 ? this.x + 10 : this.x - 10 - boxW, y: this.groundY - 150, w: boxW, h: 130 };
  }

  // Su súper es elegir uno de sus poderes
  public executeSpecial(_opponent: Fighter) {
    this.superMeter = 0;
    return false;
  }

  protected updateAI(opponent: Fighter, difficulty: Difficulty) {
    if (this.move) return;
    if (this.moveCooldown > 0) this.moveCooldown--;
    if (this.moveCooldown <= 0 && this.state !== 'HITSTUN' && opponent.hp > 0) {
      const lowHp = this.hp < this.maxHp * 0.35;
      const options: OrigenMove[] = lowHp ? ['collapse', 'collapse', 'teleport', 'orb'] : ['teleport', 'orb', 'orb'];
      this.startMove(options[Math.floor(Math.random() * options.length)], opponent);
      return;
    }
    super.updateAI(opponent, difficulty);
  }

  private startMove(move: OrigenMove, opponent: Fighter) {
    this.move = move;
    this.moveTimer = 0;
    this.state = 'SPECIAL';
    this.animTimer = 0;
    this.vx = 0;
    this.facing = opponent.x >= this.x ? 1 : -1;
    if (move === 'collapse') {
      // El círculo aparece del lado contrario al rival para obligarlo a cruzar
      this.safeX = opponent.x < 640 ? 980 + Math.random() * 120 : 180 + Math.random() * 120;
      sounds.playSuperActivation();
    }
  }

  public update(arenaWidth: number, opponent: Fighter, difficulty: Difficulty, particles: Particle[]) {
    super.update(arenaWidth, opponent, difficulty, particles);
    this.updateOrbs(opponent, particles);
    if (!this.move || this.hp <= 0) {
      this.move = null;
      return;
    }
    // Mantiene la pose de poder mientras dure el movimiento
    this.state = 'SPECIAL';
    this.animTimer = Math.min(this.animTimer, 30);
    this.vx = 0;
    const t = ++this.moveTimer;

    if (this.move === 'teleport') {
      if (t === 1 || t === 20) this.starBurst(particles);
      if (t === 20) {
        this.x = Math.max(90, Math.min(arenaWidth - 90, opponent.x - opponent.facing * 150));
        this.facing = opponent.x >= this.x ? 1 : -1;
      }
      if (t >= 36) this.endMove(true);
    } else if (this.move === 'orb') {
      if (t === 20 || (this.hp < this.maxHp * 0.5 && t === 45)) {
        this.orbs.push({ x: this.x + this.facing * 90, vx: this.facing * 7, t: 0 });
        sounds.playSolarBeam();
      }
      if (t >= 65) this.endMove(false);
    } else if (this.move === 'collapse') {
      if (t === COLLAPSE_WARN && this.safeX !== null) {
        this.pendingScreenShake = 26;
        sounds.playThunder();
        for (let i = 0; i < 40; i++) {
          particles.push({ x: Math.random() * arenaWidth, y: 150 + Math.random() * 400, vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 4, radius: 3 + Math.random() * 4, color: i % 2 ? '#c4b5fd' : '#fde68a', alpha: 1, decay: 0.02, type: 'spark' });
        }
        if (Math.abs(opponent.x - this.safeX) > SAFE_RADIUS && opponent.hp > 0) {
          this.hurt(opponent, 30, particles);
          opponent.vy = -12;
        }
        this.safeX = null;
      }
      if (t >= COLLAPSE_WARN + 30) this.endMove(false);
    }
  }

  private endMove(strike: boolean) {
    this.move = null;
    this.state = 'IDLE';
    this.moveCooldown = this.hp < this.maxHp * 0.5 ? 130 : 200;
    if (strike) {
      this.attackCooldown = 0;
      this.executeHeavyAttack();
    }
  }

  // Daño directo de sus poderes (como los especiales de Zeus y Ra)
  private hurt(opponent: Fighter, damage: number, particles: Particle[]) {
    opponent.hp = Math.max(0, opponent.hp - Math.round(damage * opponent.defMul));
    opponent.vx = (opponent.x >= this.x ? 1 : -1) * 9;
    opponent.enterHitstun(30, true);
    opponent.hitFlashTimer = 4;
    sounds.playHitHeavy();
    spawnBloodBurst(particles, opponent.x, opponent.y - opponent.height * 0.6, opponent.x >= this.x ? 1 : -1, opponent.groundY);
    this.pendingScreenShake = Math.max(this.pendingScreenShake, 18);
  }

  // Las esferas ruedan por el suelo: se esquivan saltando o se bloquean
  private updateOrbs(opponent: Fighter, particles: Particle[]) {
    for (const orb of this.orbs) {
      orb.x += orb.vx;
      orb.t++;
      const touching = Math.abs(orb.x - opponent.x) < 50 && opponent.y > opponent.groundY - 70;
      if (touching && opponent.hp > 0 && this.hp > 0) {
        orb.t = 9999;
        if (opponent.isBlocking) {
          opponent.hp = Math.max(0, opponent.hp - 2);
          sounds.playBlock();
        } else {
          this.hurt(opponent, 11, particles);
        }
      }
    }
    this.orbs = this.orbs.filter(o => o.t < 9999 && o.x > -60 && o.x < 1340);
  }

  private starBurst(particles: Particle[]) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      particles.push({ x: this.x, y: this.y - 170, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, radius: 3, color: i % 2 ? '#fde68a' : '#c4b5fd', alpha: 1, decay: 0.03, type: 'spark' });
    }
    sounds.playJump();
  }

  public render(ctx: CanvasRenderingContext2D, showDebug: boolean) {
    // Círculo de luz del colapso, sobre el suelo
    if (this.move === 'collapse' && this.safeX !== null) {
      const pulse = this.moveTimer % 20 < 10 ? 0.35 : 0.2;
      ctx.save();
      ctx.fillStyle = `rgba(253, 230, 138, ${pulse})`;
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(this.safeX, this.groundY, SAFE_RADIUS, SAFE_RADIUS * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const beam = ctx.createLinearGradient(0, 0, 0, this.groundY);
      beam.addColorStop(0, 'rgba(253, 230, 138, 0)');
      beam.addColorStop(1, `rgba(253, 230, 138, ${pulse * 0.6})`);
      ctx.fillStyle = beam;
      ctx.fillRect(this.safeX - SAFE_RADIUS * 0.6, 0, SAFE_RADIUS * 1.2, this.groundY);
      // El resto del cosmos se oscurece conforme se acerca el estallido
      ctx.fillStyle = `rgba(30, 10, 60, ${0.35 * Math.min(1, this.moveTimer / COLLAPSE_WARN)})`;
      ctx.fillRect(0, 0, this.safeX - SAFE_RADIUS, 720);
      ctx.fillRect(this.safeX + SAFE_RADIUS, 0, 1280, 720);
      ctx.restore();
    }

    // Se desvanece y reaparece al teletransportarse
    const t = this.moveTimer;
    const alpha = this.move === 'teleport' ? (t < 20 ? 1 - t / 20 : Math.min(1, (t - 20) / 16)) : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    super.render(ctx, showDebug);
    ctx.restore();

    for (const orb of this.orbs) {
      const glow = ctx.createRadialGradient(orb.x, this.groundY - 30, 4, orb.x, this.groundY - 30, 34);
      glow.addColorStop(0, '#fff7d6');
      glow.addColorStop(0.4, '#a78bfa');
      glow.addColorStop(1, 'rgba(76, 29, 149, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(orb.x, this.groundY - 30, 34, 0, Math.PI * 2);
      ctx.fill();
    }
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
  // En celulares y tablets los controles táctiles salen solos
  const [showTouchControls, setShowTouchControls] = useState<boolean>(() => window.matchMedia('(pointer: coarse)').matches);

  // Selección de personajes
  const [p1DeityIndex, setP1DeityIndex] = useState<number>(0); // Zeus
  const [p2DeityIndex, setP2DeityIndex] = useState<number>(3); // Ra
  const [p1Ready, setP1Ready] = useState<boolean>(false);
  const [p2Ready, setP2Ready] = useState<boolean>(false);

  // Menús
  const [mainMenuSelected, setMainMenuSelected] = useState<number>(0);
  const [diffMenuSelected, setDiffMenuSelected] = useState<number>(1);
  const [stageSelected, setStageSelected] = useState<number>(0); // 0 = aleatorio, 1.. = ARENAS[i - 1]
  // Torre: en un ref para que el bucle y el teclado siempre vean el piso actual; el contador solo redibuja
  const towerRef = useRef<TowerRun | null>(null);
  const [, setTowerVersion] = useState<number>(0);
  const updateTower = (run: TowerRun | null) => {
    towerRef.current = run;
    setTowerVersion(v => v + 1);
  };
  const arenaRef = useRef<ArenaDef>(ARENAS[0]);

  // Ganador
  const [winner, setWinner] = useState<DeityData | null>(null);

  // Referencias para el ciclo a 60 FPS
  const p1Ref = useRef<Fighter | null>(null);
  const p2Ref = useRef<Fighter | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const matchTimerRef = useRef<number>(99);
  const matchFlowRef = useRef<MatchFlow | null>(null);
  const roundClockRef = useRef(0);
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
    DEITIES.forEach(d => {
      loadSpriteSheet(getSpriteSheetConfig(d).src);
      const extra = getExtraSheetConfig(d);
      if (extra) loadSpriteSheet(extra.src);
    });
    [...ARENAS, ORIGEN_ARENA].forEach(a => loadSpriteSheet(a.src));
    loadSpriteSheet(getSpriteSheetConfig(ORIGEN).src);
  }, []);

  useEffect(() => {
    if (gameState === 'MAIN_MENU' || gameState === 'DIFFICULTY_MENU' || gameState === 'CHAR_SELECT' || gameState === 'STAGE_SELECT' || gameState === 'TOWER_MAP' || gameState === 'TOWER_END') {
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

  // Opciones del menú principal. Con controles táctiles solo hay un jugador: se ocultan los modos de 2
  const menuItems: { label: string; mode?: GameMode; screen?: GameState }[] = [
    { label: 'Jugar Modo Versus Local (P1 vs P2)', mode: 'PVP' as GameMode },
    { label: `Jugar contra la IA (${difficulty})`, mode: 'PVE' as GameMode },
    { label: 'Modo Arcade: Camino de los Dioses', mode: 'ARCADE' as GameMode },
    { label: 'Arcade Cooperativo (2 Jugadores)', mode: 'ARCADE_COOP' as GameMode },
    { label: 'Torre de los Dioses', mode: 'TOWER' as GameMode },
    { label: `Opciones de Dificultad: ${difficulty}`, screen: 'DIFFICULTY_MENU' as GameState },
    { label: 'Configurar Controles', screen: 'CONTROLS_MENU' as GameState }
  ].filter(item => !(showTouchControls && (item.mode === 'PVP' || item.mode === 'ARCADE_COOP')));
  const menuIndex = Math.min(mainMenuSelected, menuItems.length - 1);
  const chooseMenuItem = (item: (typeof menuItems)[number]) => {
    sounds.playSelect();
    if (item.mode) openCharSelect(item.mode);
    else if (item.screen) setGameState(item.screen);
  };

  // Mandos: se traducen a las mismas teclas (1.er mando = P1, 2.º = P2)
  useEffect(() => startGamepadBridge(), []);
  // Teclas reasignadas en el menú de controles → teclas que el juego ya entiende
  useEffect(() => startKeyRemapper(), []);

  // Teclado Dual Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      sounds.init();

      // Enter y espacio activan normalmente los controles de la barra superior.
      if ((gameState === 'MAIN_MENU' || gameState === 'DIFFICULTY_MENU' || gameState === 'STAGE_SELECT') && (e.key === 'Enter' || e.code === 'Space') &&
        e.target instanceof HTMLElement && e.target.closest('header button, .options-back')) return;

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
            const next = prev > 0 ? Math.min(prev, menuItems.length) - 1 : menuItems.length - 1;
            sounds.playNav();
            return next;
          });
        } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
          setMainMenuSelected(prev => {
            const next = prev < menuItems.length - 1 ? prev + 1 : 0;
            sounds.playNav();
            return next;
          });
        } else if (e.key === 'j' || e.key === 'J' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          chooseMenuItem(menuItems[menuIndex]);
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
          e.preventDefault();
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
            setP1DeityIndex(i => moveRoster(i, 'up', DEITIES.length));
            sounds.playNav();
          } else if (e.key === 's' || e.key === 'S') {
            setP1DeityIndex(i => moveRoster(i, 'down', DEITIES.length));
            sounds.playNav();
          } else if (e.key === 'j' || e.key === 'J') {
            sounds.playSelect();
            setP1Ready(true);
            if (gameMode === 'PVE' || gameMode === 'ARCADE' || gameMode === 'TOWER') {
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
            setP2DeityIndex(i => moveRoster(i, 'up', DEITIES.length));
            sounds.playNav();
          } else if (e.key === 'ArrowDown') {
            setP2DeityIndex(i => moveRoster(i, 'down', DEITIES.length));
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
          e.preventDefault();
          chooseStage(stageSelected);
        } else if (e.key === 'Escape') {
          sounds.playNav();
          openCharSelect(gameMode);
        }
      }

      // Torre: J pelea el piso actual
      else if (gameState === 'TOWER_MAP') {
        if (['j', 'J', 'Enter', ' '].includes(e.key)) {
          startTowerFight();
        } else if (e.key === 'Escape') {
          sounds.playNav();
          setGameState('MAIN_MENU');
        }
      }

      else if (gameState === 'TOWER_END') {
        if (['j', 'J', 'Enter', ' ', 'Escape'].includes(e.key)) {
          sounds.playNav();
          setGameState('MAIN_MENU');
        }
      }

      // Game Over
      else if (gameState === 'GAME_OVER' && !winner) {
        if (['j', 'J', 'Enter', ' '].includes(e.key)) gameMode === 'TOWER' ? startTowerFight() : startFight();
        else if (e.key === 'Escape') setGameState('MAIN_MENU');
      }
      else if (gameState === 'GAME_OVER' && gameMode === 'TOWER') {
        if (['j', 'J', 'Enter', ' '].includes(e.key)) {
          advanceTower();
        } else if (e.key === 'Escape' || e.key === 'k' || e.key === 'K') {
          setGameState('MAIN_MENU');
        }
      }
      else if (gameState === 'GAME_OVER') {
        if (e.key === 'Enter' || e.key === 'j' || e.key === 'J' || e.key === ' ') {
          startFight();
        } else if (e.key === 'Escape' || e.key === 'k' || e.key === 'K') {
          setGameState('MAIN_MENU');
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (gameState === 'FIGHT' && matchFlowRef.current?.phase === 'fight') {
        const fighter = e.code === 'KeyK' ? p1Ref.current : e.code === 'KeyI' && gameMode === 'PVP' ? p2Ref.current : null;
        if (fighter) fighter.releaseHeavyInput();
      }
      keysPressedRef.current[e.key.toLowerCase()] = false;
      keysPressedRef.current[e.code] = false;
    };

    const clearKeys = () => { keysPressedRef.current = {}; };
    window.addEventListener('blur', clearKeys);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('blur', clearKeys);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState, gameMode, mainMenuSelected, diffMenuSelected, stageSelected, p1Ready, p2Ready, winner, showTouchControls, difficulty]);

  useEffect(() => {
    if (gameState === 'CHAR_SELECT' && p1Ready && p2Ready) {
      const timeout = setTimeout(() => {
        if (gameMode === 'ARCADE' || gameMode === 'ARCADE_COOP') {
          startFight();
          return;
        }
        if (gameMode === 'TOWER') {
          updateTower(buildTower(DEITIES[p1DeityIndex], ORIGEN));
          setGameState('TOWER_MAP');
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
    beginFight(new CanvasFighter(1, d1, false, 280, 1), new CanvasFighter(2, d2, gameMode === 'PVE', 1000, -1));
  };

  // Pelea del piso actual de la torre: arena del reino del rival (Origen en el Telar del Cosmos)
  const startTowerFight = () => {
    const run = towerRef.current;
    if (!run) return;
    sounds.init();
    const rival = run.rivals[run.floor];
    const isOrigen = rival.id === ORIGEN.id;
    arenaRef.current = isOrigen ? ORIGEN_ARENA : ARENAS.find(a => a.pantheon === rival.pantheon) ?? ARENAS[0];
    const p2 = isOrigen ? new OrigenFighter(rival, 1000, -1) : new CanvasFighter(2, rival, true, 1000, -1);
    p2.aiSkill = isOrigen ? 1 : towerSkill(run.floor);
    beginFight(new CanvasFighter(1, run.hero, false, 280, 1), p2);
  };

  // Tras el K.O.: sube de piso, gasta un continue o termina la torre
  const advanceTower = () => {
    const run = towerRef.current;
    if (!run) return;
    sounds.playSelect();
    if (winner?.id === run.hero.id) {
      if (run.floor + 1 >= run.rivals.length) {
        setGameState('TOWER_END');
        sounds.playVictory();
        return;
      }
      updateTower({ ...run, floor: run.floor + 1 });
      setGameState('TOWER_MAP');
    } else if (run.continues > 0) {
      updateTower({ ...run, continues: run.continues - 1 });
      setGameState('TOWER_MAP');
    } else {
      updateTower(null);
      setGameState('MAIN_MENU');
    }
  };

  const beginFight = (p1: Fighter, p2: Fighter) => {
    if (gameMode !== 'TOWER') {
      for (const f of [p1, p2]) f.hp = f.maxHp = f.displayHp = VERSUS_HEALTH;
    }
    p1Ref.current = p1;
    p2Ref.current = p2;
    matchFlowRef.current = new MatchFlow(gameMode === 'TOWER' ? 1 : 2);
    roundClockRef.current = 0;
    keysPressedRef.current = {};

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

    const finishRound = (result: RoundWinner, reason: 'ko' | 'time' = 'ko') => {
      const flow = matchFlowRef.current;
      const p1 = p1Ref.current, p2 = p2Ref.current;
      if (!flow || !p1 || !p2 || !flow.finish(result, reason)) return;
      for (const f of [p1, p2]) {
        f.state = f.playerNumber === result ? 'VICTORY' : 'DEFEAT';
        f.isBlocking = false; f.animTimer = 0;
      }
      superCinematicRef.current = null;
      hitstopFramesRef.current = 0;
      cameraShakeRef.current = reason === 'ko' ? 24 : 0;
      keysPressedRef.current = {};
      sounds.playKO();
    };

    // Un paso de simulación = 1/60 s, independiente de la frecuencia del monitor
    const stepSimulation = () => {
      frameCountRef.current++;

      if (cameraShakeRef.current > 0) {
        cameraShakeRef.current *= 0.88;
        if (cameraShakeRef.current < 0.5) cameraShakeRef.current = 0;
      }

      const flow = matchFlowRef.current;
      if (gameState === 'FIGHT' && flow && flow.phase !== 'fight' && p1Ref.current && p2Ref.current) {
        if (fightLoading()) return;
        const p1 = p1Ref.current, p2 = p2Ref.current;
        if (flow.phase === 'ko' && (flow.elapsed > 45 || flow.elapsed % 3 === 0)) {
          p1.advanceFinish(); p2.advanceFinish(); updateParticles();
        }
        const event = flow.step();
        if (event === 'fight') {
          for (const key of ['j', 'k', 'l', 'u', 'i', 'o', 'KeyJ', 'KeyK', 'KeyL', 'KeyU', 'KeyI', 'KeyO']) keysPressedRef.current[key] = false;
          sounds.playHeavySwing();
        } else if (event === 'nextRound') {
          const next1 = new CanvasFighter(1, p1.deity, false, 280, 1);
          const next2 = new CanvasFighter(2, p2.deity, p2.isAI, 1000, -1);
          next2.aiSkill = p2.aiSkill;
          for (const f of [next1, next2]) f.hp = f.maxHp = f.displayHp = VERSUS_HEALTH;
          p1Ref.current = next1; p2Ref.current = next2;
          particlesRef.current = []; roundClockRef.current = 0;
          matchTimerRef.current = 99; keysPressedRef.current = {};
        } else if (event === 'complete') {
          const victor = flow.roundWinner === 1 ? p1 : p2;
          setWinner(victor.deity);
          if (!victor.isAI) awardMastery(victor.deity.id, { wins: 1 });
          sounds.playVictory(); setGameState('GAME_OVER'); matchOver = true;
        }
        return;
      }

      if (superCinematicRef.current && superCinematicRef.current.timer > 0) {
        superCinematicRef.current.timer--;
        return;
      }

      if (hitstopFramesRef.current > 0) {
        hitstopFramesRef.current--;
        return;
      }

      if (gameState === 'FIGHT' && p1Ref.current && p2Ref.current && !fightLoading()) {
        const p1 = p1Ref.current;
        const p2 = p2Ref.current;
        const keys = keysPressedRef.current;

        // El reloj avanza solo mientras se puede pelear.
        roundClockRef.current++;
        if (roundClockRef.current % 60 === 0 && matchTimerRef.current > 0) {
          matchTimerRef.current--;
          if (matchTimerRef.current === 0) {
            const ratio1 = p1.hp / p1.maxHp, ratio2 = p2.hp / p2.maxHp;
            finishRound(Math.abs(ratio1 - ratio2) < 0.00001 ? null : ratio1 > ratio2 ? 1 : 2, 'time');
            return;
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
          } else {
            p1.releaseJump();
          }

          p1.holdHeavy(!!(keys['k'] || keys['KeyK']));
          if (keys['j'] || keys['KeyJ']) {
            p1.executeLightAttack();
            keys['j'] = false;
            keys['KeyJ'] = false;

          } else if (keys['l'] || keys['KeyL']) {
            if (p1.executeSpecial(p2)) {
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
          } else {
            p2.releaseJump();
          }

          p2.holdHeavy(!!(keys['i'] || keys['KeyI']));
          if (keys['u'] || keys['KeyU']) {
            p2.executeLightAttack();
            keys['u'] = false;
            keys['KeyU'] = false;

          } else if (keys['o'] || keys['KeyO']) {
            if (p2.executeSpecial(p1)) {
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

        for (const f of [p1, p2]) {
          if (f.tryRevive()) {
            popupText(f.x, f.y - 170, '¡RENACE!', '#4ade80');
            sounds.playSuperReady();
          }
        }

        if (p1.hp <= 0 || p2.hp <= 0) {
          finishRound(p1.hp <= 0 && p2.hp <= 0 ? null : p1.hp > 0 ? 1 : 2);
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

  const popupText = (x: number, y: number, text: string, color: string) => {
    particlesRef.current.push({ x, y, vx: 0, vy: -1.2, radius: 0, color, alpha: 1, decay: 0.025, type: 'text', text });
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
        dmgMultiplier = attacker.aiSkill !== null
          ? 0.7 + attacker.aiSkill * 0.6
          : difficulty === 'FACIL' ? 0.7 : difficulty === 'DIFICIL' ? 1.3 : 1.0;
      }

      const continuingCombo = defender.state === 'HITSTUN' && attacker.comboCount > 0;
      let baseDamage = 8;
      let knockX = 6;
      let knockY = -3;
      let hitstunTime = 17;

      if (attacker.state === 'ATTACK_HEAVY') {
        baseDamage = profileFor(attacker.deity.id).heavyDamage * (attacker.chargedHeavy ? 1.25 : 1);
        knockX = 14;
        knockY = -6;
        hitstunTime = 26;
      } else if (attacker.state === 'SPECIAL') {
        baseDamage = 38;
        knockX = 18;
        knockY = -8;
        hitstunTime = 36;
      }

      const heavy = attacker.state === 'ATTACK_HEAVY';
      let damage = baseDamage * dmgMultiplier * attacker.damageMul * defender.defMul * defender.damageTakenMul();
      knockX *= STYLE_KNOCKBACK_TAKEN[defender.deity.style];
      if (heavy && attacker.deity.id === 'poseidon') knockX *= PASSIVE.poseidonPush;
      if (heavy && attacker.deity.id === 'zeus') {
        damage *= 1 + PASSIVE.zeusBonus;
        popupText(defender.x, defender.y - 190, '¡JUICIO CELESTIAL!', '#38bdf8');
        for (let k = 0; k < 20; k++) {
          particlesRef.current.push({ x: defender.x + (Math.random() - 0.5) * 30, y: Math.random() * defender.y, vx: (Math.random() - 0.5) * 4, vy: 10 + Math.random() * 8, radius: 3 + Math.random() * 3, color: Math.random() < 0.6 ? '#38bdf8' : '#ffffff', alpha: 1, decay: 0.04, type: 'lightning' });
        }
      }
      // Susanoo atraviesa el bloqueo; el resto de los estilos de Poder lo rompe
      const unblockable = heavy && attacker.deity.id === 'susanoo';
      const guardBreak = heavy && (attacker.chargedHeavy || attacker.deity.style === 'Poder') && !unblockable;

      // La defensa precisa es voluntaria, con una ventana corta y cooldown.
      if (defender.shielded) { sounds.playBlock(); return; }
      if (defender.tryPerfectGuard(attacker, damage)) {
        sounds.playBlock();
        hitstopFramesRef.current = 5;
        particlesRef.current.push({ x: defender.x, y: defender.y - 95, vx: 0, vy: 0, radius: 52, color: '#b7f6ff', alpha: 1, decay: 0.06, type: 'ring' });
        return;
      }
      damage *= Math.max(0.55, 1 - (continuingCombo ? attacker.comboCount : 0) * 0.12);
      if (attacker.riposteTicks > 0) { damage *= 1.2; attacker.riposteTicks = 0; }
      if ((defender.isBlocking && !unblockable) || defender.shielded) {
        const blockedDamage = defender.shielded
          ? 0
          : guardBreak
          ? Math.round(damage * 0.4)
          : defender.deity.style === 'Guardián'
            ? 0
            : Math.max(1, Math.floor(damage * 0.15));
        defender.hp = Math.max(0, defender.hp - blockedDamage);
        sounds.playBlock();

        defender.superMeter = Math.min(100, defender.superMeter + (defender.deity.style === 'Guardián' ? 12 : 7) * defender.meterMul);
        attacker.superMeter = Math.min(100, attacker.superMeter + 4 * attacker.meterMul);

        defender.guardIntegrity = Math.max(0, defender.guardIntegrity - (heavy ? 36 : 18));
        defender.guardStun = heavy ? 14 : 8;
        if (guardBreak || defender.guardIntegrity <= 0) {
          defender.guardIntegrity = 55;
          defender.isBlocking = false;
          defender.enterHitstun(20, false);
          popupText(defender.x, defender.y - 175, '¡GUARDIA ROTA!', '#f97316');
        }
        // Mictlantecuhtli regresa parte del golpe bloqueado
        if (defender.deity.id === 'mictlantecuhtli' && attacker.hp > 0) {
          attacker.hp = Math.max(0, attacker.hp - Math.max(1, Math.round(damage * 0.12)));
          attacker.hitFlashTimer = 3;
          popupText(attacker.x, attacker.y - 160, '¡REFLEJO!', '#a78bfa');
        }

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
        const finalDamage = Math.round(damage);
        defender.hp = Math.max(0, defender.hp - finalDamage);
        defender.isBlocking = false;
        defender.hitFlashTimer = 3; // Destello blanco en el sprite

        // Raijin no se inmuta mientras da su golpe fuerte
        if (defender.deity.id === 'raijin' && defender.state === 'ATTACK_HEAVY' && defender.hp > 0) {
          popupText(defender.x, defender.y - 175, '¡ARMADURA!', '#60a5fa');
        } else {
          defender.vx = attacker.facing * knockX;
          defender.vy = knockY;
          defender.enterHitstun(hitstunTime, heavy);
        }

        if (attacker.deity.id === 'hades') attacker.hp = Math.min(attacker.maxHp, attacker.hp + Math.round(finalDamage * PASSIVE.lifesteal));
        if (attacker.deity.id === 'ra') defender.burnTimer = PASSIVE.burnTicks;

        attacker.superMeter = Math.min(100, attacker.superMeter + (attacker.state === 'ATTACK_HEAVY' ? 18 : 10) * attacker.meterMul);
        defender.superMeter = Math.min(100, defender.superMeter + 14 * defender.meterMul);

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

        attacker.attackConnected = true;
        attacker.comboCount = continuingCombo ? attacker.comboCount + 1 : 1;
        attacker.comboTimer = hitstunTime + 1;

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

    if (fightLoading()) {
      ctx.restore();
      drawLoading(ctx, w, h);
      return;
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

  // La pelea espera a que bajen la arena y las hojas de los dos luchadores (el reloj no corre mientras)
  const fightLoading = () =>
    isLoading([loadSpriteSheet(arenaRef.current.src)]) || !!(p1Ref.current as CanvasFighter | null)?.loading || !!(p2Ref.current as CanvasFighter | null)?.loading;

  const renderFightOverlays = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const flash = Math.max(p1Ref.current?.screenFlash ?? 0, p2Ref.current?.screenFlash ?? 0);
    if (flash > 0) {
      ctx.fillStyle = `rgba(255, 251, 220, ${flash / 28})`;
      ctx.fillRect(0, 0, w, h);
    }
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
    [p1, p2].forEach((f, i) => {
      const gx = i === 0 ? 50 : w - 390;
      ctx.fillStyle = '#263341'; ctx.fillRect(gx, 115, 340, 4);
      ctx.fillStyle = f.guardAge <= GUARD_WINDOW ? '#b7f6ff' : f.guardIntegrity < 30 ? '#fb923c' : '#73899a';
      ctx.fillRect(gx, 115, 340 * f.guardIntegrity / 100, 4);
      if (f.chargeTicks > 0) {
        ctx.fillStyle = f.chargeTicks >= 24 ? '#fbbf24' : '#a0b2c2';
        ctx.fillRect(gx, 122, 340 * Math.min(1, f.chargeTicks / 24), 3);
      }
    });
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
    const p2Label = !p2.isAI
      ? `${p2.deity.name.toUpperCase()} (P2)`
      : gameMode === 'TOWER'
        ? p2.deity.name.toUpperCase()
        : `${p2.deity.name.toUpperCase()} (IA · ${difficulty})`;
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
    const run = towerRef.current;
    if (gameMode === 'TOWER' && run) {
      ctx.save();
      ctx.font = 'bold 13px "Cinzel", serif';
      ctx.fillStyle = '#fbbf24';
      ctx.textAlign = 'center';
      ctx.fillText(run.floor + 1 === run.rivals.length ? 'CIMA DE LA TORRE' : `PISO ${run.floor + 1} DE ${run.rivals.length}`, w / 2, timerY + timerBoxH + 18);
      ctx.restore();
    }

    const flow = matchFlowRef.current;
    if (flow) drawMatchFlow(ctx, flow, [p1.deity.name, p2.deity.name], w);
  };

  return (
    <div
      onClick={() => sounds.init()}
      className="relative w-screen h-[100dvh] bg-[#04060a] text-slate-100 flex flex-col items-center justify-center overflow-hidden select-none font-sans"
    >
      {/* BARRA SUPERIOR MINIMALISTA */}
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between gap-2 px-3 py-2 sm:px-6 sm:py-3 short:py-1.5 border-b border-white/10 bg-black/60 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Swords className="w-5 h-5 text-amber-400" />
          <span className="font-cinzel text-sm sm:text-lg font-bold tracking-wider text-amber-400 uppercase whitespace-nowrap">
            Mythic Clash 2D
          </span>
          <span className="text-xs text-slate-400 hidden md:inline short:hidden">
            Torneo de Dioses
          </span>
        </div>

        <div className="flex items-center gap-2">
          {gameState !== 'MAIN_MENU' && <div className="hidden sm:flex short:hidden items-center gap-1.5 px-2.5 py-1 text-xs text-slate-400 bg-white/5 rounded border border-white/10">
            <Music className="w-3.5 h-3.5 text-amber-400" />
            <span>{gameState === 'FIGHT' ? 'BGM: Furia Divina' : 'BGM: Ecos del Olimpo'}</span>
          </div>}

          {gameState !== 'MAIN_MENU' && <button
            onClick={() => setShowHitboxes(prev => !prev)}
            className={`hidden sm:flex short:hidden items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
              showHitboxes
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
            }`}
            title="Alternar cajas de colisión Hurtbox / Hitbox (Tecla B)"
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Hitboxes (B)</span>
          </button>}

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
            <span className="hidden sm:inline short:hidden">Controles Touch</span>
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
              <span className="hidden sm:inline short:hidden">Menú</span>
            </button>
          )}
        </div>
      </header>

      {/* ÁREA DEL CANVAS DE JUEGO */}
      <div className="relative w-full h-full flex items-center justify-center pt-12 sm:pt-14">
        <canvas
          ref={canvasRef}
          className="w-full h-full max-w-[1400px] max-h-[787px] object-contain portrait:object-top shadow-2xl bg-black"
        />

        {gameState === 'MAIN_MENU' && <MainMenu
          items={menuItems} selected={menuIndex} difficulty={difficulty} touch={showTouchControls}
          highlight={index => { if (index !== menuIndex) { setMainMenuSelected(index); sounds.playNav(); } }}
          choose={chooseMenuItem}
        />}

        {gameState === 'CONTROLS_MENU' && <ControlsMenu onBack={() => setGameState('MAIN_MENU')} />}

        {/* --- ESCENA 2: MENÚ DE DIFICULTAD --- */}
        {gameState === 'DIFFICULTY_MENU' && <DifficultyMenu
          current={difficulty} selected={diffMenuSelected}
          highlight={index => { if (index !== diffMenuSelected) { setDiffMenuSelected(index); sounds.playNav(); } }}
          choose={value => { setDifficulty(value); sounds.playSelect(); setGameState('MAIN_MENU'); }}
          back={() => { sounds.playNav(); setGameState('MAIN_MENU'); }}
        />}

        {gameState === 'CHAR_SELECT' && <CharacterSelect
          mode={gameMode} difficulty={difficulty} p1={p1DeityIndex} p2={p2DeityIndex}
          ready1={p1Ready} ready2={p2Ready}
          select={(index, player) => {
            if (player === 1) { setP1DeityIndex(index); setP1Ready(false); }
            else { setP2DeityIndex(index); setP2Ready(false); }
          }}
          back={() => { sounds.playNav(); setGameState('MAIN_MENU'); }}
          confirm={() => { sounds.playSelect(); setP1Ready(true); setP2Ready(true); }}
        />}

        {/* --- ESCENA 4B: MODO ARCADE --- */}
        {gameState === 'STAGE_SELECT' && <ArenaSelect
          selected={stageSelected} fighters={[DEITIES[p1DeityIndex].name, DEITIES[p2DeityIndex].name]}
          highlight={index => { if (index !== stageSelected) { setStageSelected(index); sounds.playNav(); } }}
          choose={chooseStage} back={() => { sounds.playNav(); openCharSelect(gameMode); }}
        />}

        {gameState === 'ARCADE' && (
          <ArcadeMode
            touch={showTouchControls}
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
        {gameState === 'TOWER_MAP' && towerRef.current && (() => {
          const run = towerRef.current;
          const rival = run.rivals[run.floor];
          return (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center-safe overflow-y-auto pt-16 bg-black/85 backdrop-blur-md px-6 pb-3">
              <span className="text-violet-300 text-xs font-semibold tracking-widest uppercase">Torre de los Dioses</span>
              <h2 className="font-cinzel text-2xl sm:text-3xl short:text-xl font-extrabold text-amber-300 mb-3 short:mb-2">
                {rival.id === ORIGEN.id ? 'La cima: el creador te espera' : `Piso ${run.floor + 1}: ${run.hero.name} vs ${rival.name}`}
              </h2>
              {/* La torre de abajo hacia arriba: Origen en la cima */}
              <div className="flex flex-col-reverse items-center gap-1 sm:gap-1.5 short:grid short:grid-cols-3 short:gap-1">
                {run.rivals.map((d, i) => {
                  const beaten = i < run.floor;
                  const current = i === run.floor;
                  return (
                    <div
                      key={d.id}
                      className={`flex items-center gap-3 rounded-lg px-3 py-0.5 sm:py-1 border transition-all ${
                        current
                          ? 'border-amber-400 bg-amber-500/15 shadow-lg shadow-amber-500/20'
                          : beaten
                            ? 'border-slate-800 bg-slate-900/40 opacity-40'
                            : d.id === ORIGEN.id
                              ? 'border-violet-400/50 bg-violet-950/50'
                              : 'border-slate-700/60 bg-slate-900/70'
                      }`}
                    >
                      <span className="text-[10px] font-bold text-slate-500 w-10 text-right">{d.id === ORIGEN.id ? 'CIMA' : `PISO ${i + 1}`}</span>
                      <Medallion deityId={d.id} size={d.id === ORIGEN.id ? 44 : 34} />
                      <span className={`font-cinzel text-sm font-bold w-40 ${beaten ? 'line-through text-slate-500' : 'text-slate-100'}`}>{d.name}</span>
                      {current ? <Medallion deityId={run.hero.id} size={38} /> : <span className="w-[38px]" />}
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 short:mt-2 text-xs text-slate-400">
                Continues: <b className="text-amber-300">{run.continues}</b>
                <span className="hidden lg:inline"> · J para pelear · ESC para salir</span>
              </p>
              <div className="flex gap-3 mt-3 short:mt-2 w-full max-w-md">
                <button
                  onClick={() => {
                    sounds.playNav();
                    setGameState('MAIN_MENU');
                  }}
                  className="flex-1 py-3 short:py-2 rounded-lg font-semibold bg-slate-800 text-slate-200 border border-slate-600"
                >
                  Salir
                </button>
                <button
                  onClick={startTowerFight}
                  className="flex-[2] py-3 short:py-2 rounded-lg font-bold bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-lg shadow-amber-900/40"
                >
                  ¡Pelear!
                </button>
              </div>
            </div>
          );
        })()}

        {gameState === 'TOWER_END' && towerRef.current && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center-safe overflow-y-auto pt-16 bg-black/90 backdrop-blur-md p-6 text-center">
            <span className="text-violet-300 text-xs font-semibold tracking-widest uppercase mb-2">Torre de los Dioses · Final</span>
            <Medallion deityId={towerRef.current.hero.id} size={180} />
            <h2 className="font-cinzel text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-100 via-amber-300 to-amber-500 mt-3 mb-4">
              {towerRef.current.hero.name.toUpperCase()} CONQUISTA LA TORRE
            </h2>
            <p className="text-slate-200 text-base max-w-2xl leading-relaxed font-cinzel">
              {TOWER_ENDINGS[towerRef.current.hero.id]}
            </p>
            <button
              onClick={() => {
                sounds.playNav();
                setGameState('MAIN_MENU');
              }}
              className="mt-8 px-8 py-3 rounded-lg font-bold bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950"
            >
              Volver al menú
            </button>
          </div>
        )}

        {gameState === 'GAME_OVER' && !winner && <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/85 gap-4 text-center p-5">
          <span className="text-xs tracking-widest text-slate-400">DOBLE K.O.</span>
          <h2 className="text-4xl font-bold">Empate</h2>
          <p className="text-sm text-slate-400">Ambos dioses cayeron. Vuelve a disputar este combate.</p>
          <button className="bg-slate-100 text-slate-950 px-6 py-3 font-bold" onClick={() => gameMode === 'TOWER' ? startTowerFight() : startFight()}>Revancha</button>
          <button onClick={() => setGameState('MAIN_MENU')}>Volver al menú</button>
        </div>}

        {gameState === 'GAME_OVER' && winner && gameMode === 'TOWER' && towerRef.current && (() => {
          const run = towerRef.current;
          const won = winner.id === run.hero.id;
          const top = run.floor + 1 >= run.rivals.length;
          return (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center-safe overflow-y-auto pt-16 bg-black/85 backdrop-blur-md p-6 text-center">
              <span className="text-amber-400 text-sm font-semibold tracking-widest uppercase mb-1">K.O.</span>
              <h2 className="font-cinzel text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-100 via-amber-300 to-amber-500 mb-3">
                {won ? (top ? '¡EL CREADOR HA CAÍDO!' : `¡PISO ${run.floor + 1} SUPERADO!`) : `¡VICTORIA DE ${winner.name.toUpperCase()}!`}
              </h2>
              <p className="text-slate-300 text-sm mb-6">
                {won
                  ? top ? 'La torre es tuya.' : `Siguiente: ${run.rivals[run.floor + 1].name}`
                  : run.continues > 0
                    ? `Te quedan ${run.continues} continue${run.continues === 1 ? '' : 's'}`
                    : `Sin continues. Llegaste al piso ${run.floor + 1} de ${run.rivals.length}.`}
              </p>
              <div className="flex gap-4 w-full max-w-md">
                <button
                  onClick={advanceTower}
                  className="flex-1 py-3 px-6 rounded-lg font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-900/50"
                >
                  {won ? (top ? 'Ver tu final (ENTER)' : 'Subir de piso (ENTER)') : run.continues > 0 ? 'Continuar (ENTER)' : 'Volver al menú (ENTER)'}
                </button>
                <button
                  onClick={() => {
                    sounds.playNav();
                    setGameState('MAIN_MENU');
                  }}
                  className="flex-1 py-3 px-6 rounded-lg font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600"
                >
                  Salir de la torre (ESC)
                </button>
              </div>
            </div>
          );
        })()}

        {gameState === 'GAME_OVER' && winner && gameMode !== 'TOWER' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center-safe overflow-y-auto pt-16 bg-black/85 backdrop-blur-md p-6 text-center">
            <span className="text-amber-400 text-sm font-semibold tracking-widest uppercase mb-1">
              K.O. - COMBATE FINALIZADO
            </span>
            <h2 className="font-cinzel text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-100 via-amber-300 to-amber-500 mb-2">
              ¡VICTORIA DE {winner.name.toUpperCase()}!
            </h2>
            <p className="text-slate-300 text-sm mb-6 font-cinzel">
              {winner.title} · {winner.pantheon}
            </p>
            <p className="text-amber-200 text-lg font-bold mb-5">Marcador final: {matchFlowRef.current?.wins.join(' — ')}</p>

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

        {/* CONTROLES TÁCTILES: joystick y botones en versus, torre y arcade */}
        {showTouchControls && gameState === 'FIGHT' && <TouchControls mode="versus" />}
      </div>
    </div>
  );
}
