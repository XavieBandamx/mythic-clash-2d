import { DEITIES } from '../game/deities';
import type { DeityData } from '../game/deities';
import { sounds } from '../game/sound';
import { renderParticles, spawnBloodBurst, updateParticles } from '../game/core';
import type { Difficulty, Particle } from '../game/core';
import { GRID_4X4_ANIMATIONS, drawSpriteFrame, getSpriteSheetConfig, loadSpriteSheet } from '../game/sprites';
import type { SpriteSheetConfig, SpriteSheetEntry } from '../game/sprites';
import { drawDeityPortraitIcon } from '../game/portraits';
import { BOSS_CAM_X, BOSS_SPECIALS, LEVELS, MONSTER_SPRITES, MONSTER_STATS, THIEF_SKIN, buildWaves } from './levels';
import type { BossSpecial, LevelDef, MonsterKind, MonsterSkin, MonsterStats, Wave, WaveSpawn } from './levels';
import { DEPTH, VIEW_H, VIEW_W, drawBackground, drawItem, drawMonsterOutlined, drawOrb, drawTelegraph, screenY } from './draw';
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
}

interface StrikeSpec {
  front: number; // Alcance hacia donde mira
  back: number;  // Alcance hacia la espalda (giro)
  damage: number;
  knockdown: boolean;
  heavy: boolean;
}

type ActorState =
  | 'idle' | 'walk' | 'run' | 'attack' | 'jump' | 'jumpAttack' | 'dashAttack' | 'spin' | 'magic'
  | 'windup' | 'strike' | 'recover' | 'special' | 'hurt' | 'knockdown' | 'down' | 'getup' | 'dead'
  | 'flee' | 'intro';

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

  protected tickTimers() {
    this.stateTimer++;
    if (this.invuln > 0) this.invuln--;
    if (this.flash > 0) this.flash--;
  }
}

