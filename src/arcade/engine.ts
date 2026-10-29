import { DEITIES } from '../game/deities';
import type { DeityData } from '../game/deities';
import { sounds } from '../game/sound';
import { renderParticles, spawnBloodBurst, updateParticles } from '../game/core';
import type { Difficulty, Particle } from '../game/core';
import { EXTRA_ROWS, GRID_4X4_ANIMATIONS, drawLoading, drawSpriteFrame, getExtraSheetConfig, getSpriteSheetConfig, isLoading, loadSpriteSheet } from '../game/sprites';
import type { SpriteSheetConfig, SpriteSheetEntry } from '../game/sprites';
import { drawDeityPortraitIcon } from '../game/portraits';
import { PASSIVE, STYLE_ATTACK_SPEED, STYLE_KNOCKBACK_TAKEN, STYLE_REACH, statDamageMul, statDefenseMul } from '../game/styles';
import { BEASTS, BOSS_CAM_X, BOSS_SPECIALS, FINAL_LEVEL, LEVELS, MONSTER_SPRITES, MONSTER_STATS, ORIGEN, THIEF_SKIN, buildWaves, origenSpecials } from './levels';
import type { BeastAttack, BeastDef, BossSpecial, LevelDef, MonsterKind, MonsterSkin, MonsterStats, Wave, WaveSpawn } from './levels';
import { DEPTH, VIEW_H, VIEW_W, drawAmbient, drawBackground, drawForeground, drawItem, drawMonsterOutlined, drawOrb, drawTelegraph, screenY } from './draw';
import type { MonsterPose } from './draw';

// ==========================================================================
// MOTOR DEL MODO ARCADE (BEAT 'EM UP 2.5D ESTILO GOLDEN AXE)
// Mundo: x horizontal, z profundidad (0 = fondo, DEPTH = frente), y altura del salto
// ==========================================================================

const GRAVITY = 0.75;
const Z_REACH = 28; // Diferencia de profundidad máxima para que un golpe conecte
const THIEF_MAX_DROPS = 3; // Objetos que suelta el duende ladrón
const MAX_MAGIC = 6;       // Vasijas de magia que caben en el HUD
const RESPAWN_MAGIC = 2;   // Vasijas que regala cada vida perdida
const REINFORCEMENT_HEAL = 20; // Vida por cada refuerzo del jefe derrotado (además de 1 vasija)
const COOP_HP_MUL = 1.3;       // Monstruos más resistentes cuando juegan dos
const COOP_BOSS_HP_MUL = 1.5;
const PLAYER_COLORS = ['#fbbf24', '#38bdf8']; // Distintivo de cada jugador (1P dorado, 2P celeste)
const LAND_SQUASH_TICKS = 8;
const TRAIL_LENGTH = 6; // Poses guardadas para las imágenes fantasma (se dibuja una de cada dos)

interface TrailPoint {
  x: number;
  y: number;
  z: number;
  facing: 1 | -1;
  row: number;
  frame: number;
}

export interface ArcadeInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  // Recién pulsadas en este paso
  attack: boolean;
  jump: boolean;
  magic: boolean;
  tapLeft: boolean;
  tapRight: boolean;
}

const EMPTY_INPUT: ArcadeInput = {
  left: false, right: false, up: false, down: false, attack: false, jump: false, magic: false, tapLeft: false, tapRight: false
};

export interface HitInfo {
  damage: number;
  knockdown: boolean;
  heavy: boolean;
  dir: 1 | -1;
  magic?: boolean;
  pierce?: boolean;     // Atraviesa la armadura de los monstruos y el bloqueo de los jefes (Susanoo)
  guardBreak?: boolean; // Golpe fuerte de un dios de Poder: rompe el bloqueo de los jefes
}

interface StrikeSpec {
  front: number; // Alcance hacia donde mira
  back: number;  // Alcance hacia la espalda (giro)
  damage: number;
  knockdown: boolean;
  heavy: boolean;
  antiAir?: boolean; // Alcanza también a héroes en el aire
}

type ActorState =
  | 'idle' | 'walk' | 'run' | 'attack' | 'jump' | 'jumpAttack' | 'dashAttack' | 'spin' | 'magic'
  | 'windup' | 'strike' | 'recover' | 'special' | 'hurt' | 'knockdown' | 'down' | 'getup' | 'dead'
  | 'flee' | 'intro' | 'mountAttack' | 'guard';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const DIFFICULTY_HP: Record<Difficulty, number> = { FACIL: 0.8, NORMAL: 1, DIFICIL: 1.25 };
const DIFFICULTY_DMG: Record<Difficulty, number> = { FACIL: 0.7, NORMAL: 1, DIFICIL: 1.35 };

// --------------------------------------------------------------------------
// ACTOR BASE: física 2.5D, derribos y recepción de golpes
// --------------------------------------------------------------------------
abstract class Actor {
  public x: number;
  public z: number;
  public y: number = 0;
  public vx: number = 0;
  public vz: number = 0;
  public vy: number = 0;
  public facing: 1 | -1 = 1;
  public hp: number;
  public maxHp: number;
  public width: number;
  public height: number;
  public state: ActorState = 'idle';
  public stateTimer: number = 0;
  public invuln: number = 0;
  public flash: number = 0;
  public removed: boolean = false;
  public hitTargets = new Set<Actor>(); // Golpeados por el ataque en curso
  public landTimer: number = 0;          // Ticks de "aplastamiento" tras aterrizar
  public trail: TrailPoint[] = [];       // Últimas poses, para las imágenes fantasma de los ataques rápidos
  public mount: Beast | null = null;     // Bestia sobre la que va montado

  constructor(x: number, z: number, hp: number, width: number, height: number) {
    this.x = x;
    this.z = z;
    this.hp = hp;
    this.maxHp = hp;
    this.width = width;
    this.height = height;
  }

  public setState(state: ActorState) {
    this.state = state;
    this.stateTimer = 0;
    this.hitTargets.clear();
  }

  public get airborne(): boolean {
    return this.y > 0 || this.vy > 0;
  }

  public get isDown(): boolean {
    return this.state === 'knockdown' || this.state === 'down' || this.state === 'getup' || this.state === 'dead';
  }

  public canBeHit(): boolean {
    return !this.removed && this.invuln <= 0 && !this.isDown;
  }

  // Avanza la física; devuelve true en el tick en que aterriza
  protected integrate(): boolean {
    this.x += this.vx;
    this.z = clamp(this.z + this.vz, 0, DEPTH);
    if (this.airborne) {
      this.y += this.vy;
      this.vy -= GRAVITY;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.landTimer = LAND_SQUASH_TICKS;
        return true;
      }
    }
    return false;
  }

  // Estados comunes (aturdido, derribado, levantándose, muerto); devuelve true si el actor está ocupado en ellos
  protected updateDownStates(): boolean {
    switch (this.state) {
      case 'knockdown':
        if (this.integrate()) {
          this.vx *= 0.3;
          this.setState('down');
          sounds.playStep();
        }
        return true;
      case 'down':
        this.vx *= 0.8;
        this.x += this.vx;
        if (this.stateTimer >= 42) this.setState(this.hp <= 0 ? 'dead' : 'getup');
        return true;
      case 'getup':
        if (this.stateTimer >= 18) {
          this.setState('idle');
          this.invuln = 30;
        }
        return true;
      case 'dead':
        if (this.stateTimer >= 50) this.removed = true;
        return true;
      case 'hurt':
        this.vx *= 0.82;
        this.integrate();
        if (this.stateTimer >= 16) this.setState('idle');
        return true;
      default:
        return false;
    }
  }

  protected canBeKnockedDown(_hit: HitInfo): boolean {
    return true;
  }

  protected flinchesFrom(_hit: HitInfo): boolean {
    return true;
  }

  public receiveHit(hit: HitInfo): boolean {
    if (!this.canBeHit()) return false;
    this.hp = Math.max(0, this.hp - hit.damage);
    this.flash = 6;
    // Montado no se inmuta con golpes ligeros; un derribo lo tira de la bestia
    if (this.mount) {
      if (this.hp > 0 && !hit.knockdown) return true;
      dismount(this);
    }
    this.facing = (hit.dir === 1 ? -1 : 1);
    if (this.hp <= 0 || (hit.knockdown && this.canBeKnockedDown(hit))) {
      this.setState('knockdown');
      this.y = 0.01;
      this.vy = hit.heavy ? 9 : 7;
      this.vx = hit.dir * (hit.heavy ? 6 : 4.5);
      this.vz = 0;
    } else if (this.flinchesFrom(hit)) {
      this.setState('hurt');
      this.vx = hit.dir * 2.5;
      this.vz = 0;
    }
    return true;
  }

  public burnTicks: number = 0; // Quemadura de Ra

  protected tickTimers() {
    this.stateTimer++;
    if (this.burnTicks > 0) {
      this.burnTicks--;
      if (this.burnTicks % PASSIVE.burnEvery === 0 && this.hp > 1) {
        this.hp = Math.max(1, this.hp - PASSIVE.burnDamage);
        this.flash = 2;
      }
    }
    if (this.invuln > 0) this.invuln--;
    if (this.flash > 0) this.flash--;
    if (this.landTimer > 0) this.landTimer--;
  }

  // Guarda la pose actual mientras dura un ataque rápido; si no, la estela se va apagando
  protected recordTrail(active: boolean, row: number, frame: number) {
    if (active) {
      this.trail.push({ x: this.x, y: this.y, z: this.z, facing: this.facing, row, frame });
      if (this.trail.length > TRAIL_LENGTH) this.trail.shift();
    } else if (this.trail.length > 0) {
      this.trail.shift();
    }
  }
}

// Fila y cuadro de la hoja de sprites de un dios según su estado (héroe y jefes comparten la lógica)
function godFrame(actor: Actor, cfg: SpriteSheetConfig, clock: number, attackDuration: number): { row: number; frame: number } {
  const a = cfg.animations;
  const cycle = (anim: typeof a.idle, speed: number = 1) => Math.floor((clock * speed) / anim.frameDuration) % anim.frames;
  const progress = (duration: number) => Math.min(a.attack.frames - 1, Math.floor((actor.stateTimer / duration) * a.attack.frames));
  const lying = cfg.lyingFrame ?? a.hit.frames - 1;
  switch (actor.state) {
    case 'walk':
    case 'intro':
      return { row: a.run.row, frame: cycle(a.run, 0.8) };
    case 'run':
    case 'flee':
      return { row: a.run.row, frame: cycle(a.run, 1.5) };
    case 'jump':
      return { row: a.run.row, frame: 1 };
    case 'attack':
    case 'strike':
      return { row: a.attack.row, frame: progress(attackDuration) };
    case 'windup':
    case 'guard':
      return { row: a.attack.row, frame: 0 };
    case 'jumpAttack':
    case 'dashAttack':
    case 'spin':
      return { row: a.attack.row, frame: actor.stateTimer < 3 ? 1 : 2 };
    case 'magic':
    case 'special':
      return { row: a.attack.row, frame: actor.stateTimer < 20 ? 1 : 2 };
    case 'mountAttack':
      return { row: a.attack.row, frame: progress(28) };
    case 'recover':
      return { row: a.attack.row, frame: a.attack.frames - 1 };
    case 'hurt':
      return { row: a.hit.row, frame: 0 };
    case 'knockdown':
      return { row: a.hit.row, frame: actor.vy > 0 ? 1 : lying };
    case 'down':
    case 'dead':
      return { row: a.hit.row, frame: lying };
    case 'getup':
      // Con cuadro propio de levantarse se usa; si no, se pasa del suelo a la pose de reposo
      if (actor.stateTimer < 6) return { row: a.hit.row, frame: lying };
      if (cfg.getupFrame !== undefined) return { row: a.hit.row, frame: cfg.getupFrame };
      return { row: a.idle.row, frame: 0 };
    default:
      return { row: a.idle.row, frame: cycle(a.idle) };
  }
}

// Deformación de la pose de un dios: estirarse al subir, aplastarse al caer, inclinarse al correr o al recibir.
// Da vida a las hojas 4x4 sin cuadros extra.
function godPose(actor: Actor, opts: { dashing?: boolean; finisher?: boolean } = {}): { sx: number; sy: number; rot: number } {
  let sx = 1;
  let sy = 1;
  let rot = 0;
  const t = actor.stateTimer;
  switch (actor.state) {
    case 'run':
      rot = 0.07;
      break;
    case 'hurt':
      rot = -0.12 * Math.max(0, 1 - t / 16);
      break;
    case 'getup':
      // Se incorpora con un pequeño impulso
      if (t >= 6) sy = 0.88 + 0.12 * Math.min(1, (t - 6) / 10);
      break;
    case 'attack':
      if (opts.finisher) {
        rot = 0.1;
        sx = 1.06;
      }
      break;
  }
  if (opts.dashing) {
    rot = 0.15;
    sx = 1.08;
    sy = 0.96;
  }
  // Salto: se estira al subir y al caer, aplastado justo al tocar el suelo
  if (actor.y > 0 && actor.state !== 'knockdown') {
    if (actor.vy > 3) {
      sx *= 0.92;
      sy *= 1.1;
    } else if (actor.vy < -3) {
      sx *= 0.96;
      sy *= 1.05;
    }
  }
  if (actor.landTimer > 0 && actor.state !== 'down' && actor.state !== 'dead') {
    const k = actor.landTimer / LAND_SQUASH_TICKS;
    sx *= 1 + 0.14 * k;
    sy *= 1 - 0.16 * k;
  }
  return { sx, sy, rot };
}

// --------------------------------------------------------------------------
// HÉROE: el dios elegido, con combo, salto, ataque aéreo, embestida, giro y magia
// --------------------------------------------------------------------------
export class Hero extends Actor {
  public index: number; // 0 = jugador 1, 1 = jugador 2
  public deity: DeityData;
  public cfg: SpriteSheetConfig;
  public sheet: SpriteSheetEntry;
  public lives: number = 3;
  public magic: number = 2; // Vasijas de magia (máx. MAX_MAGIC)
  public score: number = 0;
  public gameOver: boolean = false;
  public displayHp: number;
  public walkSpeed: number;
  public defMul: number;
  public comboStep: number = 0;
  public canRevive: boolean = true; // Osiris: una vez por nivel
  // Segunda hoja (salto, súper, remate) si el dios ya la tiene
  private extraCfg: SpriteSheetConfig | null = null;
  private extraSheet: SpriteSheetEntry | null = null;
  // Puntuación: combo de golpes conectados y estadísticas del nivel en curso
  public combo: number = 0;
  public comboTimer: number = 0;
  public maxCombo: number = 0;
  public kills: number = 0;
  public deaths: number = 0;
  private baseDmgMul: number;
  private airJumped: boolean = false; // Quetzalcóatl

  private comboWindow: number = 0;
  private bufferedAttack: boolean = false;
  private runDir: 1 | -1 = 1;
  private lastTapLeft: number = -100;
  private lastTapRight: number = -100;
  private lastAttackPress: number = -100;
  private lastJumpPress: number = -100;
  private animClock: number = 0;

  constructor(deity: DeityData, index: number = 0) {
    super(220, DEPTH * 0.6, 100, 60, 170);
    this.index = index;
    this.deity = deity;
    this.cfg = getSpriteSheetConfig(deity);
    this.sheet = loadSpriteSheet(this.cfg.src);
    this.extraCfg = getExtraSheetConfig(deity);
    this.extraSheet = this.extraCfg ? loadSpriteSheet(this.extraCfg.src) : null;
    this.displayHp = this.hp;
    // Las estadísticas del dios (1-5) definen velocidad, daño y resistencia
    this.walkSpeed = 2.6 + deity.stats.speed * 0.35;
    this.baseDmgMul = statDamageMul(deity.stats.attack);
    this.defMul = statDefenseMul(deity.stats.defense);
  }

  // Huitzilopochtli pega más fuerte con poca vida
  public get dmgMul(): number {
    const fury = this.deity.id === 'huitzilopochtli' && this.hp < this.maxHp * PASSIVE.furyBelow ? PASSIVE.furyMul : 1;
    return this.baseDmgMul * fury;
  }

  private get comboDuration(): number {
    return Math.round((this.comboStep === 3 ? 24 : 17) * STYLE_ATTACK_SPEED[this.deity.style]);
  }

  // Raijin no se inmuta mientras ataca
  private get armored(): boolean {
    return this.deity.id === 'raijin' && ['attack', 'dashAttack', 'jumpAttack'].includes(this.state);
  }

  protected canBeKnockedDown(_hit: HitInfo): boolean {
    return !this.armored;
  }

  protected flinchesFrom(_hit: HitInfo): boolean {
    return !this.armored;
  }

  public receiveHit(hit: HitInfo): boolean {
    if (this.state === 'magic' || this.state === 'spin') return false;
    const landed = super.receiveHit({ ...hit, damage: hit.damage * this.defMul });
    if (landed && this.state === 'knockdown') this.vx *= STYLE_KNOCKBACK_TAKEN[this.deity.style];
    if (landed && this.state === 'hurt') this.invuln = 22;
    return landed;
  }

  private startCombo() {
    this.comboStep = this.comboWindow > 0 && this.comboStep < 3 ? this.comboStep + 1 : 1;
    this.bufferedAttack = false;
    this.setState('attack');
    if (this.comboStep === 3) sounds.playHeavySwing();
    else sounds.playSwing();
  }

  private startSpin() {
    // El giro castiga con un poco de vida, como en los clásicos del género
    this.hp = Math.max(1, this.hp - 4);
    this.y = 0;
    this.vy = 0;
    this.invuln = 22;
    this.setState('spin');
    sounds.playHeavySwing();
  }

  public update(input: ArcadeInput, world: ArcadeGame, tick: number) {
    this.tickTimers();
    this.animClock++;
    const fast = this.state === 'dashAttack' || this.state === 'spin' || this.state === 'jumpAttack' || (this.state === 'attack' && this.comboStep === 3);
    const pose = godFrame(this, this.cfg, this.animClock, this.comboDuration);
    this.recordTrail(fast, pose.row, pose.frame);
    if (this.comboWindow > 0) this.comboWindow--;
    if (this.displayHp > this.hp) this.displayHp = Math.max(this.hp, this.displayHp - 0.6);
    else this.displayHp = this.hp;

    if (input.attack) this.lastAttackPress = tick;
    if (input.jump) this.lastJumpPress = tick;
    let runRequest: 0 | 1 | -1 = 0;
    if (input.tapLeft) {
      if (tick - this.lastTapLeft <= 14) runRequest = -1;
      this.lastTapLeft = tick;
    }
    if (input.tapRight) {
      if (tick - this.lastTapRight <= 14) runRequest = 1;
      this.lastTapRight = tick;
    }

    if (this.deity.id === 'amaterasu' && tick > 0 && tick % 1800 === 0 && this.magic < MAX_MAGIC && this.hp > 0) {
      this.magic++;
      world.floatingText(this.x, screenY(this.z) - 200, '+1 MAGIA', '#fde68a');
    }

    // Al quedarse sin vida y terminar la caída se gasta una vida
    if (this.state === 'down' && this.hp <= 0) {
      if (this.stateTimer >= 40 && this.deity.id === 'osiris' && this.canRevive) {
        this.canRevive = false;
        this.hp = Math.round(this.maxHp * PASSIVE.reviveHp);
        this.displayHp = this.hp;
        this.setState('idle');
        this.invuln = 120;
        world.floatingText(this.x, screenY(this.z) - 200, '¡RENACE!', '#4ade80');
        sounds.playSuperReady();
      } else if (this.stateTimer >= 40) {
        this.lives--;
        this.deaths++;
        if (this.lives > 0) {
          world.respawnHero(this);
        } else {
          this.gameOver = true;
          this.setState('dead');
        }
      }
      return;
    }
    if (this.state === 'dead') return;
    if (this.updateDownStates()) {
      world.clampToView(this);
      return;
    }
    if (this.mount) {
      this.updateMounted(input, world);
      world.clampToView(this);
      return;
    }

    const moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const moveZ = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const spinInput = (input.attack || input.jump) && Math.abs(this.lastAttackPress - this.lastJumpPress) <= 3;

    switch (this.state) {
      case 'idle':
      case 'walk':
      case 'run': {
        if (spinInput) {
          this.startSpin();
        } else if (input.magic && this.magic > 0) {
          if (world.castMagic(this)) this.setState('magic');
        } else if (input.attack) {
          if (this.state === 'run') {
            this.setState('dashAttack');
            sounds.playHeavySwing();
          } else {
            this.startCombo();
          }
        } else if (input.jump) {
          const running = this.state === 'run';
          this.setState('jump');
          this.y = 0.01;
          this.vy = 12.5;
          this.vx = running ? this.runDir * this.walkSpeed * 2 : moveX * this.walkSpeed;
          this.vz = moveZ * this.walkSpeed * 0.5;
          sounds.playJump();
        } else {
          if (runRequest !== 0) {
            this.runDir = runRequest;
            this.setState('run');
          }
          const running = this.state === 'run' && moveX === this.runDir;
          this.vx = running ? this.runDir * this.walkSpeed * 2.1 : moveX * this.walkSpeed;
          this.vz = moveZ * this.walkSpeed * 0.75;
          if (moveX !== 0) this.facing = moveX > 0 ? 1 : -1;
          const next: ActorState = running ? 'run' : moveX !== 0 || moveZ !== 0 ? 'walk' : 'idle';
          if (next !== this.state) this.setState(next);
          if (next !== 'idle' && this.stateTimer % (running ? 12 : 18) === 0) sounds.playStep();
          if (running && Math.random() < 0.4) world.dust(this.x - this.facing * 20, this.z, 1);
          this.integrate();
        }
        break;
      }
      case 'attack': {
        this.vx *= 0.7;
        this.vz = 0;
        this.integrate();
        const finisher = this.comboStep === 3;
        const [from, to] = finisher ? [7, 12] : [5, 9];
        if (this.stateTimer >= from && this.stateTimer <= to) {
          world.heroStrike(this, {
            front: finisher ? 120 : 105,
            back: 10,
            damage: (finisher ? 13 : 7) * this.dmgMul,
            knockdown: finisher,
            heavy: finisher
          });
        }
        if (input.attack && this.stateTimer >= 5) this.bufferedAttack = true;
        if (this.stateTimer >= this.comboDuration) {
          if (this.bufferedAttack && this.comboStep < 3) {
            this.comboWindow = 1;
            this.startCombo();
          } else {
            this.comboWindow = finisher ? 0 : 14;
            this.setState('idle');
          }
        }
        break;
      }
      case 'dashAttack': {
        // Embestida: carga hacia delante derribando a todo lo que encuentra
        this.vx = this.facing * Math.max(2, 9.5 - this.stateTimer * 0.3);
        this.vz = 0;
        this.integrate();
        if (this.stateTimer >= 3 && this.stateTimer <= 20) {
          world.heroStrike(this, { front: 90, back: 10, damage: 14 * this.dmgMul, knockdown: true, heavy: true });
        }
        if (this.stateTimer % 3 === 0) world.dust(this.x - this.facing * 25, this.z, 2);
        if (this.stateTimer >= 26) this.setState('idle');
        break;
      }
      case 'spin': {
        // Giro divino: golpea a ambos lados a la vez
        this.vx *= 0.8;
        this.integrate();
        if (this.stateTimer % 5 === 0) this.facing = this.facing === 1 ? -1 : 1;
        if (this.stateTimer >= 4 && this.stateTimer <= 20) {
          world.heroStrike(this, { front: 115, back: 115, damage: 10 * this.dmgMul, knockdown: true, heavy: true });
        }
        if (this.stateTimer >= 30) this.setState('idle');
        break;
      }
      case 'jump': {
        if (spinInput && this.stateTimer <= 3) {
          this.startSpin();
          break;
        }
        if (input.attack && this.stateTimer > 3) {
          this.setState('jumpAttack');
          sounds.playSwing();
        } else if (input.jump && this.deity.id === 'quetzalcoatl' && !this.airJumped && this.stateTimer > 3) {
          this.airJumped = true;
          this.vy = 11;
          world.dust(this.x, this.z, 3);
          sounds.playJump();
        }
        if (this.integrate()) {
          this.airJumped = false;
          world.dust(this.x, this.z, 4);
          this.setState('idle');
        }
        break;
      }
      case 'jumpAttack': {
        // Tajo aéreo: derriba al caer sobre el enemigo
        if (this.stateTimer >= 3) {
          world.heroStrike(this, { front: 95, back: 20, damage: 12 * this.dmgMul, knockdown: true, heavy: false });
        }
        if (this.integrate()) {
          world.dust(this.x, this.z, 4);
          this.vx = 0;
          this.setState('recover');
        }
        break;
      }
      case 'recover': {
        this.vx *= 0.7;
        if (this.stateTimer >= 8) this.setState('idle');
        break;
      }
      case 'magic':
        this.vx = 0;
        this.vz = 0;
        break;
      default:
        this.setState('idle');
    }

    world.clampToView(this);
  }

  // Montado: más rápido, J ataca con la bestia y K salta de ella; sin magia ni giro
  private updateMounted(input: ArcadeInput, world: ArcadeGame) {
    const beast = this.mount as Beast;
    const strike = beast.strike;
    const moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const moveZ = (input.down ? 1 : 0) - (input.up ? 1 : 0);

    if (this.state === 'mountAttack') {
      const t = this.stateTimer;
      this.vz = 0;
      this.vx = strike.lunge > 0 && t >= strike.from - 2 && t <= strike.to ? this.facing * strike.lunge * Math.max(0.2, 1 - (t - strike.from) / 14) : this.vx * 0.7;
      this.integrate();
      if (t >= strike.from && t <= strike.to) {
        world.heroStrike(this, { ...strike, damage: strike.damage * this.dmgMul });
        world.beastFx(beast);
      }
      if (t >= strike.duration) this.setState('idle');
      return;
    }
    if (input.jump) {
      // Salta de la bestia (se queda quieta esperando a que vuelvas)
      dismount(this, false);
      this.setState('jump');
      this.y = 0.01;
      this.vy = 11;
      this.vx = moveX * this.walkSpeed;
      this.vz = moveZ * this.walkSpeed * 0.5;
      sounds.playJump();
      return;
    }
    if (input.attack) {
      this.setState('mountAttack');
      if (beast.def.attack === 'fire') sounds.playSolarBeam();
      else if (beast.def.attack === 'thunder') sounds.playThunder();
      else sounds.playHeavySwing();
      return;
    }
    const speed = this.walkSpeed * MOUNT_SPEED;
    this.vx = moveX * speed;
    this.vz = moveZ * speed * 0.75;
    if (moveX !== 0) this.facing = moveX > 0 ? 1 : -1;
    const next: ActorState = moveX !== 0 || moveZ !== 0 ? 'walk' : 'idle';
    if (next !== this.state) this.setState(next);
    if (next === 'walk' && this.stateTimer % 14 === 0) sounds.playStep();
    this.integrate();
  }