// Fila y cuadro de la hoja de sprites de un dios según su estado (héroe y jefes comparten la lógica)
function godFrame(actor: Actor, cfg: SpriteSheetConfig, clock: number, attackDuration: number): { row: number; frame: number } {
  const a = cfg.animations;
  const cycle = (anim: typeof a.idle, speed: number = 1) => Math.floor((clock * speed) / anim.frameDuration) % anim.frames;
  const progress = (duration: number) => Math.min(a.attack.frames - 1, Math.floor((actor.stateTimer / duration) * a.attack.frames));
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
      return { row: a.attack.row, frame: 0 };
    case 'jumpAttack':
    case 'dashAttack':
    case 'spin':
      return { row: a.attack.row, frame: actor.stateTimer < 3 ? 1 : 2 };
    case 'magic':
    case 'special':
      return { row: a.attack.row, frame: actor.stateTimer < 20 ? 1 : 2 };
    case 'recover':
      return { row: a.attack.row, frame: a.attack.frames - 1 };
    case 'hurt':
      return { row: a.hit.row, frame: 0 };
    case 'knockdown':
      return { row: a.hit.row, frame: actor.vy > 0 ? 1 : 2 };
    case 'down':
    case 'dead':
      return { row: a.hit.row, frame: a.hit.frames - 1 };
    case 'getup':
      return { row: actor.stateTimer < 9 ? a.hit.row : a.idle.row, frame: actor.stateTimer < 9 ? a.hit.frames - 1 : 0 };
    default:
      return { row: a.idle.row, frame: cycle(a.idle) };
  }
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
  public dmgMul: number;
  public defMul: number;
  public comboStep: number = 0;

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
    this.displayHp = this.hp;
    // Las estadísticas del dios (1-5) definen velocidad, daño y resistencia
    this.walkSpeed = 2.6 + deity.stats.speed * 0.35;
    this.dmgMul = 0.8 + deity.stats.attack * 0.1;
    this.defMul = 1.2 - deity.stats.defense * 0.08;
  }

  private get comboDuration(): number {
    return this.comboStep === 3 ? 24 : 17;
  }

  public receiveHit(hit: HitInfo): boolean {
    if (this.state === 'magic' || this.state === 'spin') return false;
    const landed = super.receiveHit({ ...hit, damage: hit.damage * this.defMul });
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

    // Al quedarse sin vida y terminar la caída se gasta una vida
    if (this.state === 'down' && this.hp <= 0) {
      if (this.stateTimer >= 40) {
        this.lives--;
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
        }
        if (this.integrate()) {
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

  public finishMagic() {
    if (this.state === 'magic') this.setState('idle');
  }

  public advanceMagicPose() {
    this.stateTimer++;
    this.animClock++;
  }

  public render(ctx: CanvasRenderingContext2D, showTag: boolean = false) {
    const blink = this.invuln > 0 && this.state !== 'spin' && this.state !== 'magic' && Math.floor(this.invuln / 4) % 2 === 0;
    const feetY = screenY(this.z, this.y);

    // En cooperativo, distintivo 1P / 2P sobre la cabeza para no confundirse
    if (showTag && !this.isDown) {
      const tagY = feetY - this.height - 34;
      ctx.fillStyle = PLAYER_COLORS[this.index];
      ctx.beginPath();
      ctx.moveTo(this.x - 7, tagY + 14);
      ctx.lineTo(this.x + 7, tagY + 14);
      ctx.lineTo(this.x, tagY + 22);
      ctx.fill();
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${this.index + 1}P`, this.x, tagY + 10);
    }

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
    const { row, frame } = godFrame(this, this.cfg, this.animClock, this.comboDuration);
    drawSpriteFrame(ctx, this.sheet, this.cfg, row, frame, this.x, feetY, this.facing, {
      flash: this.flash > 0,
      alpha: blink ? 0.45 : 1
    });
  }
}

const monsterSpriteSrc = (spriteId: string) => `${import.meta.env.BASE_URL}sprites/monsters/${spriteId}.png`;

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
    return !this.stats.armor || hit.heavy || hit.magic === true;
  }

  protected flinchesFrom(hit: HitInfo): boolean {
    return !this.stats.armor || hit.heavy;
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
    switch (this.state) {
      case 'windup':
        this.vx = 0;
        this.vz = 0;
        if (this.stateTimer >= this.stats.windup) {
          this.setState('strike');
          if (this.kind === 'runner') this.vx = this.facing * 7;
          if (this.kind === 'brute') sounds.playHeavySwing();
          else sounds.playSwing();
        }
        return;
      case 'strike':
        this.vx *= 0.85;
        this.integrate();
        if (this.stateTimer >= 3 && this.stateTimer <= 9) {
          world.enemyStrike(this, {
            front: this.stats.reach,
            back: 10,
            damage: this.damage,
            knockdown: this.kind === 'brute',
            heavy: this.kind === 'brute'
          });
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
      desiredX = hero.x + side * this.stats.reach * 0.75;
      desiredZ = hero.z;
    } else {
      desiredX = hero.x + side * (230 + this.flank * 40);
      desiredZ = clamp(hero.z + this.flank * 60, 0, DEPTH);
    }
    // Siempre buscan su sitio dentro de la pantalla: nadie ataca desde fuera de cuadro
    desiredX = clamp(desiredX, world.camX + 60, world.camX + VIEW_W - 60);
    const dx = desiredX - this.x;
    const dz = desiredZ - this.z;
    const speed = this.stats.speed * (this.entered ? 1 : 1.4);
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
      Math.abs(hero.x - this.x) <= this.stats.reach + 10 &&
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
    if (this.sprite && this.sprite.sheet.status === 'ready') {
      const { row, frame } = this.spriteFrame(this.sprite.cfg);
      drawSpriteFrame(ctx, this.sprite.sheet, this.sprite.cfg, row, frame, this.x, screenY(this.z, this.y), this.facing, {
        flash: this.flash > 0,
        alpha
      });
      return;
    }
    drawMonsterOutlined(ctx, {
      kind: this.kind,
      skin: this.skin,
      height: this.height,
      x: this.x,
      y: screenY(this.z, this.y),
      facing: this.facing,
      pose,
      t: this.animT,
      progress,
      flash: this.flash > 0,
      alpha
    });
  }
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

  constructor(deity: DeityData, x: number, z: number, hp: number, dmgMul: number, introTargetX: number) {
    super(x, z, hp, 80, 200);
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

  // Solo la magia lo derriba; los golpes fuertes a veces lo hacen retroceder
  protected canBeKnockedDown(hit: HitInfo): boolean {
    return hit.magic === true;
  }

  protected flinchesFrom(hit: HitInfo): boolean {
    return this.state !== 'special' && hit.heavy && Math.random() < 0.4;
  }

  public update(world: ArcadeGame) {
    this.tickTimers();
    this.animClock++;
    if (this.cooldown > 0) this.cooldown--;
    if (this.specialCooldown > 0) this.specialCooldown--;
    if (this.displayHp > this.hp) this.displayHp = Math.max(this.hp, this.displayHp - 1.2);
    if (this.updateDownStates()) return;

    this.target = world.pickTarget(this, this.target);
    const hero = this.target;
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
        this.vx = 0;
        this.vz = 0;
        if (this.stateTimer >= 16) {
          this.setState('strike');
          sounds.playHeavySwing();
        }
        return;
      case 'strike': {
        this.vx = this.facing * Math.max(0, 3 - this.stateTimer * 0.3);
        this.integrate();
        const finisher = this.comboHits >= 1;
        if (this.stateTimer >= 3 && this.stateTimer <= 9) {
          world.enemyStrike(this, {
            front: 130,
            back: 20,
            damage: this.damage * (finisher ? 1.5 : 1),
            knockdown: finisher,
            heavy: finisher
          });
        }
        if (this.stateTimer >= 14) {
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
    if (heroAvailable && this.specialCooldown <= 0) {
      this.currentSpecial = this.specials[Math.floor(Math.random() * this.specials.length)];
      this.facing = hero.x >= this.x ? 1 : -1;
      this.setState('special');
      this.specialCooldown = this.enraged ? 240 : 360;
      sounds.playSuperActivation();
      return;
    }

    const side = this.x < hero.x ? -1 : 1;
    const desiredX = heroAvailable ? hero.x + side * 110 : hero.x + side * 300;
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

    if (heroAvailable && this.cooldown <= 0 && Math.abs(hero.x - this.x) <= 145 && Math.abs(hero.z - this.z) <= Z_REACH) {
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
      default:
        this.setState('recover');
    }
  }

  public render(ctx: CanvasRenderingContext2D) {
    const feetY = screenY(this.z, this.y);
    const alpha = this.state === 'dead' ? Math.max(0, 1 - this.stateTimer / 50) : 1;

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
    const { row, frame } = godFrame(this, this.cfg, this.animClock, 14);
    drawSpriteFrame(ctx, this.sheet, this.cfg, row, frame, this.x, feetY, this.facing, {
      scale: 1.2,
      flash: this.flash > 0,
      alpha
    });
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
const THUNDER_RADIUS = 75;

type Phase = 'play' | 'bossIntro' | 'boss' | 'levelClear' | 'gameOver' | 'victory';

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
    this.levelIndex = index;
    this.level = LEVELS[index];
    this.waves = buildWaves(index);
    this.waveIndex = 0;
    this.waveActive = false;
    this.pending = [];
    this.monsters = [];
    this.boss = null;
    this.bossDown = false;
    this.orbs = [];
    this.thunders = [];
    this.items = [];
    this.particles = [];
    this.camX = 0;
    this.phase = 'play';
    this.phaseTimer = 0;
    this.goTimer = 240;

    // En cooperativo, el 2P entra un poco atrás y más al frente
    for (const hero of this.heroes) {
      hero.x = this.coop ? (hero.index === 0 ? 260 : 170) : 220;
      hero.z = DEPTH * (this.coop ? (hero.index === 0 ? 0.4 : 0.85) : 0.6);
      hero.y = 0;
      hero.vx = hero.vz = hero.vy = 0;
      if (!hero.gameOver) hero.setState('idle');
      hero.invuln = 60;
    }

    // El jefe nunca es el dios que controla alguno de los jugadores
    const playerIds = this.heroes.map(h => h.deity.id);
    const bossId = this.level.bossOrder.find(id => !playerIds.includes(id)) ?? this.level.bossOrder[0];
    this.bossDeity = DEITIES.find(d => d.id === bossId) ?? DEITIES[0];
    loadSpriteSheet(getSpriteSheetConfig(this.bossDeity).src);
    // Escenario pintado del nivel, si lo tiene (se carga con la misma caché que los sprites)
    const loadArt = (file?: string) => (file ? loadSpriteSheet(`${import.meta.env.BASE_URL}backgrounds/${file}`) : null);
    this.art = { background: loadArt(this.level.art?.background), floor: loadArt(this.level.art?.floor) };

    for (const skin of [...Object.values(this.level.skins), THIEF_SKIN]) {
      if (skin.spriteId && MONSTER_SPRITES[skin.spriteId]) loadSpriteSheet(monsterSpriteSrc(skin.spriteId));
    }

    this.showBanner(`NIVEL ${index + 1} · ${this.level.pantheon.toUpperCase()}`, `${this.level.title} — ${this.level.subtitle}`, '#fbbf24', 220);
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

  private spawnMonster(kind: MonsterKind, side: 'left' | 'right', zFrac: number): Monster {
    const x = side === 'right' ? this.camX + VIEW_W + 60 : this.camX - 60;
    const skin = kind === 'thief' ? THIEF_SKIN : this.level.skins[kind];
    const monster = new Monster(kind, skin, x, zFrac * DEPTH, this.hpMul, this.dmgMul);
    this.monsters.push(monster);
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
        this.spawnMonster(p.spawn.kind, p.spawn.side, p.spawn.zFrac);
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
    const hp = Math.round(300 * (1 + 0.2 * this.levelIndex) * DIFFICULTY_HP[this.difficulty] * (this.coop ? COOP_BOSS_HP_MUL : 1));
    this.boss = new Boss(this.bossDeity, this.camX + VIEW_W + 120, DEPTH * 0.5, hp, this.dmgMul, this.camX + VIEW_W * 0.72);
    this.showBanner(`JEFE · ${this.bossDeity.name.toUpperCase()}`, this.bossDeity.title, this.bossDeity.accentColor, 180);

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

  private floatingText(x: number, y: number, text: string, color: string) {
    this.particles.push({ x, y, vx: 0, vy: -1.2, radius: 0, color, alpha: 1, decay: 0.02, type: 'text', text });
  }

  // source: el héroe que golpea (se lleva los puntos); null si el golpe es de un enemigo
  private applyHit(target: Actor, hit: HitInfo, source: Hero | null): boolean {
    const fromHero = source !== null;
    if (!target.receiveHit(hit)) return false;

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

  public heroStrike(hero: Hero, spec: StrikeSpec) {
    const x0 = hero.facing === 1 ? hero.x - spec.back : hero.x - spec.front;
    const x1 = hero.facing === 1 ? hero.x + spec.front : hero.x + spec.back;
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
      if (attacker.hitTargets.has(hero) || !hero.canBeHit() || hero.y > 80) continue;
      if (Math.abs(hero.z - attacker.z) > Z_REACH + 6) continue;
      if (hero.x + hero.width / 2 < x0 || hero.x - hero.width / 2 > x1) continue;
      attacker.hitTargets.add(hero);
      this.applyHit(hero, { damage: spec.damage, knockdown: spec.knockdown, heavy: spec.heavy, dir: attacker.facing }, null);
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

  public summonMinions(boss: Boss) {
    this.showBanner(`¡${boss.deity.name.toUpperCase()} INVOCA REFUERZOS!`, 'Derrótalos para ganar vida y magia', '#ef4444', 150);
    const minions = [this.spawnMonster('grunt', 'left', 0.25), this.spawnMonster('grunt', 'right', 0.8)];
    if (this.levelIndex >= 2) minions.push(this.spawnMonster('runner', 'left', 0.7));
    for (const m of minions) m.reinforcement = true;
  }

  // Puntos, comida ocasional y, si era un refuerzo del jefe, vida y magia al momento (para quien lo derrotó)
  private defeatMonster(m: Monster, hero: Hero) {
    if (m.scored) return;
    m.scored = true;
    const labelY = screenY(m.z, m.y) - m.height - 20;
    hero.score += m.stats.score;
    this.floatingText(m.x, labelY, `+${m.stats.score}`, '#fde68a');
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
  public step(inputs: ArcadeInput | ArcadeInput[]) {
    if (this.paused) return;
    const list = Array.isArray(inputs) ? inputs : [inputs];
    const inputFor = (hero: Hero) => list[hero.index] ?? EMPTY_INPUT;
    this.tick++;
    if (this.banner && ++this.banner.t >= this.banner.duration) this.banner = null;
    if (this.shakeTicks > 0) this.shakeTicks--;
    if (this.goTimer > 0) this.goTimer--;

    if (this.phase === 'gameOver') {
      updateParticles(this.particles);
      if (list.some(i => i.attack)) this.continueGame();
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
    if (this.heroes.every(h => h.gameOver)) {
      this.phase = 'gameOver';
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
      this.showBanner(`¡${this.boss.deity.name.toUpperCase()} HA CAÍDO!`, this.levelIndex + 1 < LEVELS.length ? 'Nivel completado · +5000 puntos' : 'El torneo de los dioses es tuyo', '#fbbf24', 240);
      for (const m of this.monsters) m.receiveHit({ damage: 999, knockdown: true, heavy: true, dir: m.x >= this.boss.x ? 1 : -1, magic: true });
      this.orbs = [];
      this.thunders = [];
    } else if (this.phase === 'levelClear' && this.phaseTimer >= 270) {
      if (this.levelIndex + 1 < LEVELS.length) {
        // Recompensa entre niveles: media vida y una vasija de magia
        for (const hero of this.activeHeroes) {
          hero.hp = Math.min(hero.maxHp, hero.hp + hero.maxHp * 0.5);
          hero.magic = Math.min(MAX_MAGIC, hero.magic + 1);
        }
        this.startLevel(this.levelIndex + 1);
      } else {
        this.phase = 'victory';
        this.phaseTimer = 0;
        sounds.playVictory();
      }
    }
  }

  private continueGame() {
    for (const hero of this.heroes) this.continueHero(hero);
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
    ctx.save();
    if (this.shakeTicks > 0) {
      const amt = this.shakeIntensity * (this.shakeTicks / this.shakeDuration);
      ctx.translate((Math.random() - 0.5) * amt, (Math.random() - 0.5) * amt);
    }

    const readyImage = (entry: SpriteSheetEntry | null) => (entry && entry.status === 'ready' ? entry.image : null);
    drawBackground(ctx, this.level.pantheon, this.level.theme, this.camX, {
      background: readyImage(this.art.background),
      horizonY: this.level.art?.horizonY ?? 0,
      floor: readyImage(this.art.floor)
    });

    ctx.save();
    ctx.translate(-Math.round(this.camX), 0);

    // Sombras en el suelo (se encogen con la altura del salto)
    // En cooperativo el que agotó sus vidas desaparece hasta que continúe
    const actors: Actor[] = [...(this.coop ? this.activeHeroes : this.heroes), ...this.monsters];
    if (this.boss && !this.boss.removed) actors.push(this.boss);
    for (const a of actors) {
      const s = Math.max(0.4, 1 - a.y / 200);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(a.x, screenY(a.z), a.width * 0.75 * s, 12 * s, 0, 0, Math.PI * 2);
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
    }
    for (const orb of this.orbs) drawOrb(ctx, orb.x, screenY(orb.z, orb.y), orb.color, orb.t);
    renderParticles(ctx, this.particles);
    ctx.restore();

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
    if (this.phase === 'gameOver') {
      overlay('GAME OVER', '#ef4444', [`Puntos: ${scores}`, `${this.coop ? 'J o 1' : 'J'}: continuar con 3 vidas  ·  Esc: salir al menú`]);
    } else if (this.phase === 'victory') {
      overlay(this.coop ? '¡CAMPEONES DEL TORNEO!' : '¡CAMPEÓN DEL TORNEO!', '#fbbf24', [
        this.coop
          ? `${this.heroes.map(h => h.deity.name).join(' y ')} vencieron a los cuatro panteones`
          : `${hero.deity.name} venció a los cuatro panteones`,
        `Puntos finales: ${scores}`,
        `${this.coop ? 'J o 1' : 'J'}: volver al menú`
      ]);
    } else if (this.paused) {
      overlay('PAUSA', '#fbbf24', ['Esc: continuar  ·  Q: salir al menú']);
    }

    ctx.restore();
  }
}