  // Distintivo 1P / 2P sobre la cabeza (cooperativo)
  private drawTag(ctx: CanvasRenderingContext2D, x: number, feetY: number) {
    const tagY = feetY - this.height - 34;
    ctx.fillStyle = PLAYER_COLORS[this.index];
    ctx.beginPath();
    ctx.moveTo(x - 7, tagY + 14);
    ctx.lineTo(x + 7, tagY + 14);
    ctx.lineTo(x, tagY + 22);
    ctx.fill();
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.index + 1}P`, x, tagY + 10);
  }

  // Montado: la bestia y, encima, el dios de la cintura para arriba sentado en la montura
  private renderMounted(ctx: CanvasRenderingContext2D, showTag: boolean) {
    const beast = this.mount as Beast;
    beast.render(ctx);
    const seat = beast.seatPoint();
    const feetY = seat.y + this.height * RIDER_WAIST;
    const blink = this.invuln > 0 && Math.floor(this.invuln / 4) % 2 === 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(seat.x - 300, seat.y - 400, 600, 410);
    ctx.clip();
    if (this.sheet.status === 'ready') {
      const { row, frame } = godFrame(this, this.cfg, this.animClock, 28);
      drawSpriteFrame(ctx, this.sheet, this.cfg, row, frame, seat.x, feetY, this.facing, { flash: this.flash > 0, alpha: blink ? 0.45 : 1 });
    } else {
      ctx.fillStyle = this.deity.primaryColor;
      ctx.fillRect(seat.x - 25, feetY - this.height, 50, this.height);
    }
    ctx.restore();
    if (showTag) this.drawTag(ctx, seat.x, feetY);
  }

  public finishMagic() {
    if (this.state === 'magic') this.setState('idle');
  }

  public advanceMagicPose() {
    this.stateTimer++;
    this.animClock++;
    this.trail = [];
  }

  public render(ctx: CanvasRenderingContext2D, showTag: boolean = false) {
    if (this.mount) {
      this.renderMounted(ctx, showTag);
      return;
    }
    const blink = this.invuln > 0 && this.state !== 'spin' && this.state !== 'magic' && Math.floor(this.invuln / 4) % 2 === 0;
    const feetY = screenY(this.z, this.y);

    // En cooperativo, distintivo 1P / 2P sobre la cabeza para no confundirse
    if (showTag && !this.isDown) this.drawTag(ctx, this.x, feetY);

    // Aura del dios al canalizar la magia
    if (this.state === 'magic') {
      const aura = ctx.createRadialGradient(this.x, feetY - 90, 10, this.x, feetY - 90, 150);
      aura.addColorStop(0, this.deity.auraColor);
      aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = aura;
      ctx.fillRect(this.x - 150, feetY - 240, 300, 300);
    }

    if (this.sheet.status !== 'ready') {
      ctx.fillStyle = this.flash > 0 ? '#ffffff' : this.deity.primaryColor;
      ctx.globalAlpha = blink ? 0.45 : 1;
      ctx.fillRect(this.x - 25, feetY - this.height, 50, this.height);
      ctx.globalAlpha = 1;
      return;
    }
    // Imágenes fantasma en los ataques rápidos (embestida, giro, tajo aéreo, remate del combo)
    for (let i = this.trail.length % 2; i < this.trail.length - 1; i += 2) {
      const p = this.trail[i];
      drawSpriteFrame(ctx, this.sheet, this.cfg, p.row, p.frame, p.x, screenY(p.z, p.y), p.facing, {
        tint: this.deity.accentColor,
        alpha: 0.15 + 0.25 * (i / this.trail.length)
      });
    }

    const { row, frame } = godFrame(this, this.cfg, this.animClock, this.comboDuration);
    const pose = godPose(this, { dashing: this.state === 'dashAttack', finisher: this.comboStep === 3 });
    let lift = 0;
    let rotation = pose.rot;
    let scaleX = pose.sx;
    if (this.state === 'spin') {
      // Giro: el cuerpo se "afina" al dar la vuelta, como si girara sobre sí mismo
      scaleX = 0.2 + 0.8 * Math.abs(Math.cos((Math.PI * this.stateTimer) / 5));
      this.renderSpinSwoosh(ctx, feetY);
    } else if (this.state === 'jumpAttack') {
      rotation = 0.22; // Se lanza hacia delante en el tajo aéreo
    } else if (this.state === 'magic') {
      // Se eleva mientras canaliza, con un círculo de runas girando en el suelo
      lift = Math.min(28, this.stateTimer * 1.4) + Math.sin(this.animClock * 0.2) * 3;
      this.renderRuneCircle(ctx, feetY);
    }
    // Salto, magia y remate del combo con la segunda hoja cuando existe
    let extra: { row: number; frame: number } | null = null;
    if (this.extraSheet?.status === 'ready' && this.extraCfg) {
      if (this.state === 'jump') extra = { row: EXTRA_ROWS.jump, frame: this.vy > 4 ? 1 : this.vy < -4 ? 3 : 2 };
      else if (this.state === 'magic') extra = { row: EXTRA_ROWS.super, frame: Math.min(3, Math.floor(this.stateTimer / 15)) };
      else if (this.state === 'attack' && this.comboStep === 3) extra = { row: EXTRA_ROWS.finish, frame: this.stateTimer < 7 ? 0 : 1 };
      else if (this.state === 'dashAttack') extra = { row: EXTRA_ROWS.finish, frame: 1 };
    }
    if (extra && this.extraSheet && this.extraCfg) {
      drawSpriteFrame(ctx, this.extraSheet, this.extraCfg, extra.row, extra.frame, this.x, feetY - lift, this.facing, {
        flash: this.flash > 0,
        alpha: blink ? 0.45 : 1
      });
    } else {
      drawSpriteFrame(ctx, this.sheet, this.cfg, row, frame, this.x, feetY - lift, this.facing, {
        flash: this.flash > 0,
        alpha: blink ? 0.45 : 1,
        scaleX,
        scaleY: pose.sy,
        rotation
      });
    }
    if (this.state === 'spin') this.renderSpinSwoosh(ctx, feetY, true);
  }

  // Arco de energía alrededor de la cintura durante el giro (mitad trasera antes del cuerpo, delantera después)
  private renderSpinSwoosh(ctx: CanvasRenderingContext2D, feetY: number, front: boolean = false) {
    const cy = feetY - this.height * 0.45;
    const phase = (this.stateTimer * 0.55) % (Math.PI * 2);
    const fade = Math.max(0, 1 - this.stateTimer / 30);
    ctx.save();
    ctx.globalAlpha = 0.85 * fade;
    ctx.strokeStyle = this.deity.accentColor;
    ctx.shadowColor = this.deity.accentColor;
    ctx.shadowBlur = 14;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(this.x, cy, 115, 26, 0, front ? phase : phase + Math.PI, (front ? phase : phase + Math.PI) + Math.PI * 0.8);
    ctx.stroke();
    ctx.restore();
  }

  private renderRuneCircle(ctx: CanvasRenderingContext2D, feetY: number) {
    const grow = Math.min(1, this.stateTimer / 15);
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = this.deity.accentColor;
    ctx.shadowColor = this.deity.accentColor;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 8]);
    ctx.lineDashOffset = -this.animClock * 2;
    ctx.beginPath();
    ctx.ellipse(this.x, feetY, 85 * grow, 22 * grow, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.ellipse(this.x, feetY, 55 * grow, 14 * grow, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

const monsterSpriteSrc = (spriteId: string) => `${import.meta.env.BASE_URL}sprites/monsters/${spriteId}.webp`;

// --------------------------------------------------------------------------
// MONSTRUOS: rodean al héroe, avisan antes de golpear y se turnan para atacar
// --------------------------------------------------------------------------
export class Monster extends Actor {
  public kind: MonsterKind;
  public skin: MonsterSkin;
  public stats: MonsterStats;
  public damage: number;
  public engaged: boolean = false;
  public scored: boolean = false;
  public drops: number = 0;
  public reinforcement: boolean = false; // Invocado por un jefe: da vida y magia al derrotarlo
  public target: Hero | null = null; // Héroe al que persigue (en cooperativo, el más cercano)
  private entered: boolean = false;
  private cooldown: number = 40;
  private animT: number = Math.floor(Math.random() * 100);
  private flank: number = Math.random() < 0.5 ? -1 : 1;
  private sprite: { cfg: SpriteSheetConfig; sheet: SpriteSheetEntry } | null = null;

  constructor(kind: MonsterKind, skin: MonsterSkin, x: number, z: number, hpMul: number, dmgMul: number) {
    const stats = MONSTER_STATS[kind];
    super(x, z, Math.round(stats.hp * hpMul), stats.width, stats.height);
    this.kind = kind;
    this.skin = skin;
    this.stats = stats;
    this.damage = stats.damage * dmgMul;
    this.facing = -1;

    // Con hoja de sprites disponible se escala para que el reposo mida la altura de su tipo
    const meta = skin.spriteId ? MONSTER_SPRITES[skin.spriteId] : undefined;
    if (skin.spriteId && meta) {
      const cfg: SpriteSheetConfig = {
        src: monsterSpriteSrc(skin.spriteId),
        frameWidth: meta.frameWidth,
        frameHeight: meta.frameHeight,
        scale: stats.height / meta.idleHeight,
        footOffset: 0,
        pixelArt: meta.pixelArt ?? false,
        animations: GRID_4X4_ANIMATIONS
      };
      this.sprite = { cfg, sheet: loadSpriteSheet(cfg.src) };
    }
  }

  // Cuadro de la hoja del monstruo. Su fila de golpe va: impacto, caída, tendido, levantándose
  private spriteFrame(cfg: SpriteSheetConfig): { row: number; frame: number } {
    const a = cfg.animations;
    const cycle = (anim: typeof a.idle) => Math.floor(this.animT / anim.frameDuration) % anim.frames;
    switch (this.state) {
      case 'walk':
        return { row: a.run.row, frame: cycle(a.run) };
      case 'flee':
        return { row: a.run.row, frame: Math.floor(this.animT / 4) % a.run.frames };
      case 'windup':
        return { row: a.attack.row, frame: 0 };
      case 'strike':
        return { row: a.attack.row, frame: this.stateTimer < 6 ? 1 : 2 };
      case 'recover':
        return { row: a.attack.row, frame: 3 };
      case 'hurt':
        // El duende no ataca: su fila de ataque es el saco derramando vasijas, justo cuando suelta objetos
        if (this.kind === 'thief') return { row: a.attack.row, frame: this.stateTimer < 8 ? 1 : 2 };
        return { row: a.hit.row, frame: 0 };
      case 'knockdown':
        return { row: a.hit.row, frame: 1 };
      case 'down':
      case 'dead':
        return { row: a.hit.row, frame: 2 };
      case 'getup':
        return { row: a.hit.row, frame: 3 };
      default:
        return { row: a.idle.row, frame: cycle(a.idle) };
    }
  }

  protected canBeKnockedDown(hit: HitInfo): boolean {
    return !this.stats.armor || hit.heavy || hit.magic === true || hit.pierce === true;
  }

  protected flinchesFrom(hit: HitInfo): boolean {
    return !this.stats.armor || hit.heavy || hit.pierce === true;
  }

  public update(world: ArcadeGame) {
    this.tickTimers();
    this.animT++;
    if (this.cooldown > 0) this.cooldown--;
    if (this.updateDownStates()) return;

    if (!this.entered && this.x > world.camX + 20 && this.x < world.camX + VIEW_W - 20) this.entered = true;
    if (this.entered) this.x = clamp(this.x, world.camX + 20, world.camX + VIEW_W - 20);

    // El duende cruza la pantalla; tras soltar sus objetos huye a toda prisa
    if (this.kind === 'thief') {
      const fleeing = this.drops >= THIEF_MAX_DROPS;
      if (this.state !== (fleeing ? 'flee' : 'walk')) this.setState(fleeing ? 'flee' : 'walk');
      this.facing = -1;
      this.vx = fleeing ? -5.5 : -1.6; // Camina despacio para que dé tiempo a alcanzarlo
      this.vz = 0;
      this.entered = false; // Puede salir de la pantalla
      this.x += this.vx;
      if (this.x < world.camX - 120) this.removed = true;
      return;
    }

    const hero = this.target ?? world.pickTarget(this, null);
    // Montado ataca con la bestia: más alcance y su embestida o salto
    const beastStrike = this.mount ? this.mount.strike : null;
    const reach = beastStrike ? beastStrike.front : this.stats.reach;
    switch (this.state) {
      case 'windup':
        this.vx = 0;
        this.vz = 0;
        if (this.stateTimer >= this.stats.windup) {
          this.setState('strike');
          if (this.kind === 'runner') this.vx = this.facing * 7;
          if (beastStrike && beastStrike.lunge > 0) this.vx = this.facing * beastStrike.lunge;
          if (this.kind === 'brute' || this.kind === 'mini') sounds.playHeavySwing();
          else sounds.playSwing();
        }
        return;
      case 'strike':
        this.vx *= 0.85;
        this.integrate();
        if (this.stateTimer >= 3 && this.stateTimer <= 9) {
          if (this.mount && beastStrike) {
            world.enemyStrike(this, { ...beastStrike, damage: this.damage * 1.6 });
            world.beastFx(this.mount);
          } else {
            world.enemyStrike(this, {
              front: this.stats.reach,
              back: 10,
              damage: this.damage,
              knockdown: this.kind === 'brute' || this.kind === 'mini',
              heavy: this.kind === 'brute' || this.kind === 'mini'
            });
          }
        }
        if (this.stateTimer >= 12) this.setState('recover');
        return;
      case 'recover':
        this.vx *= 0.8;
        this.integrate();
        if (this.stateTimer >= this.stats.recover) {
          this.setState('idle');
          // En el primer nivel esperan más entre ataques
          this.cooldown = (50 + Math.random() * 70) * world.calmFactor + (world.levelIndex === 0 ? 35 : 0);
        }
        return;
    }

    // Busca un hueco de ataque junto al héroe; los que no están "en turno" rodean a distancia
    const heroAvailable = !hero.isDown && hero.invuln < 100;
    const side = this.x < hero.x ? -1 : 1;
    let desiredX: number;
    let desiredZ: number;
    if (!heroAvailable) {
      desiredX = hero.x + side * 340;
      desiredZ = this.z;
    } else if (this.engaged) {
      desiredX = hero.x + side * reach * 0.75;
      desiredZ = hero.z;
    } else {
      desiredX = hero.x + side * (230 + this.flank * 40);
      desiredZ = clamp(hero.z + this.flank * 60, 0, DEPTH);
    }
    // Siempre buscan su sitio dentro de la pantalla: nadie ataca desde fuera de cuadro
    desiredX = clamp(desiredX, world.camX + 60, world.camX + VIEW_W - 60);
    const dx = desiredX - this.x;
    const dz = desiredZ - this.z;
    const speed = this.stats.speed * (this.entered ? 1 : 1.4) * (this.mount ? MOUNT_SPEED : 1);
    this.vx = Math.abs(dx) > 6 ? Math.sign(dx) * speed : 0;
    this.vz = Math.abs(dz) > 4 ? Math.sign(dz) * speed * 0.7 : 0;
    this.facing = hero.x >= this.x ? 1 : -1;
    this.integrate();
    const moving = this.vx !== 0 || this.vz !== 0;
    if (this.state !== (moving ? 'walk' : 'idle')) this.setState(moving ? 'walk' : 'idle');

    if (
      heroAvailable &&
      this.engaged &&
      this.cooldown <= 0 &&
      Math.abs(hero.x - this.x) <= reach + 10 &&
      Math.abs(hero.z - this.z) <= Z_REACH &&
      hero.y < 40
    ) {
      this.setState('windup');
    }
  }

  public render(ctx: CanvasRenderingContext2D) {
    let pose: MonsterPose = 'idle';
    let progress = 0;
    switch (this.state) {
      case 'walk':
        pose = 'walk';
        break;
      case 'flee':
        pose = 'flee';
        break;
      case 'windup':
        pose = 'windup';
        progress = this.stateTimer / Math.max(1, this.stats.windup);
        break;
      case 'strike':
        pose = 'strike';
        progress = this.stateTimer / 12;
        break;
      case 'recover':
        pose = 'strike';
        progress = 1;
        break;
      case 'hurt':
        pose = 'hurt';
        break;
      case 'knockdown':
        pose = 'knockdown';
        break;
      case 'down':
      case 'dead':
        pose = 'down';
        break;
      case 'getup':
        pose = this.stateTimer < 9 ? 'down' : 'idle';
        break;
    }
    const alpha = this.state === 'dead' ? (this.stateTimer % 6 < 3 ? 0.3 : 1) * (1 - this.stateTimer / 60) : 1;
    let bodyX = this.x;
    let bodyY = screenY(this.z, this.y);
    if (this.mount) {
      // Montado: la bestia y encima el jinete de la cintura para arriba
      this.mount.render(ctx);
      const seat = this.mount.seatPoint();
      bodyX = seat.x;
      bodyY = seat.y + this.height * RIDER_WAIST;
      ctx.save();
      ctx.beginPath();
      ctx.rect(seat.x - 300, seat.y - 400, 600, 410);
      ctx.clip();
    }
    if (this.sprite && this.sprite.sheet.status === 'ready') {
      const { row, frame } = this.spriteFrame(this.sprite.cfg);
      drawSpriteFrame(ctx, this.sprite.sheet, this.sprite.cfg, row, frame, bodyX, bodyY, this.facing, {
        flash: this.flash > 0,
        alpha
      });
    } else {
      drawMonsterOutlined(ctx, {
        kind: this.kind,
        skin: this.skin,
        height: this.height,
        x: bodyX,
        y: bodyY,
        facing: this.facing,
        pose,
        t: this.animT,
        progress,
        flash: this.flash > 0,
        alpha
      });
    }
    if (this.mount) ctx.restore();
  }
}

// --------------------------------------------------------------------------
// BESTIAS DE MONTA: el jinete (héroe o monstruo) la guía; sin jinete espera un rato y acaba huyendo
// --------------------------------------------------------------------------
const BEAST_WAIT_TICKS = 540; // Tiempo sin jinete antes de escapar
const MOUNT_SPEED = 1.35;     // Velocidad del jinete respecto a ir a pie
const RIDER_WAIST = 0.45;     // Altura de la cintura del jinete (fracción de su altura): se sienta en la montura

interface BeastStrike extends StrikeSpec {
  duration: number; // Ticks del ataque del héroe montado
  from: number;     // Ventana en que golpea
  to: number;
  lunge: number;    // Impulso hacia delante (salto del jaguar, carga del kirin)
}

const BEAST_STRIKES: Record<BeastAttack, BeastStrike> = {
  fire: { front: 165, back: 0, damage: 16, knockdown: true, heavy: false, duration: 30, from: 10, to: 22, lunge: 0 },
  tail: { front: 125, back: 125, damage: 14, knockdown: true, heavy: true, duration: 28, from: 8, to: 18, lunge: 0 },
  pounce: { front: 115, back: 10, damage: 16, knockdown: true, heavy: true, duration: 26, from: 6, to: 16, lunge: 8 },
  thunder: { front: 120, back: 10, damage: 15, knockdown: true, heavy: true, duration: 28, from: 8, to: 20, lunge: 10 }
};

const beastSpriteSrc = (id: string) => `${import.meta.env.BASE_URL}sprites/beasts/${id}.webp`;

export class Beast extends Actor {
  public def: BeastDef;
  public cfg: SpriteSheetConfig;
  public sheet: SpriteSheetEntry;
  public rider: Hero | Monster | null = null;
  public riderless: number = 0;   // Ticks sin jinete
  public remountBlock: number = 0; // Recién desmontada: nadie se sube de inmediato
  private animClock: number = 0;

  constructor(def: BeastDef, x: number, z: number) {
    super(x, z, 1, 120, def.height);
    this.def = def;
    this.cfg = {
      src: beastSpriteSrc(def.id),
      frameWidth: def.frameWidth,
      frameHeight: def.frameHeight,
      scale: def.height / def.idleHeight,
      footOffset: 0,
      pixelArt: false,
      animations: GRID_4X4_ANIMATIONS
    };
    this.sheet = loadSpriteSheet(this.cfg.src);
  }

  public get strike(): BeastStrike {
    return BEAST_STRIKES[this.def.attack];
  }

  // La bestia no recibe golpes: se golpea al jinete
  public canBeHit(): boolean {
    return false;
  }

  // Lista para que alguien se suba
  public get free(): boolean {
    return !this.rider && !this.removed && this.state !== 'flee' && this.state !== 'hurt' && this.remountBlock <= 0;
  }

  // Punto de la montura en pantalla, donde se sienta el jinete
  public seatPoint(): { x: number; y: number } {
    const s = this.cfg.scale;
    return { x: this.x + this.facing * this.def.seat.dx * s, y: screenY(this.z, this.y) - this.def.seat.dy * s };
  }

  public update(world: ArcadeGame) {
    this.tickTimers();
    this.animClock++;
    if (this.remountBlock > 0) this.remountBlock--;
    const rider = this.rider;
    if (rider) {
      // Va donde la lleve su jinete
      this.x = rider.x;
      this.z = rider.z;
      this.y = rider.y;
      this.vx = rider.vx;
      this.vz = rider.vz;
      this.facing = rider.facing;
      this.riderless = 0;
      return;
    }
    this.riderless++;
    switch (this.state) {
      case 'hurt':
        // Recién derribado su jinete: se tambalea y se recompone
        this.vx *= 0.85;
        this.x += this.vx;
        if (this.stateTimer >= 24) this.setState('idle');
        break;
      case 'flee':
        this.x += this.vx;
        if (this.x < world.camX - 220 || this.x > world.camX + VIEW_W + 220) this.removed = true;
        break;
      default:
        this.vx = 0;
        this.vz = 0;
        if (this.riderless > BEAST_WAIT_TICKS) {
          this.facing = this.x < world.camX + VIEW_W / 2 ? -1 : 1;
          this.vx = this.facing * 6;
          this.setState('flee');
        } else {
          this.x = clamp(this.x, world.camX + 70, world.camX + VIEW_W - 70);
        }
    }
  }

  private frameFor(): { row: number; frame: number } {
    const a = this.cfg.animations;
    const cycle = (anim: typeof a.idle, speed: number = 1) => Math.floor((this.animClock * speed) / anim.frameDuration) % anim.frames;
    const rider = this.rider;
    if (rider) {
      switch (rider.state) {
        case 'mountAttack':
          return { row: a.attack.row, frame: Math.min(a.attack.frames - 1, Math.floor((rider.stateTimer / this.strike.duration) * a.attack.frames)) };
        case 'windup':
          return { row: a.attack.row, frame: 0 };
        case 'strike':
          return { row: a.attack.row, frame: rider.stateTimer < 6 ? 1 : 2 };
        case 'recover':
          return { row: a.attack.row, frame: a.attack.frames - 1 };
      }
      if (Math.abs(rider.vx) > 0.1 || Math.abs(rider.vz) > 0.1) return { row: a.run.row, frame: cycle(a.run, 1.3) };
      return { row: a.idle.row, frame: cycle(a.idle) };
    }
    if (this.state === 'hurt') return { row: a.hit.row, frame: this.stateTimer < 12 ? 0 : a.hit.frames - 1 };
    if (this.state === 'flee') return { row: a.run.row, frame: cycle(a.run, 1.6) };
    return { row: a.idle.row, frame: cycle(a.idle) };
  }

  public render(ctx: CanvasRenderingContext2D) {
    const feetY = screenY(this.z, this.y);
    if (this.sheet.status === 'ready') {
      const { row, frame } = this.frameFor();
      drawSpriteFrame(ctx, this.sheet, this.cfg, row, frame, this.x, feetY, this.facing, { flash: (this.rider?.flash ?? 0) > 0 });
    } else {
      ctx.fillStyle = this.def.color;
      ctx.beginPath();
      ctx.ellipse(this.x, feetY - this.def.height * 0.45, this.def.height * 0.8, this.def.height * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Aviso parpadeante para subirse
    if (this.free && this.riderless > 20 && this.animClock % 50 < 34) {
      ctx.save();
      ctx.font = 'bold 20px "Cinzel", serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fde68a';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 6;
      ctx.fillText('¡MONTA!', this.x, feetY - this.def.height - 24);
      ctx.restore();
    }
  }
}

// Baja al jinete de su bestia (al recibir un derribo o al saltar); la bestia queda libre
function dismount(rider: Actor, stagger: boolean = true) {
  const beast = rider.mount;
  if (!beast) return;
  rider.mount = null;
  beast.rider = null;
  beast.riderless = 0;
  beast.remountBlock = 45;
  beast.y = 0;
  beast.vx = stagger ? -rider.facing * 3 : 0;
  beast.setState(stagger ? 'hurt' : 'idle');
}

// --------------------------------------------------------------------------
// JEFE: un dios rival con combo, poderes especiales e invocación de esbirros
// --------------------------------------------------------------------------
export class Boss extends Actor {
  public deity: DeityData;
  public cfg: SpriteSheetConfig;
  public sheet: SpriteSheetEntry;
  public specials: BossSpecial[];
  public damage: number;
  public introTargetX: number;
  public displayHp: number;
  public currentSpecial: BossSpecial | null = null;
  private cooldown: number = 150;
  private specialCooldown: number = 300;
  private comboHits: number = 0;
  private summoned: boolean = false;
  private animClock: number = 0;
  private target: Hero | null = null;
  // Origen: el doble de grande, con más alcance, fases por vida y daño doble mientras usa un poder
  public colossal: boolean;
  public safeZone: { x: number; z: number } | null = null;

  // Astucia: 0 = bruto, 1 = lee todo lo que haces (sube con el nivel y la dificultad)
  public iq: number = 0.5;
  private recentHits: number[] = [];   // Golpes recibidos hace poco (para zafarse de los combos)
  private escapePending: boolean = false;
  private guardedHits: number = 0;
  private lunge: number = 0;           // Impulso al castigar un golpe fallado
  private antiAir: boolean = false;    // El golpe en curso alcanza a héroes en el aire
  private airRead: boolean = false;    // Ya decidió qué hacer con este salto
  // Origen aprende: cuenta lo que más hace el jugador y lo contrarresta
  private habits = { jumps: 0, spam: 0, magic: 0 };
  public counter: 'jumps' | 'spam' | 'magic' | null = null;

  constructor(deity: DeityData, x: number, z: number, hp: number, dmgMul: number, introTargetX: number) {
    super(x, z, hp, deity.id === ORIGEN.id ? 140 : 80, deity.id === ORIGEN.id ? 340 : 200);
    this.colossal = deity.id === ORIGEN.id;
    this.deity = deity;
    this.cfg = getSpriteSheetConfig(deity);
    this.sheet = loadSpriteSheet(this.cfg.src);
    this.specials = BOSS_SPECIALS[deity.id] ?? ['orb', 'charge'];
    this.damage = 10 * dmgMul;
    this.introTargetX = introTargetX;
    this.displayHp = hp;
    this.facing = -1;
    this.setState('intro');
  }

  private get enraged(): boolean {
    return this.hp < this.maxHp * 0.5;
  }

  // Embistiendo a toda velocidad (tras el aviso de la embestida)
  private get charging(): boolean {
    return this.state === 'special' && this.currentSpecial === 'charge' && Math.abs(this.vx) > 5;
  }

  // Solo la magia lo derriba; los golpes fuertes a veces lo hacen retroceder
  protected canBeKnockedDown(hit: HitInfo): boolean {
    return hit.magic === true;
  }

  protected flinchesFrom(hit: HitInfo): boolean {
    return this.state !== 'special' && this.state !== 'guard' && hit.heavy && Math.random() < 0.4;
  }

  // Al canalizar un poder Origen descubre su máscara: recibe el doble de daño
  public receiveHit(hit: HitInfo): boolean {
    if (this.state === 'guard' && !hit.magic && !hit.pierce) {
      if (hit.guardBreak) {
        // Un golpe de Poder le rompe la guardia y lo deja abierto
        this.setState('recover');
        this.stateTimer = 0;
        this.vx = hit.dir * 3;
        return super.receiveHit({ ...hit, damage: hit.damage * 0.6 });
      }
      this.guardedHits++;
      this.vx = hit.dir * 1.5;
      if (this.invuln > 0) return false;
      this.hp = Math.max(1, this.hp - hit.damage * 0.15);
      return true;
    }
    const exposed = this.colossal && this.state === 'special';
    if (this.counter === 'magic' && hit.magic) hit = { ...hit, damage: hit.damage * 0.6, knockdown: false };
    const landed = super.receiveHit(exposed ? { ...hit, damage: hit.damage * 2 } : hit);
    // Demasiados golpes seguidos: se zafa del combo
    if (landed && this.state !== 'special' && !this.isDown) {
      this.recentHits = this.recentHits.filter(t => this.animClock - t < 90);
      this.recentHits.push(this.animClock);
      if (this.recentHits.length >= (this.iq >= 0.7 ? 3 : 4) && Math.random() < 0.4 + this.iq * 0.6) this.escapePending = true;
    }
    return landed;
  }

  private get attackingStates(): ActorState[] {
    return ['attack', 'dashAttack', 'spin'];
  }

  // En cooperativo los jefes listos van por el héroe más débil
  private chooseTarget(world: ArcadeGame): Hero {
    const fallback = world.pickTarget(this, this.target);
    if (!world.coop || this.iq < 0.6) return fallback;
    const pool = world.activeHeroes.filter(h => !h.isDown && h.invuln < 100);
    if (pool.length < 2) return fallback;
    const ratio = (h: Hero) => h.hp / h.maxHp;
    const weakest = pool.reduce((a, b) => (ratio(b) < ratio(a) ? b : a));
    if (this.target && pool.includes(this.target) && ratio(this.target) - ratio(weakest) < 0.2) return this.target;
    return weakest;
  }

  // Elige el poder que mejor sirve según dónde está el héroe y qué hace
  private pickSpecial(pool: BossSpecial[], hero: Hero): BossSpecial {
    const dist = Math.abs(hero.x - this.x);
    const far = dist > 260;
    const still = Math.abs(hero.vx) < 0.5 && Math.abs(hero.vz) < 0.5;
    const fit: Record<BossSpecial, number> = {
      orb: far ? 3 : 1,
      charge: far && Math.abs(hero.z - this.z) < 40 ? 3 : 0.6,
      thunder: still ? 3 : 1.4,
      slam: dist < 220 ? 3 : 0.8,
      teleport: far ? 3 : 1.2,
      collapse: 3
    };
    if (this.counter === 'jumps') fit.thunder += 1.5; // Los rayos castigan a quien vive en el aire
    const weights = pool.map(sp => 1 + (fit[sp] - 1) * this.iq);
    let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  // Origen: cada 10 s revisa qué hace más el jugador y se adapta
  private learn(world: ArcadeGame, hero: Hero) {
    if (hero.state === 'jump' && hero.stateTimer === 1) this.habits.jumps++;
    if (hero.state === 'attack' && hero.stateTimer === 1) this.habits.spam += 0.25;
    if (hero.state === 'magic' && hero.stateTimer === 1) this.habits.magic += 4;
    if (this.animClock % 600 !== 0) return;
    const entries = Object.entries(this.habits) as ['jumps' | 'spam' | 'magic', number][];
    const [top, amount] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
    this.habits = { jumps: 0, spam: 0, magic: 0 };
    if (amount < 4 || top === this.counter) return;
    this.counter = top;
  }

  // Lee al héroe: antiaéreo, bloqueo del spam y castigo de golpes fallados. true si reaccionó
  private readHero(world: ArcadeGame, hero: Hero): boolean {
    const dx = hero.x - this.x;
    const dist = Math.abs(dx);
    const sameLane = Math.abs(hero.z - this.z) <= Z_REACH + 10;
    if (hero.y <= 0) this.airRead = false;

    // Antiaéreo: recibe con un golpe a quien le cae encima
    if (hero.y > 20 && !this.airRead && sameLane && dist < 230 * this.reach) {
      this.airRead = true;
      const chance = this.counter === 'jumps' ? 1 : this.iq * 0.8;
      if (Math.random() < chance) {
        this.facing = dx >= 0 ? 1 : -1;
        this.comboHits = 1; // Golpe de remate: derriba
        this.antiAir = true;
        this.setState('strike');
        sounds.playHeavySwing();
        return true;
      }
    }

    if (!sameLane || hero.isDown) return false;
    const attacking = this.attackingStates.includes(hero.state);

    // Bloqueo: ve venir el golpe y se cubre; tras dos golpes bloqueados contraataca
    if (attacking && hero.stateTimer === 1 && dist <= 170 * this.reach && (hero.x < this.x) === (this.facing === -1)) {
      const chance = this.iq * 0.45 + (this.counter === 'spam' ? 0.45 : 0);
      if (Math.random() < chance) {
        this.guardedHits = 0;
        this.vx = 0;
        this.setState('guard');
        return true;
      }
    }

    // Castigo: si el golpe del héroe no conecta y quedó cerca, se lanza sobre él
    if (attacking && hero.stateTimer === 8 && hero.hitTargets.size === 0 && dist > 120 * this.reach && dist < 330 && this.cooldown < 40) {
      if (Math.random() < this.iq * 0.7) {
        this.facing = dx >= 0 ? 1 : -1;
        this.lunge = this.facing * 11;
        this.comboHits = 1;
        this.setState('windup');
        this.stateTimer = 9;
        return true;
      }
    }
    return false;
  }

  // Se zafa del combo: salta hacia atrás (Origen se teletransporta) y aparta a los héroes
  private escape(world: ArcadeGame, hero: Hero) {
    this.escapePending = false;
    this.recentHits = [];
    if (this.colossal) {
      this.currentSpecial = 'teleport';
      this.setState('special');
      return;
    }
    const away: 1 | -1 = hero.x >= this.x ? -1 : 1;
    for (const h of world.activeHeroes) {
      if (Math.abs(h.x - this.x) < 160 && Math.abs(h.z - this.z) < 50 && !h.isDown) h.vx = -away * 7;
    }
    this.vx = away * 11;
    this.invuln = 24;
    this.setState('recover');
    this.stateTimer = 12;
    world.dust(this.x, this.z, 10);
    sounds.playJump();
  }

  private get reach(): number {
    return this.colossal ? 1.5 : 1;
  }

  public update(world: ArcadeGame) {
    this.tickTimers();
    this.animClock++;
    const pose = godFrame(this, this.cfg, this.animClock, 14);
    this.recordTrail(this.charging || (this.state === 'special' && this.currentSpecial === 'slam' && this.y > 0), pose.row, pose.frame);
    if (this.cooldown > 0) this.cooldown--;
    if (this.specialCooldown > 0) this.specialCooldown--;
    if (this.displayHp > this.hp) this.displayHp = Math.max(this.hp, this.displayHp - 1.2);
    if (this.updateDownStates()) return;

    this.target = this.chooseTarget(world);
    const hero = this.target;
    if (this.colossal && this.state !== 'intro') this.learn(world, hero);
    if (this.escapePending && this.state !== 'intro' && this.state !== 'special') {
      this.escape(world, hero);
      return;
    }
    switch (this.state) {
      case 'intro':
        this.facing = -1;
        this.vx = -2.4;
        this.integrate();
        if (this.x <= this.introTargetX) {
          this.vx = 0;
          this.setState('idle');
        }
        return;
      case 'windup':
        // Al castigar llega deslizándose; si no, se planta
        this.vx = this.lunge;
        this.vz = 0;
        this.lunge *= 0.8;
        if (Math.abs(this.lunge) > 0.5) {
          this.integrate();
          world.clampToView(this);
        }
        if (this.stateTimer >= 16) {
          this.lunge = 0;
          this.setState('strike');
          sounds.playHeavySwing();
        }
        return;
      case 'guard':
        this.vx *= 0.8;
        this.integrate();
        this.facing = hero.x >= this.x ? 1 : -1;
        if (this.guardedHits >= 2 || (this.stateTimer >= 45 && this.guardedHits > 0)) {
          // Contraataque inmediato tras aguantar el combo
          this.comboHits = 1;
          this.setState('windup');
          this.stateTimer = 10;
        } else if (this.stateTimer >= 45) {
          this.setState('idle');
        }
        return;
      case 'strike': {
        this.vx = this.facing * Math.max(0, 3 - this.stateTimer * 0.3);
        this.integrate();
        const finisher = this.comboHits >= 1;
        if (this.stateTimer >= 3 && this.stateTimer <= 9) {
          world.enemyStrike(this, {
            front: 130 * this.reach,
            back: 20,
            damage: this.damage * (finisher ? 1.5 : 1),
            knockdown: finisher,
            heavy: finisher,
            antiAir: this.antiAir
          });
        }
        if (this.stateTimer >= 14) {
          this.antiAir = false;
          this.comboHits++;
          if (this.comboHits < 2) {
            this.setState('windup');
            this.stateTimer = 8; // El segundo golpe llega más rápido
          } else {
            this.setState('recover');
          }
        }
        return;
      }
      case 'recover':
        this.vx *= 0.8;
        this.integrate();
        if (this.stateTimer >= 30) {
          this.setState('idle');
          this.cooldown = 50 + Math.random() * 40;
        }
        return;
      case 'special':
        this.updateSpecial(world, hero);
        return;
    }

    if (!this.summoned && this.enraged) {
      this.summoned = true;
      this.specialCooldown = 0;
      world.summonMinions(this);
    }

    const heroAvailable = !hero.isDown && hero.invuln < 100;
    if (heroAvailable && this.readHero(world, hero)) return;
    if (heroAvailable && this.specialCooldown <= 0) {
      const pool = this.colossal ? origenSpecials(this.hp / this.maxHp) : this.specials;
      this.currentSpecial = this.pickSpecial(pool, hero);
      this.facing = hero.x >= this.x ? 1 : -1;
      this.setState('special');
      this.specialCooldown = (this.enraged ? 240 : 360) * (this.colossal ? 0.7 : 1);
      sounds.playSuperActivation();
      return;
    }

    const side = this.x < hero.x ? -1 : 1;
    const desiredX = heroAvailable ? hero.x + side * 110 * this.reach : hero.x + side * 300;
    const desiredZ = hero.z;
    const dx = desiredX - this.x;
    const dz = desiredZ - this.z;
    const speed = this.enraged ? 3.0 : 2.4;
    this.vx = Math.abs(dx) > 8 ? Math.sign(dx) * speed : 0;
    this.vz = Math.abs(dz) > 4 ? Math.sign(dz) * speed * 0.7 : 0;
    this.facing = hero.x >= this.x ? 1 : -1;
    this.integrate();
    world.clampToView(this);
    const moving = this.vx !== 0 || this.vz !== 0;
    if (this.state !== (moving ? 'walk' : 'idle')) this.setState(moving ? 'walk' : 'idle');

    if (heroAvailable && this.cooldown <= 0 && Math.abs(hero.x - this.x) <= 145 * this.reach && Math.abs(hero.z - this.z) <= Z_REACH) {
      this.comboHits = 0;
      this.setState('windup');
    }
  }

  private updateSpecial(world: ArcadeGame, hero: Hero) {
    const t = this.stateTimer;
    switch (this.currentSpecial) {
      case 'charge': {
        // Embestida a través de la arena tras un aviso parpadeante
        if (t < 36) {
          this.vx = 0;
          this.vz = Math.sign(hero.z - this.z) * Math.min(2, Math.abs(hero.z - this.z));
          this.integrate();
          this.facing = hero.x >= this.x ? 1 : -1;
          if (t % 8 === 0) this.flash = 3;
        } else if (t === 36) {
          this.vx = this.facing * 13;
          this.vz = 0;
          sounds.playHeavySwing();
        } else if (t < 80) {
          this.integrate();
          world.enemyStrike(this, { front: 70, back: 30, damage: this.damage * 1.6, knockdown: true, heavy: true });
          if (t % 2 === 0) world.dust(this.x - this.facing * 30, this.z, 2);
          if (this.x < world.camX + 70 || this.x > world.camX + VIEW_W - 70) this.vx = 0;
        } else {
          this.vx = 0;
          this.setState('recover');
        }
        world.clampToView(this);
        break;
      }
      case 'orb': {
        // Esferas de energía que recorren el suelo (tres a la vez cuando está furioso)
        if (t === 28) {
          if (this.enraged) {
            for (const dz of [-45, 0, 45]) world.spawnOrb(this, dz);
          } else {
            world.spawnOrb(this, 0);
          }
        }
        if (this.enraged && t === 52) world.spawnOrb(this, 0);
        if (t >= 75) this.setState('recover');
        break;
      }
      case 'thunder': {
        // Rayos con círculo de aviso sobre la posición del héroe
        const strikes = this.enraged ? [10, 35, 60, 85] : [10, 40, 70];
        if (strikes.includes(t)) world.spawnThunder(hero.x, hero.z, this.deity.accentColor);
        if (t >= strikes[strikes.length - 1] + 30) this.setState('recover');
        break;
      }
      case 'slam': {
        // Salto aplastante con onda expansiva al caer
        if (t < 20) {
          this.vx = 0;
        } else if (t === 20) {
          this.y = 0.01;
          this.vy = 15;
          this.vx = (hero.x - this.x) / 40; // ~40 ticks en el aire
          this.vz = (hero.z - this.z) / 40;
          sounds.playJump();
        } else if (this.integrate()) {
          this.vx = 0;
          this.vz = 0;
          world.shockwave(this);
          this.setState('recover');
        }
        world.clampToView(this);
        break;
      }
      case 'teleport': {
        // Se deshace en estrellas y reaparece a la espalda del héroe para golpear
        this.vx = 0;
        this.vz = 0;
        if (t === 1 || t === 20) world.starBurst(this.x, this.z);
        if (t === 20) {
          this.x = hero.x - hero.facing * 120;
          this.z = hero.z;
          world.clampToView(this);
          this.facing = hero.x >= this.x ? 1 : -1;
        }
        if (t >= 36) {
          this.comboHits = 0;
          this.setState('windup');
        }
        break;
      }
      case 'collapse': {
        // El cosmos se deshace: solo el círculo de luz protege del estallido
        this.vx = 0;
        this.vz = 0;
        if (t === 1) this.safeZone = world.startCollapse(this);
        if (t === COLLAPSE_TICKS && this.safeZone) {
          world.collapseBlast(this, this.safeZone);
          this.safeZone = null;
        }
        if (t >= COLLAPSE_TICKS + 40) this.setState('recover');
        break;
      }
      default:
        this.setState('recover');
    }
  }

  public render(ctx: CanvasRenderingContext2D) {
    const feetY = screenY(this.z, this.y);
    let alpha = this.state === 'dead' ? Math.max(0, 1 - this.stateTimer / 50) : 1;
    if (this.state === 'special' && this.currentSpecial === 'teleport') {
      const t = this.stateTimer;
      alpha = t < 20 ? 1 - t / 20 : Math.min(1, (t - 20) / 16);
    }

    // Aura divina permanente (roja al enfurecerse)
    const aura = ctx.createRadialGradient(this.x, feetY - 100, 10, this.x, feetY - 100, 170);
    aura.addColorStop(0, this.enraged ? 'rgba(239, 68, 68, 0.45)' : this.deity.auraColor);
    aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = aura;
    ctx.fillRect(this.x - 170, feetY - 270, 340, 340);

    // Aviso de la embestida: franja en el suelo hacia donde va a cargar
    if (this.state === 'special' && this.currentSpecial === 'charge' && this.stateTimer < 36) {
      ctx.fillStyle = `rgba(239, 68, 68, ${0.15 + (this.stateTimer % 8 < 4 ? 0.15 : 0)})`;
      const len = 700;
      ctx.fillRect(this.facing === 1 ? this.x : this.x - len, screenY(this.z) - 14, len, 28);
    }
    ctx.globalAlpha = 1;

    if (this.sheet.status !== 'ready') {
      ctx.fillStyle = this.flash > 0 ? '#ffffff' : this.deity.primaryColor;
      ctx.fillRect(this.x - 30, feetY - this.height, 60, this.height);
      return;
    }
    for (let i = this.trail.length % 2; i < this.trail.length - 1; i += 2) {
      const p = this.trail[i];
      drawSpriteFrame(ctx, this.sheet, this.cfg, p.row, p.frame, p.x, screenY(p.z, p.y), p.facing, {
        scale: 1.2,
        tint: this.deity.accentColor,
        alpha: (0.15 + 0.25 * (i / this.trail.length)) * alpha
      });
    }
    const { row, frame } = godFrame(this, this.cfg, this.animClock, 14);
    const pose = godPose(this, { dashing: this.charging });
    // Al canalizar sus esferas o rayos se eleva un poco, como el héroe con su magia
    const casting = this.state === 'special' && (this.currentSpecial === 'orb' || this.currentSpecial === 'thunder');
    const lift = casting ? Math.min(22, this.stateTimer * 1.2) : 0;
    drawSpriteFrame(ctx, this.sheet, this.cfg, row, frame, this.x, feetY - lift, this.facing, {
      scale: 1.2,
      flash: this.flash > 0,
      alpha,
      scaleX: pose.sx,
      scaleY: pose.sy,
      rotation: pose.rot
    });
    if (this.state === 'guard') {
      ctx.save();
      ctx.globalAlpha = 0.45 + (this.guardedHits > 0 && this.stateTimer % 6 < 3 ? 0.4 : 0);
      ctx.strokeStyle = '#93c5fd';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(this.x + this.facing * this.width * 0.55, feetY - this.height * 0.55, 18, this.height * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// --------------------------------------------------------------------------
// PROYECTILES, RAYOS Y OBJETOS
// --------------------------------------------------------------------------
interface Orb {
  x: number;
  z: number;
  y: number;
  vx: number;
  damage: number;
  color: string;
  t: number;
}

interface Thunder {
  x: number;
  z: number;
  t: number;
  damage: number;
  color: string;
}

interface Item {
  kind: 'pot' | 'food';
  x: number;
  z: number;
  y: number;
  vy: number;
  t: number;
}

const THUNDER_DELAY = 50;
const COLLAPSE_TICKS = 150; // Aviso antes del estallido del colapso de Origen
const COLLAPSE_SAFE_RADIUS = 110;
const THUNDER_RADIUS = 75;

type Phase = 'play' | 'bossIntro' | 'boss' | 'levelClear' | 'gameOver' | 'finalOver' | 'victory';

const CONTINUE_TICKS = 600;    // Cuenta regresiva de 10 s para continuar
const COMBO_WINDOW = 180;      // Sin conectar un golpe en 3 s, el combo se pierde
const RESULTS_TICKS = 600;     // Pantalla de resultados de cada nivel (se salta con ataque)
const PROP_COUNT: Partial<Record<string, number>> = { Grecia: 6, Egipto: 6 }; // Objetos de primer plano por reino
const PROP_SLUG: Record<string, string> = { Grecia: 'grecia', Egipto: 'egipto', 'México': 'mexico', 'Japón': 'japon' };
const RECORDS_KEY = 'mythic-clash-records';

// Multiplicador de puntos por combo: x2 a los 6 golpes seguidos, hasta x5
export const comboMultiplier = (combo: number) => Math.min(5, 1 + Math.floor(combo / 6));

interface LevelResult {
  hero: Hero;
  kills: number;
  secs: number;
  deaths: number;
  maxCombo: number;
  timeBonus: number;
  noDeathBonus: number;
  comboBonus: number;
  rank: 'S' | 'A' | 'B' | 'C';
}

// Calificación por nivel: sin morir, rápido y con combos largos
export function levelRank(deaths: number, secs: number, maxCombo: number): LevelResult['rank'] {
  const pts = (deaths === 0 ? 2 : deaths === 1 ? 1 : 0) + (secs < 150 ? 2 : secs < 210 ? 1 : 0) + (maxCombo >= 25 ? 2 : maxCombo >= 12 ? 1 : 0);
  return pts >= 5 ? 'S' : pts >= 3 ? 'A' : pts >= 1 ? 'B' : 'C';
}

interface Banner {
  title: string;
  subtitle: string;
  color: string;
  t: number;
  duration: number;
}

// --------------------------------------------------------------------------
// PARTIDA ARCADE: niveles, cámara, oleadas, combate, magia y HUD
// --------------------------------------------------------------------------
export class ArcadeGame {
  public heroes: Hero[];
  public coop: boolean;
  public monsters: Monster[] = [];
  public beasts: Beast[] = [];
  public boss: Boss | null = null;
  public orbs: Orb[] = [];
  public thunders: Thunder[] = [];
  public items: Item[] = [];
  public particles: Particle[] = [];

  public levelIndex: number = 0;
  public level: LevelDef = LEVELS[0];
  public camX: number = 0;
  public tick: number = 0;
  public phase: Phase = 'play';
  public paused: boolean = false;
  public exitRequested: boolean = false;
  public calmFactor: number; // Más alto = los monstruos esperan más entre ataques

  private difficulty: Difficulty;
  private waves: Wave[] = [];
  private waveIndex: number = 0;
  private waveActive: boolean = false;
  private pending: { spawn: WaveSpawn; timer: number }[] = [];
  private phaseTimer: number = 0;
  private bossDeity: DeityData = DEITIES[0];
  private bossDown: boolean = false;
  private banner: Banner | null = null;
  private goTimer: number = 0;
  private hitstop: number = 0;
  private shakeTicks: number = 0;
  private shakeDuration: number = 1;
  private shakeIntensity: number = 0;
  private magicCast: { t: number; color: string; name: string; power: number; caster: Hero } | null = null;
  private thiefHintShown: boolean = false;
  public continueTimer: number = 0;
  private levelStartTick: number = 0;
  private results: LevelResult[] | null = null;
  public record: { best: number; isNew: boolean } | null = null;
  private props: SpriteSheetEntry[] = [];
  private beastHintShown: boolean = false;
  private art: { background: SpriteSheetEntry | null; floor: SpriteSheetEntry | null } = { background: null, floor: null };
  // Pulsaciones hechas durante la pausa de impacto (una por jugador): se aplican al reanudar para que no se pierdan
  private carriedPresses: Pick<ArcadeInput, 'attack' | 'jump' | 'magic' | 'tapLeft' | 'tapRight'>[];

  // Uno o dos dioses: con dos se juega en cooperativo
  constructor(deities: DeityData | DeityData[], difficulty: Difficulty) {
    const list = Array.isArray(deities) ? deities : [deities];
    this.difficulty = difficulty;
    this.calmFactor = difficulty === 'FACIL' ? 1.6 : difficulty === 'DIFICIL' ? 0.5 : 1;
    this.heroes = list.map((d, i) => new Hero(d, i));
    this.coop = this.heroes.length > 1;
    this.carriedPresses = this.heroes.map(() => ({ attack: false, jump: false, magic: false, tapLeft: false, tapRight: false }));
    this.startLevel(0);
  }

  // Jugador 1 (las pruebas y el modo de un jugador lo usan directamente)
  public get hero(): Hero {
    return this.heroes[0];
  }

  // Héroes que siguen en partida (los que agotaron sus vidas esperan a continuar)
  public get activeHeroes(): Hero[] {
    return this.heroes.filter(h => !h.gameOver);
  }

  // Elige a quién persigue un enemigo: el héroe disponible más cercano, sin cambiar de presa
  // por poca diferencia para que no titubee entre los dos jugadores
  public pickTarget(actor: Actor, current: Hero | null): Hero {
    const active = this.activeHeroes;
    if (active.length === 0) return this.heroes[0];
    const available = active.filter(h => !h.isDown && h.invuln < 100);
    const pool = available.length > 0 ? available : active;
    const dist = (h: Hero) => Math.abs(h.x - actor.x) + Math.abs(h.z - actor.z);
    const best = pool.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    if (current && pool.includes(current) && dist(current) < dist(best) + 150) return current;
    return best;
  }

  // --- FLUJO DE NIVELES ---

  private startLevel(index: number) {
    // Tras los cuatro reinos llega el nivel final: una sola pantalla contra Origen
    const final = index >= LEVELS.length;
    this.levelIndex = index;
    this.level = final ? FINAL_LEVEL : LEVELS[index];
    this.waves = final ? [] : buildWaves(index);
    this.waveIndex = 0;
    this.waveActive = false;
    this.pending = [];
    this.monsters = [];
    this.beasts = [];
    this.boss = null;
    this.bossDown = false;
    this.orbs = [];
    this.thunders = [];
    this.items = [];
    this.particles = [];
    this.camX = final ? BOSS_CAM_X : 0;
    this.phase = 'play';
    this.phaseTimer = 0;
    this.goTimer = final ? 0 : 240;
    this.levelStartTick = this.tick;
    this.results = null;
    for (const hero of this.heroes) {
      hero.kills = hero.deaths = hero.maxCombo = hero.combo = hero.comboTimer = 0;
    }

    // En cooperativo, el 2P entra un poco atrás y más al frente
    for (const hero of this.heroes) {
      hero.x = this.camX + (this.coop ? (hero.index === 0 ? 260 : 170) : 220);
      hero.z = DEPTH * (this.coop ? (hero.index === 0 ? 0.4 : 0.85) : 0.6);
      hero.y = 0;
      hero.vx = hero.vz = hero.vy = 0;
      hero.mount = null;
      hero.canRevive = true;
      if (!hero.gameOver) hero.setState('idle');
      hero.invuln = 60;
    }

    // El jefe nunca es el dios que controla alguno de los jugadores
    const playerIds = this.heroes.map(h => h.deity.id);
    const bossId = this.level.bossOrder.find(id => !playerIds.includes(id)) ?? this.level.bossOrder[0];
    this.bossDeity = final ? ORIGEN : DEITIES.find(d => d.id === bossId) ?? DEITIES[0];
    loadSpriteSheet(getSpriteSheetConfig(this.bossDeity).src);
    // Escenario pintado del nivel, si lo tiene (se carga con la misma caché que los sprites)
    const loadArt = (file?: string) => (file ? loadSpriteSheet(`${import.meta.env.BASE_URL}backgrounds/${file}`) : null);
    this.art = { background: loadArt(this.level.art?.background), floor: loadArt(this.level.art?.floor) };

    loadSpriteSheet(beastSpriteSrc(BEASTS[this.level.pantheon].id));
    const propCount = final ? 0 : PROP_COUNT[this.level.pantheon] ?? 0;
    this.props = Array.from({ length: propCount }, (_, i) =>
      loadSpriteSheet(`${import.meta.env.BASE_URL}props/${PROP_SLUG[this.level.pantheon]}-${i}.webp`)
    );
    for (const skin of [...Object.values(this.level.skins), THIEF_SKIN]) {
      if (skin.spriteId && MONSTER_SPRITES[skin.spriteId]) loadSpriteSheet(monsterSpriteSrc(skin.spriteId));
    }

    const levelName = final ? 'FINAL' : `${index + 1} · ${this.level.pantheon.toUpperCase()}`;
    this.showBanner(`NIVEL ${levelName}`, `${this.level.title} — ${this.level.subtitle}`, final ? '#c4b5fd' : '#fbbf24', 220);
  }

  private showBanner(title: string, subtitle: string, color: string, duration: number) {
    this.banner = { title, subtitle, color, t: 0, duration };
  }

  private shake(intensity: number, ticks: number = 9) {
    // 9 pasos ≈ 150 ms a 60 Hz
    if (this.shakeTicks > 0 && this.shakeIntensity > intensity) return;
    this.shakeIntensity = intensity;
    this.shakeTicks = ticks;
    this.shakeDuration = ticks;
  }

  private get hpMul(): number {
    return (0.85 + 0.15 * this.levelIndex) * DIFFICULTY_HP[this.difficulty] * (this.coop ? COOP_HP_MUL : 1);
  }

  private get dmgMul(): number {
    return (0.75 + 0.15 * this.levelIndex) * DIFFICULTY_DMG[this.difficulty];
  }

  private spawnMonster(kind: MonsterKind, side: 'left' | 'right', zFrac: number, mounted: boolean = false): Monster {
    const x = side === 'right' ? this.camX + VIEW_W + 60 : this.camX - 60;
    const skin = kind === 'thief' ? THIEF_SKIN : this.level.skins[kind];
    const monster = new Monster(kind, skin, x, zFrac * DEPTH, this.hpMul, this.dmgMul);
    this.monsters.push(monster);
    if (kind === 'mini') {
      this.showBanner(`¡${skin.name.toUpperCase()}!`, 'Mini-jefe', '#f97316', 150);
      this.shake(8, 20);
      sounds.playSuperActivation();
    }
    if (mounted) {
      const beast = new Beast(BEASTS[this.level.pantheon], x, monster.z);
      this.beasts.push(beast);
      this.mountOn(monster, beast);
      if (!this.beastHintShown) {
        this.beastHintShown = true;
        this.floatingText(this.camX + VIEW_W * 0.62, screenY(monster.z) - 190, `¡Derriba al jinete y monta al ${beast.def.name}!`, '#fbbf24');
      }
    }
    if (kind === 'thief' && !this.thiefHintShown) {
      this.thiefHintShown = true;
      this.particles.push({
        x: this.camX + VIEW_W * 0.7,
        y: screenY(zFrac * DEPTH) - 150,
        vx: 0,
        vy: -0.2,
        radius: 0,
        color: '#93c5fd',
        alpha: 1,
        decay: 0.006,
        type: 'text',
        text: '¡Golpea al duende! Suelta magia y comida'
      });
    }
    return monster;
  }

  private startWave() {
    const wave = this.waves[this.waveIndex];
    this.waveActive = true;
    this.goTimer = 0;
    this.pending = wave.spawns.map(spawn => ({ spawn, timer: spawn.delay }));
  }

  private updateWaves() {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (--p.timer <= 0) {
        this.spawnMonster(p.spawn.kind, p.spawn.side, p.spawn.zFrac, p.spawn.mounted);
        this.pending.splice(i, 1);
      }
    }
    if (this.waveActive && this.pending.length === 0 && !this.monsters.some(m => m.kind !== 'thief')) {
      this.waveActive = false;
      this.waveIndex++;
      this.goTimer = 240;
    }
  }

  private updateCamera() {
    if (this.waveActive || this.phase !== 'play') return;
    const active = this.activeHeroes;
    if (active.length === 0) return;
    if (this.waves.length === 0 && this.phaseTimer < 150) return; // Nivel final: deja leer el cartel antes del jefe
    const nextStop = this.waveIndex < this.waves.length ? this.waves[this.waveIndex].camX : BOSS_CAM_X;
    // Sigue al que va delante, pero sin dejar fuera de cuadro al que se quedó atrás
    const lead = Math.max(...active.map(h => h.x));
    const trail = Math.min(...active.map(h => h.x));
    const target = clamp(Math.min(lead - VIEW_W * 0.45, trail - 50), 0, nextStop);
    if (target > this.camX) this.camX = Math.min(nextStop, this.camX + Math.max(1, (target - this.camX) * 0.12));
    if (this.camX >= nextStop - 0.5) {
      this.camX = nextStop;
      if (this.waveIndex < this.waves.length) this.startWave();
      else this.startBossIntro();
    }
  }

  private startBossIntro() {
    this.phase = 'bossIntro';
    this.phaseTimer = 0;
    this.camX = BOSS_CAM_X;
    const final = this.bossDeity === ORIGEN;
    const hp = Math.round(300 * (1 + 0.2 * this.levelIndex) * (final ? 1.6 : 1) * DIFFICULTY_HP[this.difficulty] * (this.coop ? COOP_BOSS_HP_MUL : 1));
    this.boss = new Boss(this.bossDeity, this.camX + VIEW_W + 120, DEPTH * 0.5, hp, this.dmgMul, this.camX + VIEW_W * 0.72);
    // Hades (nivel 1) apenas te lee; el jefe de Japón casi todo; Origen todo. Fácil los vuelve más torpes
    this.boss.iq = clamp((final ? 1 : 0.4 + 0.15 * this.levelIndex) / this.calmFactor, 0.15, 1);
    this.showBanner(`${final ? 'JEFE FINAL' : 'JEFE'} · ${this.bossDeity.name.toUpperCase()}`, this.bossDeity.title, this.bossDeity.accentColor, 180);

    // Bendición divina: los héroes siempre enfrentan al jefe con la vida completa
    for (const hero of this.activeHeroes) {
      if (hero.hp >= hero.maxHp) continue;
      hero.hp = hero.maxHp;
      this.floatingText(hero.x, screenY(hero.z) - 210, '¡BENDICIÓN DIVINA! VIDA COMPLETA', '#4ade80');
      this.particles.push({ x: hero.x, y: screenY(hero.z), vx: 0, vy: 0, radius: 30, color: '#4ade80', alpha: 1, decay: 0.02, type: 'ring' });
      sounds.playSuperReady();
    }
    sounds.playSuperActivation();
    this.shake(8, 20);
  }

  // --- API USADA POR LOS ACTORES ---

  public clampToView(actor: Actor) {
    actor.x = clamp(actor.x, this.camX + 40, this.camX + VIEW_W - 40);
  }

  public dust(x: number, z: number, count: number) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 30,
        y: screenY(z),
        vx: (Math.random() - 0.5) * 3,
        vy: -Math.random() * 2,
        radius: 3 + Math.random() * 3,
        color: 'rgba(214, 211, 209, 0.6)',
        alpha: 0.7,
        decay: 0.035,
        type: 'dust'
      });
    }
  }

  public floatingText(x: number, y: number, text: string, color: string) {
    this.particles.push({ x, y, vx: 0, vy: -1.2, radius: 0, color, alpha: 1, decay: 0.02, type: 'text', text });
  }

  // source: el héroe que golpea (se lleva los puntos); null si el golpe es de un enemigo
  private applyHit(target: Actor, hit: HitInfo, source: Hero | null): boolean {
    const fromHero = source !== null;
    // Anubis esquiva algunos golpes por completo
    if (target instanceof Hero && !hit.magic && target.deity.id === 'anubis' && target.canBeHit() && Math.random() < PASSIVE.evadeChance) {
      target.invuln = Math.max(target.invuln, 20);
      this.floatingText(target.x, screenY(target.z) - 190, '¡ESQUIVA!', '#c4b5fd');
      return false;
    }
    if (source) hit = this.heroPassiveHit(source, target, hit);
    const bossGuarding = target instanceof Boss && target.state === 'guard';
    if (!target.receiveHit(hit)) return false;
    if (source) {
      source.combo++;
      source.comboTimer = COMBO_WINDOW;
      source.maxCombo = Math.max(source.maxCombo, source.combo);
    }
    if (target instanceof Hero) target.combo = 0;
    if (bossGuarding && target.state === 'guard') return true; // Bloqueado: sin sangre ni chispas

    if (source) {
      if (source.deity.id === 'hades') source.hp = Math.min(source.maxHp, source.hp + hit.damage * PASSIVE.lifesteal);
      if (source.deity.id === 'ra') target.burnTicks = PASSIVE.burnTicks;
      if (source.deity.id === 'poseidon' && hit.heavy) target.vx *= PASSIVE.poseidonPush;
    }

    const ix = target.x - hit.dir * target.width * 0.3;
    const iy = screenY(target.z, target.y) - target.height * 0.6;
    spawnBloodBurst(this.particles, ix, iy, hit.dir, screenY(target.z));
    this.particles.push({ x: ix, y: iy, vx: 0, vy: 0, radius: hit.heavy ? 22 : 12, color: 'rgba(255, 255, 255, 0.85)', alpha: 1, decay: 0.07, type: 'ring' });
    for (let i = 0; i < (hit.heavy ? 14 : 7); i++) {
      this.particles.push({
        x: ix,
        y: iy,
        vx: hit.dir * (Math.random() * 7 + 2),
        vy: (Math.random() - 0.5) * 9,
        radius: 2 + Math.random() * 3,
        color: Math.random() < 0.5 ? '#fde68a' : '#ffffff',
        alpha: 1,
        decay: 0.05,
        type: 'spark'
      });
    }

    if (hit.heavy || hit.knockdown) {
      sounds.playHitHeavy();
      this.hitstop = Math.max(this.hitstop, 4);
      this.shake(hit.heavy ? 12 : 7);
    } else {
      sounds.playHitLight();
      this.hitstop = Math.max(this.hitstop, 2);
    }
    if (!fromHero) sounds.playHurt();

    if (source && target instanceof Monster) {
      // El duende suelta sus objetos con cada golpe
      // El duende suelta un objeto por golpe; si cae, suelta todo lo que le quedaba
      if (target.kind === 'thief') {
        const count = target.hp <= 0 ? THIEF_MAX_DROPS - target.drops : Math.min(1, THIEF_MAX_DROPS - target.drops);
        for (let i = 0; i < count; i++) {
          target.drops++;
          this.spawnItem(Math.random() < 0.65 ? 'pot' : 'food', target.x, target.z);
        }
      }
      if (target.hp <= 0) this.defeatMonster(target, source);
    }
    return true;
  }

  // Remates de Zeus con rayo y tajos de Susanoo que atraviesan armaduras
  private heroPassiveHit(source: Hero, target: Actor, hit: HitInfo): HitInfo {
    if (!hit.heavy || hit.magic) return hit;
    if (source.deity.style === 'Poder') hit = { ...hit, guardBreak: true };
    if (source.deity.id === 'zeus') {
      for (let k = 0; k < 14; k++) {
        this.particles.push({ x: target.x + (Math.random() - 0.5) * 30, y: screenY(target.z) - Math.random() * 300, vx: (Math.random() - 0.5) * 3, vy: 9 + Math.random() * 6, radius: 3, color: k % 2 ? '#38bdf8' : '#ffffff', alpha: 1, decay: 0.05, type: 'lightning' });
      }
      return { ...hit, damage: hit.damage * (1 + PASSIVE.zeusBonus) };
    }
    if (source.deity.id === 'susanoo') return { ...hit, pierce: true };
    return hit;
  }

  public heroStrike(hero: Hero, spec: StrikeSpec) {
    const front = spec.front * STYLE_REACH[hero.deity.style];
    const x0 = hero.facing === 1 ? hero.x - spec.back : hero.x - front;
    const x1 = hero.facing === 1 ? hero.x + front : hero.x + spec.back;
    const targets: Actor[] = [...this.monsters];
    if (this.boss) targets.push(this.boss);
    for (const t of targets) {
      if (hero.hitTargets.has(t) || !t.canBeHit()) continue;
      if (Math.abs(t.z - hero.z) > Z_REACH + (t instanceof Boss ? 12 : 0)) continue;
      if (t.x + t.width / 2 < x0 || t.x - t.width / 2 > x1) continue;
      hero.hitTargets.add(t);
      const dir: 1 | -1 = spec.back > 50 ? (t.x >= hero.x ? 1 : -1) : hero.facing;
      this.applyHit(t, { damage: spec.damage, knockdown: spec.knockdown, heavy: spec.heavy, dir }, hero);
    }
  }

  // Los golpes enemigos alcanzan a cualquier jugador que esté en su trayectoria
  public enemyStrike(attacker: Actor, spec: StrikeSpec) {
    const x0 = attacker.facing === 1 ? attacker.x - spec.back : attacker.x - spec.front;
    const x1 = attacker.facing === 1 ? attacker.x + spec.front : attacker.x + spec.back;
    for (const hero of this.activeHeroes) {
      if (attacker.hitTargets.has(hero) || !hero.canBeHit() || (hero.y > 80 && !spec.antiAir)) continue;
      if (Math.abs(hero.z - attacker.z) > Z_REACH + 6) continue;
      if (hero.x + hero.width / 2 < x0 || hero.x - hero.width / 2 > x1) continue;
      attacker.hitTargets.add(hero);
      const landed = this.applyHit(hero, { damage: spec.damage, knockdown: spec.knockdown, heavy: spec.heavy, dir: attacker.facing }, null);
      // Mictlantecuhtli regresa parte del golpe
      if (landed && hero.deity.id === 'mictlantecuhtli' && attacker.canBeHit()) {
        const dir: 1 | -1 = attacker.x >= hero.x ? 1 : -1;
        this.applyHit(attacker, { damage: spec.damage * PASSIVE.reflect * 0.6, knockdown: false, heavy: false, dir }, hero);
      }
    }
  }

  // Sube a un héroe o monstruo a la bestia
  private mountOn(rider: Hero | Monster, beast: Beast) {
    rider.mount = beast;
    beast.rider = rider;
    beast.setState('idle');
    rider.x = beast.x;
    rider.z = beast.z;
    rider.vx = rider.vz = 0;
    rider.setState('idle');
    if (rider instanceof Hero) {
      this.floatingText(rider.x, screenY(rider.z) - 220, `¡A LA CARGA SOBRE ${beast.def.name.toUpperCase()}!`, PLAYER_COLORS[rider.index]);
      sounds.playSuperReady();
    }
  }

  // Bestias libres: un héroe se sube al tocarlas; un soldado enemigo también puede robarla si tardas
  private updateBeasts() {
    for (const beast of this.beasts) beast.update(this);
    this.beasts = this.beasts.filter(b => !b.removed);
    for (const beast of this.beasts) {
      if (!beast.free) continue;
      const near = (a: Actor) => Math.abs(a.x - beast.x) < 60 && Math.abs(a.z - beast.z) < 28 && a.y < 10;
      const hero = this.activeHeroes.find(h => !h.mount && near(h) && (h.state === 'idle' || h.state === 'walk' || h.state === 'run'));
      if (hero) {
        this.mountOn(hero, beast);
        continue;
      }
      if (beast.riderless > 90) {
        const thief = this.monsters.find(m => m.kind === 'grunt' && !m.mount && near(m) && (m.state === 'idle' || m.state === 'walk'));
        if (thief) this.mountOn(thief, beast);
      }
    }
  }

  // Efectos del ataque de la bestia (fuego, coletazo, zarpazo, rayos)
  public beastFx(beast: Beast) {
    const y = screenY(beast.z, beast.y);
    const reach = beast.def.frameWidth * beast.cfg.scale * 0.42;
    const color = beast.def.color;
    switch (beast.def.attack) {
      case 'fire':
        for (let i = 0; i < 3; i++) {
          this.particles.push({
            x: beast.x + beast.facing * reach,
            y: y - beast.def.height * 0.62 + (Math.random() - 0.5) * 16,
            vx: beast.facing * (6 + Math.random() * 6),
            vy: (Math.random() - 0.5) * 2.5,
            radius: 5 + Math.random() * 6,
            color: Math.random() < 0.5 ? color : '#fde047',
            alpha: 0.95,
            decay: 0.05,
            type: 'spark'
          });
        }
        break;
      case 'tail':
        this.dust(beast.x - beast.facing * reach, beast.z, 2);
        this.dust(beast.x + beast.facing * reach * 0.6, beast.z, 1);
        break;
      case 'pounce':
        this.particles.push({ x: beast.x + beast.facing * reach, y: y - beast.def.height * 0.4, vx: beast.facing * 4, vy: (Math.random() - 0.5) * 4, radius: 3 + Math.random() * 3, color, alpha: 1, decay: 0.06, type: 'spark' });
        break;
      case 'thunder':
        for (let i = 0; i < 2; i++) {
          this.particles.push({
            x: beast.x + beast.facing * reach * Math.random(),
            y: y - Math.random() * beast.def.height,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.5) * 5,
            radius: 3 + Math.random() * 4,
            color: Math.random() < 0.6 ? color : '#ffffff',
            alpha: 1,
            decay: 0.06,
            type: 'lightning'
          });
        }
        break;
    }
  }

  public spawnItem(kind: 'pot' | 'food', x: number, z: number) {
    this.items.push({ kind, x: x + (Math.random() - 0.5) * 40, z, y: 40, vy: 5, t: 0 });
  }

  public spawnOrb(boss: Boss, dz: number) {
    this.orbs.push({
      x: boss.x + boss.facing * 60,
      z: clamp(boss.z + dz, 0, DEPTH),
      y: 80,
      vx: boss.facing * 7.5,
      damage: boss.damage * 1.2,
      color: boss.deity.accentColor,
      t: 0
    });
    sounds.playSolarBeam();
  }

  public spawnThunder(x: number, z: number, color: string) {
    this.thunders.push({ x, z, t: 0, damage: this.boss ? this.boss.damage * 1.4 : 14, color });
  }

  public shockwave(boss: Boss) {
    const y = screenY(boss.z);
    this.particles.push({ x: boss.x, y, vx: 0, vy: 0, radius: 30, color: boss.deity.accentColor, alpha: 1, decay: 0.025, type: 'ring' });
    this.particles.push({ x: boss.x, y, vx: 0, vy: 0, radius: 12, color: 'rgba(255, 255, 255, 0.9)', alpha: 1, decay: 0.03, type: 'ring' });
    this.dust(boss.x, boss.z, 16);
    sounds.playHitHeavy();
    this.shake(14, 12);
    for (const hero of this.activeHeroes) {
      if (hero.canBeHit() && hero.y < 20 && Math.abs(hero.x - boss.x) < 240 && Math.abs(hero.z - boss.z) < 75) {
        this.applyHit(hero, { damage: boss.damage * 1.4, knockdown: true, heavy: true, dir: hero.x >= boss.x ? 1 : -1 }, null);
      }
    }
  }

  public starBurst(x: number, z: number) {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      this.particles.push({ x, y: screenY(z) - 170, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, radius: 3, color: i % 2 ? '#fde68a' : '#c4b5fd', alpha: 1, decay: 0.03, type: 'spark' });
    }
    sounds.playJump();
  }

  // El círculo seguro aparece en el lado contrario a los héroes, para obligarlos a moverse
  public startCollapse(boss: Boss): { x: number; z: number } {
    const heroes = this.activeHeroes;
    const avgX = heroes.reduce((sum, h) => sum + h.x, 0) / Math.max(1, heroes.length);
    const left = this.camX + 220;
    const right = this.camX + VIEW_W - 220;
    const x = avgX - this.camX > VIEW_W / 2 ? left + Math.random() * 200 : right - Math.random() * 200;
    this.showBanner('¡EL COSMOS COLAPSA!', '¡Refúgiate en el círculo de luz!', boss.deity.accentColor, COLLAPSE_TICKS);
    this.shake(6, COLLAPSE_TICKS);
    return { x, z: DEPTH * (0.3 + Math.random() * 0.4) };
  }

  public collapseBlast(boss: Boss, zone: { x: number; z: number }) {
    this.shake(22, 30);
    this.hitstop = 10;
    sounds.playHitHeavy();
    for (let i = 0; i < 40; i++) {
      this.particles.push({ x: this.camX + Math.random() * VIEW_W, y: 200 + Math.random() * 500, vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 4, radius: 3 + Math.random() * 4, color: i % 2 ? '#c4b5fd' : '#fde68a', alpha: 1, decay: 0.02, type: 'spark' });
    }
    for (const hero of this.activeHeroes) {
      const nx = (hero.x - zone.x) / COLLAPSE_SAFE_RADIUS;
      const nz = (hero.z - zone.z) / (COLLAPSE_SAFE_RADIUS * 0.35);
      if (nx * nx + nz * nz <= 1 || !hero.canBeHit()) continue;
      this.applyHit(hero, { damage: boss.damage * 3, knockdown: true, heavy: true, dir: hero.x >= zone.x ? 1 : -1 }, null);
    }
  }

  public summonMinions(boss: Boss) {
    this.showBanner(`¡${boss.deity.name.toUpperCase()} INVOCA REFUERZOS!`, '', '#ef4444', 150);
    const minions = [this.spawnMonster('grunt', 'left', 0.25), this.spawnMonster('grunt', 'right', 0.8)];
    if (this.levelIndex >= 2) minions.push(this.spawnMonster('runner', 'left', 0.7));
    for (const m of minions) m.reinforcement = true;
  }

  // Puntos, comida ocasional y, si era un refuerzo del jefe, vida y magia al momento (para quien lo derrotó)
  private defeatMonster(m: Monster, hero: Hero) {
    if (m.scored) return;
    m.scored = true;
    const labelY = screenY(m.z, m.y) - m.height - 20;
    const mult = comboMultiplier(hero.combo);
    hero.score += m.stats.score * mult;
    hero.kills++;
    this.floatingText(m.x, labelY, `+${m.stats.score * mult}${mult > 1 ? ` ×${mult}` : ''}`, mult > 1 ? '#fb923c' : '#fde68a');
    if (m.kind === 'mini') {
      this.spawnItem('food', m.x - 30, m.z);
      this.spawnItem('pot', m.x + 30, m.z);
      this.showBanner(`¡${m.skin.name.toUpperCase()} DERROTADO!`, '', '#fbbf24', 120);
    }
    if (m.reinforcement) {
      hero.hp = Math.min(hero.maxHp, hero.hp + REINFORCEMENT_HEAL);
      hero.magic = Math.min(MAX_MAGIC, hero.magic + 1);
      this.floatingText(m.x, labelY - 28, `+${REINFORCEMENT_HEAL} VIDA  +1 MAGIA`, '#4ade80');
      sounds.playSuperReady();
    } else if (m.kind !== 'thief' && Math.random() < (m.kind === 'runner' ? 0.3 : 0.18)) {
      this.spawnItem('food', m.x, m.z);
    }
  }

  public respawnHero(hero: Hero) {
    hero.hp = hero.maxHp;
    hero.displayHp = hero.maxHp;
    hero.y = 0;
    hero.vx = hero.vz = hero.vy = 0;
    hero.setState('idle');
    hero.invuln = 150;
    // Consuelo divino: cada vida perdida (o continuación) regala magia para recuperar el control
    const gained = Math.min(RESPAWN_MAGIC, MAX_MAGIC - hero.magic);
    hero.magic += gained;
    this.floatingText(hero.x, screenY(hero.z) - 200, '¡RESURGE!', '#fbbf24');
    if (gained > 0) {
      this.floatingText(hero.x, screenY(hero.z) - 170, `+${gained} MAGIA`, '#60a5fa');
      sounds.playSuperReady();
    }
    // Onda divina que aparta a los enemigos cercanos
    for (const m of this.monsters) {
      if (Math.abs(m.x - hero.x) < 400) m.receiveHit({ damage: 0, knockdown: true, heavy: false, dir: m.x >= hero.x ? 1 : -1, magic: true });
    }
    this.particles.push({ x: hero.x, y: screenY(hero.z), vx: 0, vy: 0, radius: 40, color: hero.deity.accentColor, alpha: 1, decay: 0.02, type: 'ring' });
  }

  public castMagic(hero: Hero): boolean {
    if (hero.magic <= 0 || this.magicCast) return false;
    this.magicCast = { t: 0, color: hero.deity.accentColor, name: hero.deity.specialName, power: hero.magic, caster: hero };
    hero.magic = 0;
    sounds.playSuperActivation();
    return true;
  }

  private updateMagic() {
    const cast = this.magicCast;
    if (!cast) return;
    cast.t++;
    const caster = cast.caster;
    caster.advanceMagicPose();
    if (cast.t === 40) {
      // La magia golpea a todos los enemigos en pantalla; más vasijas = más daño
      const damage = (12 + 10 * cast.power) * caster.dmgMul;
      sounds.playThunder();
      this.shake(16, 18);
      const targets: Actor[] = this.monsters.filter(m => m.x > this.camX - 20 && m.x < this.camX + VIEW_W + 20);
      if (this.boss && this.boss.state !== 'intro') targets.push(this.boss);
      for (const t of targets) {
        const dmg = t instanceof Boss ? damage * 0.6 : damage;
        t.receiveHit({ damage: dmg, knockdown: true, heavy: true, dir: t.x >= caster.x ? 1 : -1, magic: true });
        const baseY = screenY(t.z);
        for (let i = 0; i < 26; i++) {
          this.particles.push({
            x: t.x + (Math.random() - 0.5) * 40,
            y: baseY - Math.random() * 420,
            vx: (Math.random() - 0.5) * 4,
            vy: Math.random() * 10 + 4,
            radius: 3 + Math.random() * 4,
            color: Math.random() < 0.6 ? cast.color : '#ffffff',
            alpha: 1,
            decay: 0.03,
            type: 'lightning'
          });
        }
        this.particles.push({ x: t.x, y: baseY, vx: 0, vy: 0, radius: 26, color: cast.color, alpha: 1, decay: 0.03, type: 'ring' });
        spawnBloodBurst(this.particles, t.x, baseY - t.height * 0.6, t.x >= caster.x ? 1 : -1, baseY);
        if (t instanceof Monster && t.hp <= 0) this.defeatMonster(t, caster);
      }
    }
    updateParticles(this.particles);
    if (cast.t >= 80) {
      this.magicCast = null;
      caster.finishMagic();
    }
  }

  // --- PASO DE SIMULACIÓN (60 Hz) ---

  // Una entrada por jugador (o una sola en el modo de un jugador)
  // Escenario del nivel y hojas de héroes y jefe todavía bajando
  public get loading(): boolean {
    return isLoading([this.art.background, this.art.floor, ...this.heroes.map(h => h.sheet), this.boss?.sheet]);
  }

  public step(inputs: ArcadeInput | ArcadeInput[]) {
    if (this.paused || this.loading) return;
    const list = Array.isArray(inputs) ? inputs : [inputs];
    const inputFor = (hero: Hero) => list[hero.index] ?? EMPTY_INPUT;
    this.tick++;
    if (this.banner && ++this.banner.t >= this.banner.duration) this.banner = null;
    if (this.shakeTicks > 0) this.shakeTicks--;
    if (this.goTimer > 0) this.goTimer--;

    if (this.phase === 'gameOver') {
      updateParticles(this.particles);
      this.continueTimer--;
      if (this.continueTimer % 60 === 0) sounds.playNav();
      if (list.some(i => i.attack) && this.continueTimer < CONTINUE_TICKS - 30) this.continueGame();
      else if (this.continueTimer <= 0) this.endRun('finalOver');
      return;
    }
    if (this.phase === 'finalOver') {
      this.phaseTimer++;
      if (list.some(i => i.attack) && this.phaseTimer > 60) this.exitRequested = true;
      return;
    }
    if (this.phase === 'victory') {
      updateParticles(this.particles);
      this.phaseTimer++;
      if (list.some(i => i.attack) && this.phaseTimer > 60) this.exitRequested = true;
      return;
    }
    if (this.hitstop > 0) {
      this.hitstop--;
      for (const hero of this.heroes) {
        const carried = this.carriedPresses[hero.index];
        const input = inputFor(hero);
        carried.attack ||= input.attack;
        carried.jump ||= input.jump;
        carried.magic ||= input.magic;
        carried.tapLeft ||= input.tapLeft;
        carried.tapRight ||= input.tapRight;
      }
      return;
    }
    const merged = this.heroes.map(hero => {
      const carried = this.carriedPresses[hero.index];
      const input = inputFor(hero);
      const result: ArcadeInput = {
        ...input,
        attack: input.attack || carried.attack,
        jump: input.jump || carried.jump,
        magic: input.magic || carried.magic,
        tapLeft: input.tapLeft || carried.tapLeft,
        tapRight: input.tapRight || carried.tapRight
      };
      carried.attack = carried.jump = carried.magic = carried.tapLeft = carried.tapRight = false;
      return result;
    });
    if (this.magicCast) {
      this.updateMagic();
      return;
    }

    for (const hero of this.heroes) {
      const input = merged[hero.index];
      // Quien agotó sus vidas vuelve a la partida con su botón de ataque, como en las máquinas
      if (hero.gameOver) {
        if (input.attack && this.coop) this.continueHero(hero);
        continue;
      }
      hero.update(input, this, this.tick);
    }
    for (const hero of this.heroes) {
      if (hero.comboTimer > 0 && --hero.comboTimer === 0) hero.combo = 0;
    }
    if (this.heroes.every(h => h.gameOver)) {
      this.phase = 'gameOver';
      this.continueTimer = CONTINUE_TICKS;
      sounds.playKO();
      return;
    }

    this.updateCamera();
    this.updateWaves();

    // Cada enemigo elige al héroe más cercano; solo los más próximos a cada héroe atacan a la vez
    const maxEngaged = 2 + (this.levelIndex >= 2 ? 1 : 0);
    const fighters = this.monsters.filter(m => m.kind !== 'thief' && !m.isDown);
    for (const m of fighters) m.target = this.pickTarget(m, m.target);
    for (const hero of this.heroes) {
      fighters
        .filter(m => m.target === hero)
        .sort((a, b) => Math.abs(a.x - hero.x) - Math.abs(b.x - hero.x))
        .forEach((m, i) => {
          m.engaged = i < maxEngaged;
        });
    }
    this.monsters.forEach(m => m.update(this));
    this.updateBeasts();
    this.separateMonsters();
    this.boss?.update(this);

    this.updateOrbs();
    this.updateThunders();
    this.updateItems();
    updateParticles(this.particles);
    this.monsters = this.monsters.filter(m => !m.removed);

    this.phaseTimer++;
    if (this.phase === 'bossIntro' && this.boss && this.boss.state !== 'intro' && this.phaseTimer >= 150) {
      this.phase = 'boss';
    } else if ((this.phase === 'boss' || this.phase === 'bossIntro') && this.boss && this.boss.hp <= 0 && !this.bossDown) {
      this.bossDown = true;
      this.phase = 'levelClear';
      this.phaseTimer = 0;
      for (const hero of this.activeHeroes) hero.score += 5000;
      this.hitstop = 24;
      this.shake(18, 30);
      sounds.playKO();
      sounds.playVictory();
      const subtitle = this.boss.colossal
        ? 'El creador ha sido vencido'
        : this.levelIndex + 1 < LEVELS.length
          ? 'Nivel completado · +5000 puntos'
          : 'Algo despierta más allá de los reinos...';
      this.showBanner(`¡${this.boss.deity.name.toUpperCase()} HA CAÍDO!`, subtitle, '#fbbf24', 120);
      this.results = this.computeResults();
      for (const m of this.monsters) m.receiveHit({ damage: 999, knockdown: true, heavy: true, dir: m.x >= this.boss.x ? 1 : -1, magic: true });
      this.orbs = [];
      this.thunders = [];
    } else if (this.phase === 'levelClear' && (this.phaseTimer >= RESULTS_TICKS || (this.phaseTimer > 200 && list.some(i => i.attack)))) {
      if (this.levelIndex < LEVELS.length) {
        // Recompensa entre niveles: media vida y una vasija de magia
        for (const hero of this.activeHeroes) {
          hero.hp = Math.min(hero.maxHp, hero.hp + hero.maxHp * 0.5);
          hero.magic = Math.min(MAX_MAGIC, hero.magic + 1);
        }
        this.startLevel(this.levelIndex + 1);
      } else {
        this.endRun('victory');
        sounds.playVictory();
      }
    }
  }

  // Bonos del nivel: se suman a los puntos al terminarlo
  private computeResults(): LevelResult[] {
    const secs = Math.round((this.tick - this.levelStartTick) / 60);
    return this.activeHeroes.map(hero => {
      const timeBonus = Math.max(0, (240 - secs) * 40);
      const noDeathBonus = hero.deaths === 0 ? 5000 : 0;
      const comboBonus = hero.maxCombo * 150;
      hero.score += timeBonus + noDeathBonus + comboBonus;
      return { hero, kills: hero.kills, secs, deaths: hero.deaths, maxCombo: hero.maxCombo, timeBonus, noDeathBonus, comboBonus, rank: levelRank(hero.deaths, secs, hero.maxCombo) };
    });
  }

  // Fin de la partida: guarda el récord por dios (o pareja de dioses en cooperativo)
  private endRun(phase: 'finalOver' | 'victory') {
    this.phase = phase;
    this.phaseTimer = 0;
    const key = this.heroes.map(h => h.deity.id).join('+');
    const score = Math.max(...this.heroes.map(h => h.score));
    let records: Record<string, number> = {};
    try {
      records = JSON.parse(localStorage.getItem(RECORDS_KEY) ?? '{}');
    } catch {
      // Sin almacenamiento: el récord solo dura esta partida
    }
    const best = records[key] ?? 0;
    this.record = { best: Math.max(best, score), isNew: score > best };
    if (score > best) {
      records[key] = score;
      try {
        localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
      } catch {
        // Ídem
      }
    }
  }

  // Continuar cuesta la mitad de los puntos, como en las máquinas
  public continueGame() {
    if (this.phase !== 'gameOver') return;
    for (const hero of this.heroes) {
      hero.score = Math.floor(hero.score / 2);
      this.continueHero(hero);
    }
    this.phase = this.boss ? (this.bossDown ? 'levelClear' : 'boss') : 'play';
  }

  // Continuación: 3 vidas nuevas, de vuelta en pantalla junto al compañero si lo hay
  private continueHero(hero: Hero) {
    const partner = this.activeHeroes.find(h => h !== hero);
    hero.lives = 3;
    hero.gameOver = false;
    hero.x = clamp(partner ? partner.x - 90 : hero.x, this.camX + 60, this.camX + VIEW_W - 60);
    hero.z = partner ? clamp(partner.z + 40, 0, DEPTH) : hero.z;
    this.respawnHero(hero);
  }

  private separateMonsters() {
    const list = this.monsters.filter(m => !m.isDown);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        if (Math.abs(dx) < 40 && Math.abs(b.z - a.z) < 14) {
          const push = (40 - Math.abs(dx)) * 0.1 * (dx >= 0 ? 1 : -1);
          a.x -= push;
          b.x += push;
        }
      }
    }
  }

  private updateOrbs() {
    for (const orb of this.orbs) {
      orb.t++;
      orb.x += orb.vx;
      if (orb.t % 2 === 0) {
        this.particles.push({ x: orb.x, y: screenY(orb.z, orb.y), vx: -orb.vx * 0.2, vy: (Math.random() - 0.5) * 2, radius: 4 + Math.random() * 3, color: orb.color, alpha: 0.8, decay: 0.06, type: 'spark' });
      }
      const hero = this.activeHeroes.find(h => h.canBeHit() && h.y < 110 && Math.abs(h.z - orb.z) <= Z_REACH && Math.abs(h.x - orb.x) < 40);
      if (hero) {
        this.applyHit(hero, { damage: orb.damage, knockdown: true, heavy: true, dir: orb.vx > 0 ? 1 : -1 }, null);
        orb.t = 9999;
      }
    }
    this.orbs = this.orbs.filter(o => o.t < 9999 && o.x > this.camX - 100 && o.x < this.camX + VIEW_W + 100);
  }

  private updateThunders() {
    for (const th of this.thunders) {
      th.t++;
      if (th.t === THUNDER_DELAY) {
        sounds.playThunder();
        this.shake(10);
        const baseY = screenY(th.z);
        for (let i = 0; i < 30; i++) {
          this.particles.push({
            x: th.x + (Math.random() - 0.5) * 30,
            y: Math.random() * baseY,
            vx: (Math.random() - 0.5) * 6,
            vy: Math.random() * 12 + 6,
            radius: 3 + Math.random() * 4,
            color: Math.random() < 0.6 ? th.color : '#ffffff',
            alpha: 1,
            decay: 0.04,
            type: 'lightning'
          });
        }
        this.particles.push({ x: th.x, y: baseY, vx: 0, vy: 0, radius: 30, color: th.color, alpha: 1, decay: 0.04, type: 'ring' });
        for (const hero of this.activeHeroes) {
          if (hero.canBeHit() && hero.y < 60 && Math.abs(hero.x - th.x) < THUNDER_RADIUS && Math.abs(hero.z - th.z) < THUNDER_RADIUS * 0.4) {
            this.applyHit(hero, { damage: th.damage, knockdown: true, heavy: true, dir: hero.x >= th.x ? 1 : -1 }, null);
          }
        }
      }
    }
    this.thunders = this.thunders.filter(th => th.t < THUNDER_DELAY + 5);
  }

  private updateItems() {
    for (const item of this.items) {
      item.t++;
      if (item.y > 0 || item.vy > 0) {
        item.y += item.vy;
        item.vy -= 0.6;
        if (item.y <= 0) {
          item.y = 0;
          item.vy = Math.abs(item.vy) > 2 ? Math.abs(item.vy) * 0.35 : 0;
        }
      }
      const hero = item.t > 20
        ? this.activeHeroes.find(h => !h.isDown && Math.abs(h.x - item.x) < 45 && Math.abs(h.z - item.z) < 30 && h.y < 30)
        : undefined;
      if (hero) {
        if (item.kind === 'pot') {
          hero.magic = Math.min(MAX_MAGIC, hero.magic + 1);
          this.floatingText(item.x, screenY(item.z) - 60, '+MAGIA', '#60a5fa');
          sounds.playSuperReady();
        } else {
          hero.hp = Math.min(hero.maxHp, hero.hp + 30);
          this.floatingText(item.x, screenY(item.z) - 60, '+30 VIDA', '#4ade80');
          sounds.playSelect();
        }
        item.t = 99999;
      }
    }
    this.items = this.items.filter(i => i.t < 1200);
  }

  // --- RENDER ---

  public render(ctx: CanvasRenderingContext2D) {
    if (this.loading) {
      drawLoading(ctx, VIEW_W, VIEW_H);
      return;
    }
    ctx.save();
    if (this.shakeTicks > 0) {
      const amt = this.shakeIntensity * (this.shakeTicks / this.shakeDuration);
      ctx.translate((Math.random() - 0.5) * amt, (Math.random() - 0.5) * amt);
    }

    const readyImage = (entry: SpriteSheetEntry | null) => (entry && entry.status === 'ready' ? entry.image : null);
    drawBackground(ctx, this.level.pantheon, this.level.theme, this.camX, {
      background: readyImage(this.art.background),
      horizonY: this.level.art?.horizonY ?? 0,
      floor: readyImage(this.art.floor),
      platform: this.level.art?.platform
    });

    ctx.save();
    ctx.translate(-Math.round(this.camX), 0);

    // Sombras en el suelo (se encogen con la altura del salto)
    // En cooperativo el que agotó sus vidas desaparece hasta que continúe
    const actors: Actor[] = [...(this.coop ? this.activeHeroes : this.heroes), ...this.monsters, ...this.beasts.filter(b => !b.rider)];
    if (this.boss && !this.boss.removed) actors.push(this.boss);
    for (const a of actors) {
      const s = Math.max(0.4, 1 - a.y / 200);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      const beast = a instanceof Beast ? a : a.mount;
      const w = beast ? beast.def.frameWidth * beast.cfg.scale * 0.32 : a.width * 0.75;
      ctx.ellipse(a.x, screenY(a.z), w * s, 12 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Círculo de luz del colapso de Origen
    const zone = this.boss?.safeZone;
    if (zone && this.boss) {
      const progress = Math.min(1, this.boss.stateTimer / COLLAPSE_TICKS);
      drawTelegraph(ctx, zone.x, screenY(zone.z), COLLAPSE_SAFE_RADIUS, 1, '#fde68a');
      ctx.fillStyle = `rgba(253, 230, 138, ${0.15 + (this.boss.stateTimer % 20 < 10 ? 0.15 : 0)})`;
      ctx.beginPath();
      ctx.ellipse(zone.x, screenY(zone.z), COLLAPSE_SAFE_RADIUS * (1 - progress * 0.15), COLLAPSE_SAFE_RADIUS * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const th of this.thunders) {
      if (th.t < THUNDER_DELAY) drawTelegraph(ctx, th.x, screenY(th.z), THUNDER_RADIUS, th.t / THUNDER_DELAY, th.color);
    }
    for (const item of this.items) {
      if (item.t > 1000 && item.t % 10 < 5) continue; // Parpadea antes de desaparecer
      drawItem(ctx, item.kind, item.x, screenY(item.z, item.y), item.t);
    }

    // Orden por profundidad: lo del fondo primero
    actors.sort((a, b) => a.z - b.z);
    for (const a of actors) {
      if (a instanceof Hero) a.render(ctx, this.coop);
      else if (a instanceof Monster) a.render(ctx);
      else if (a instanceof Boss) a.render(ctx);
      else if (a instanceof Beast) a.render(ctx);
    }
    for (const orb of this.orbs) drawOrb(ctx, orb.x, screenY(orb.z, orb.y), orb.color, orb.t);
    renderParticles(ctx, this.particles);
    ctx.restore();

    // Objetos por delante y partículas de ambiente del reino
    const props = this.props.filter(e => e.status === 'ready').map(e => e.image);
    drawForeground(ctx, props, this.camX, this.levelIndex);
    drawAmbient(ctx, this.level.pantheon, this.tick, this.camX, this.level === FINAL_LEVEL);

    // Destello de la magia
    if (this.magicCast) {
      const t = this.magicCast.t;
      const intensity = t < 40 ? t / 40 * 0.35 : Math.max(0, 0.6 - (t - 40) / 40 * 0.6);
      ctx.fillStyle = this.magicCast.color;
      ctx.globalAlpha = intensity;
      ctx.fillRect(-20, -20, VIEW_W + 40, VIEW_H + 40);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    this.renderHud(ctx);
  }

  // Panel de un jugador: retrato, vidas, vida, vasijas de magia (o aviso para continuar)
  private renderHeroPanel(ctx: CanvasRenderingContext2D, hero: Hero, px: number) {
    const color = PLAYER_COLORS[hero.index];
    ctx.fillStyle = 'rgba(2, 6, 23, 0.7)';
    ctx.beginPath();
    ctx.roundRect(px, 14, 380, 96, 12);
    ctx.fill();
    ctx.strokeStyle = this.coop ? color : 'rgba(251, 191, 36, 0.4)';
    ctx.globalAlpha = this.coop ? 0.6 : 1;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (this.coop && hero.gameOver) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 22px "Cinzel", serif';
      ctx.fillStyle = color;
      ctx.fillText(`${hero.index + 1}P · ${hero.deity.name.toUpperCase()}`, px + 190, 50);
      if (this.tick % 60 < 40) {
        ctx.font = 'bold 15px sans-serif';
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(`¡PULSA ${hero.index === 0 ? 'J' : '1'} PARA CONTINUAR!`, px + 190, 82);
      }
      return;
    }

    drawDeityPortraitIcon(ctx, hero.deity.id, px + 46, 62, 72);
    ctx.font = 'bold 20px "Cinzel", serif';
    ctx.fillStyle = this.coop ? color : '#fde68a';
    ctx.textAlign = 'left';
    ctx.fillText(this.coop ? `${hero.index + 1}P ${hero.deity.name.toUpperCase()}` : hero.deity.name.toUpperCase(), px + 92, 40);
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(`×${hero.lives}`, px + 334, 40);

    // Barra de vida con daño reciente en rojo
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(px + 92, 50, 270, 14);
    ctx.fillStyle = '#b91c1c';
    ctx.fillRect(px + 92, 50, 270 * (hero.displayHp / hero.maxHp), 14);
    const hpGrad = ctx.createLinearGradient(px + 92, 0, px + 362, 0);
    hpGrad.addColorStop(0, '#22c55e');
    hpGrad.addColorStop(1, '#facc15');
    ctx.fillStyle = hpGrad;
    ctx.fillRect(px + 92, 50, 270 * (hero.hp / hero.maxHp), 14);

    // Vasijas de magia
    for (let i = 0; i < MAX_MAGIC; i++) {
      const x = px + 102 + i * 26;
      ctx.fillStyle = i < hero.magic ? '#2563eb' : 'rgba(148, 163, 184, 0.25)';
      ctx.beginPath();
      ctx.ellipse(x, 88, 8, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 4, 74, 8, 5);
    }
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(hero.index === 0 ? 'MAGIA (L)' : 'MAGIA (3)', px + 262, 92);

    // Combo en curso
    if (hero.combo >= 3) {
      const mult = comboMultiplier(hero.combo);
      ctx.font = '900 22px "Cinzel", serif';
      ctx.fillStyle = mult > 1 ? '#fb923c' : '#fde68a';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 6;
      ctx.fillText(`COMBO ${hero.combo}${mult > 1 ? `  ×${mult}` : ''}`, px + 8, 138);
      ctx.shadowBlur = 0;
    }
  }

  private renderHud(ctx: CanvasRenderingContext2D) {
    const hero = this.hero;
    ctx.save();

    this.heroes.forEach((h, i) => this.renderHeroPanel(ctx, h, 16 + i * 396));

    // Puntos (uno por jugador) y nivel
    ctx.textAlign = 'right';
    ctx.font = 'bold 18px "Cinzel", serif';
    this.heroes.forEach((h, i) => {
      ctx.fillStyle = this.coop ? PLAYER_COLORS[h.index] : '#fde68a';
      ctx.fillText(`${this.coop ? `${h.index + 1}P ` : 'PUNTOS '}${String(h.score).padStart(6, '0')}`, VIEW_W - 24, 40 + i * 24);
    });
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`NIVEL ${this.levelIndex + 1} · ${this.level.title.toUpperCase()}`, VIEW_W - 24, 62 + (this.heroes.length - 1) * 24);

    // Barra del jefe
    const boss = this.boss;
    if (boss && !boss.removed && (this.phase === 'boss' || this.phase === 'bossIntro')) {
      const w = 640;
      const x = (VIEW_W - w) / 2;
      ctx.fillStyle = 'rgba(2, 6, 23, 0.75)';
      ctx.fillRect(x - 10, 662, w + 20, 44);
      ctx.textAlign = 'left';
      ctx.font = 'bold 15px "Cinzel", serif';
      ctx.fillStyle = boss.deity.accentColor;
      ctx.fillText(`${boss.deity.name.toUpperCase()} · ${boss.deity.title}`, x, 680);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x, 688, w, 12);
      ctx.fillStyle = '#7f1d1d';
      ctx.fillRect(x, 688, w * (boss.displayHp / boss.maxHp), 12);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x, 688, w * (boss.hp / boss.maxHp), 12);
    }

    // Barra del mini-jefe
    const mini = this.monsters.find(m => m.kind === 'mini' && !m.removed && m.hp > 0);
    if (mini && !(boss && !boss.removed)) {
      const w = 520;
      const x = (VIEW_W - w) / 2;
      ctx.fillStyle = 'rgba(2, 6, 23, 0.75)';
      ctx.fillRect(x - 10, 662, w + 20, 44);
      ctx.textAlign = 'left';
      ctx.font = 'bold 15px "Cinzel", serif';
      ctx.fillStyle = '#fb923c';
      ctx.fillText(`${mini.skin.name.toUpperCase()} · MINI-JEFE`, x, 680);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x, 688, w, 12);
      ctx.fillStyle = '#f97316';
      ctx.fillRect(x, 688, w * (mini.hp / mini.maxHp), 12);
    }

    // Indicador de avance
    if (this.phase === 'play' && !this.waveActive && !this.banner && this.goTimer > 0 && this.goTimer % 40 < 26) {
      ctx.textAlign = 'right';
      ctx.font = '900 40px "Cinzel", serif';
      ctx.fillStyle = '#fbbf24';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 8;
      ctx.fillText('¡ADELANTE! ➜', VIEW_W - 40, 330);
      ctx.shadowBlur = 0;
    }

    // Ayuda de controles al empezar
    if (this.levelIndex === 0 && this.tick < 900) {
      const lines = this.coop
        ? [
            '1P · WASD: mover · J: combo · K: saltar · J+K: giro · L: magia · doble toque A/D: correr',
            '2P · Flechas: mover · 1 (o ,): combo · 2 (o .): saltar · 1+2: giro · 3 (o -): magia · doble toque ←/→: correr'
          ]
        : ['WASD / Flechas: mover · J: combo · K: saltar (J en el aire: tajo) · Doble toque ←/→: correr (J: embestida) · J+K: giro · L: magia · Esc: pausa'];
      const h = 12 + lines.length * 22;
      ctx.globalAlpha = Math.min(1, (900 - this.tick) / 120);
      ctx.fillStyle = 'rgba(2, 6, 23, 0.7)';
      ctx.fillRect(0, VIEW_H - h, VIEW_W, h);
      ctx.textAlign = 'center';
      ctx.font = '14px sans-serif';
      lines.forEach((line, i) => {
        ctx.fillStyle = this.coop ? PLAYER_COLORS[i] : '#e2e8f0';
        ctx.fillText(line, VIEW_W / 2, VIEW_H - h + 24 + i * 22);
      });
      ctx.globalAlpha = 1;
    }

    // Cartel central
    if (this.banner) {
      const b = this.banner;
      const fade = Math.min(1, b.t / 20, (b.duration - b.t) / 25);
      ctx.globalAlpha = Math.max(0, fade);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, 230, VIEW_W, 120);
      ctx.textAlign = 'center';
      ctx.font = '900 46px "Cinzel", serif';
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 18;
      ctx.fillText(b.title, VIEW_W / 2, 290);
      ctx.shadowBlur = 0;
      ctx.font = '18px "Cinzel", serif';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(b.subtitle, VIEW_W / 2, 326);
      ctx.globalAlpha = 1;
    }

    if (this.magicCast && this.magicCast.t < 60) {
      ctx.textAlign = 'center';
      ctx.font = '900 54px "Cinzel", serif';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = this.magicCast.color;
      ctx.shadowBlur = 24;
      ctx.fillText(`¡${this.magicCast.name.toUpperCase()}!`, VIEW_W / 2, 200);
      ctx.shadowBlur = 0;
    }

    const overlay = (title: string, color: string, lines: string[]) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.textAlign = 'center';
      ctx.font = '900 64px "Cinzel", serif';
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
      ctx.fillText(title, VIEW_W / 2, 300);
      ctx.shadowBlur = 0;
      ctx.font = '20px "Cinzel", serif';
      ctx.fillStyle = '#e2e8f0';
      lines.forEach((line, i) => ctx.fillText(line, VIEW_W / 2, 360 + i * 34));
    };

    const scores = this.heroes.map(h => (this.coop ? `${h.index + 1}P ${h.score}` : `${h.score}`)).join('  ·  ');
    const recordLine = this.record ? (this.record.isNew ? '¡NUEVO RÉCORD!' : `Récord: ${this.record.best}`) : '';
    if (this.phase === 'levelClear' && this.results && this.phaseTimer >= 110) this.renderResults(ctx);
    if (this.phase === 'gameOver') {
      // ¿Continuar? con cuenta regresiva grande (el botón para tocar lo pone ArcadeMode encima)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.textAlign = 'center';
      ctx.font = '900 60px "Cinzel", serif';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('¿CONTINUAR?', VIEW_W / 2, 220);
      const n = Math.max(0, Math.ceil(this.continueTimer / 60) - 1);
      const pulse = 1 + (this.continueTimer % 60) / 60 * 0.25;
      ctx.font = `900 ${Math.round(150 * pulse)}px "Cinzel", serif`;
      ctx.fillStyle = n <= 3 ? '#ef4444' : '#ffffff';
      ctx.fillText(String(n), VIEW_W / 2, 400);
      ctx.font = '20px "Cinzel", serif';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(`Puntos: ${scores}  ·  Continuar cuesta la mitad`, VIEW_W / 2, 470);
    } else if (this.phase === 'finalOver') {
      overlay('GAME OVER', '#ef4444', [`Puntos finales: ${scores}`, recordLine]);
    } else if (this.phase === 'victory') {
      overlay(this.coop ? '¡CAMPEONES DEL COSMOS!' : '¡CAMPEÓN DEL COSMOS!', '#fbbf24', [
        this.coop
          ? `${this.heroes.map(h => h.deity.name).join(' y ')} vencieron a los cuatro panteones y al mismo Origen`
          : `${hero.deity.name} venció a los cuatro panteones y al mismo Origen`,
        `Puntos finales: ${scores}`,
        recordLine
      ]);
    } else if (this.paused) {
      overlay('PAUSA', '#fbbf24', ['Esc: continuar  ·  Q: salir al menú']);
    }

    ctx.restore();
  }

  // Resultados del nivel: estadísticas, bonos y calificación de cada jugador
  private renderResults(ctx: CanvasRenderingContext2D) {
    const results = this.results ?? [];
    const t = this.phaseTimer - 110;
    ctx.fillStyle = 'rgba(2, 6, 23, 0.82)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.font = '900 44px "Cinzel", serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(this.level === FINAL_LEVEL ? 'EL TELAR DEL COSMOS' : `NIVEL ${this.levelIndex + 1} COMPLETADO`, VIEW_W / 2, 110);
    const colW = VIEW_W / results.length;
    results.forEach((r, i) => {
      const cx = colW * i + colW / 2;
      const rows: [string, string][] = [
        ['Monstruos derrotados', String(r.kills)],
        ['Tiempo', `${Math.floor(r.secs / 60)}:${String(r.secs % 60).padStart(2, '0')}  (+${r.timeBonus})`],
        ['Sin perder vidas', r.noDeathBonus ? `+${r.noDeathBonus}` : `${r.deaths} perdidas`],
        ['Combo más alto', `${r.maxCombo}  (+${r.comboBonus})`]
      ];
      ctx.font = 'bold 20px "Cinzel", serif';
      ctx.fillStyle = this.coop ? PLAYER_COLORS[r.hero.index] : '#e2e8f0';
      ctx.fillText(r.hero.deity.name.toUpperCase(), cx, 170);
      rows.forEach(([label, value], k) => {
        if (t < 20 + k * 25) return; // Van apareciendo uno por uno
        const y = 220 + k * 44;
        ctx.font = '18px sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'right';
        ctx.fillText(label, cx - 10, y);
        ctx.fillStyle = '#fde68a';
        ctx.textAlign = 'left';
        ctx.fillText(value, cx + 10, y);
        ctx.textAlign = 'center';
      });
      if (t >= 140) {
        const colors = { S: '#fbbf24', A: '#4ade80', B: '#60a5fa', C: '#94a3b8' };
        ctx.font = '900 110px "Cinzel", serif';
        ctx.fillStyle = colors[r.rank];
        ctx.shadowColor = colors[r.rank];
        ctx.shadowBlur = 24;
        ctx.fillText(r.rank, cx, 520);
        ctx.shadowBlur = 0;
        ctx.font = 'bold 18px "Cinzel", serif';
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(`Puntos: ${r.hero.score}`, cx, 565);
      }
    });
    if (t > 90 && this.tick % 60 < 40) {
      ctx.font = '16px sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText('Ataque para seguir', VIEW_W / 2, 650);
    }
  }
}
