// --- MOTOR DE AUDIO PROCEDURAL (BGM & SFX) ---
export class SoundEngine {
  private ctx: AudioContext | null = null;
  public isMuted: boolean = false;
  public sfxVolume: number = 0.8;
  public musicVolume: number = 0.5;

  private bgmInterval: number | null = null;
  private currentBGM: 'NONE' | 'MENU' | 'BATTLE' = 'NONE';
  private stepCounter: number = 0;

  public init() {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public playNav() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(360, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(540, this.ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.09 * this.sfxVolume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.06);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.06);
  }

  public playSelect() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc1.type = 'triangle';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(440, this.ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.12);
    osc2.frequency.setValueAtTime(660, this.ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(1320, this.ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.14 * this.sfxVolume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.14);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);
    osc1.start();
    osc2.start();
    osc1.stop(this.ctx.currentTime + 0.14);
    osc2.stop(this.ctx.currentTime + 0.14);
  }

  public playJump() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(450, this.ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.18 * this.sfxVolume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  public playStep() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(95, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.06 * this.sfxVolume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  public playSwing() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(460, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.14 * this.sfxVolume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.09);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.09);
  }

  public playHeavySwing() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(70, this.ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0.22 * this.sfxVolume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.16);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.16);
  }

  public playHitLight() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.26 * this.sfxVolume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  public playHitHeavy() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(28, this.ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.42 * this.sfxVolume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.25);
  }

  public playHurt() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.2 * this.sfxVolume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.14);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.14);
  }

  public playBlock() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(1020, this.ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(680, this.ctx.currentTime + 0.16);
    osc2.frequency.setValueAtTime(1540, this.ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(820, this.ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.32 * this.sfxVolume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.16);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);
    osc1.start();
    osc2.start();
    osc1.stop(this.ctx.currentTime + 0.16);
    osc2.stop(this.ctx.currentTime + 0.16);
  }

  public playSuperReady() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const startTime = this.ctx!.currentTime + idx * 0.055;
      gain.gain.setValueAtTime(0.18 * this.sfxVolume, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.28);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.28);
    });
  }

  public playSuperActivation() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(920, this.ctx.currentTime + 0.28);
    gain.gain.setValueAtTime(0.38 * this.sfxVolume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);

    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(95, this.ctx.currentTime + 0.1);
    subOsc.frequency.exponentialRampToValueAtTime(28, this.ctx.currentTime + 0.65);
    subGain.gain.setValueAtTime(0.48 * this.sfxVolume, this.ctx.currentTime + 0.1);
    subGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.65);
    subOsc.connect(subGain);
    subGain.connect(this.ctx.destination);
    subOsc.start(this.ctx.currentTime + 0.1);
    subOsc.stop(this.ctx.currentTime + 0.65);
  }

  public playThunder() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(420, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(32, this.ctx.currentTime + 0.55);
    gain.gain.setValueAtTime(0.48 * this.sfxVolume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.55);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.55);
  }

  public playSolarBeam() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(980, this.ctx.currentTime + 0.45);
    gain.gain.setValueAtTime(0.4 * this.sfxVolume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.52);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.52);
  }

  public playVictory() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const chord = [392, 493.88, 587.33, 783.99];
    chord.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const startTime = this.ctx!.currentTime + idx * 0.08;
      gain.gain.setValueAtTime(0.26 * this.sfxVolume, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.25);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(startTime);
      osc.stop(startTime + 1.25);
    });
  }

  public playKO() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(85, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(20, this.ctx.currentTime + 1.4);
    gain.gain.setValueAtTime(0.58 * this.sfxVolume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.4);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 1.4);
  }

  public playBGM(type: 'MENU' | 'BATTLE') {
    if (this.currentBGM === type) return;
    this.stopBGM();
    this.init();
    if (!this.ctx) return;

    this.currentBGM = type;
    this.stepCounter = 0;
    const intervalMs = type === 'MENU' ? 320 : 125;

    const menuScale = [220, 261.63, 293.66, 329.63, 349.23, 440, 523.25];
    const battleBass = [73.42, 73.42, 87.31, 98.0, 73.42, 110.0, 98.0, 87.31];
    const battleLead = [293.66, 349.23, 440.0, 523.25, 587.33, 523.25, 440.0, 392.0];

    this.bgmInterval = window.setInterval(() => {
      if (this.isMuted || !this.ctx || this.ctx.state === 'suspended') return;
      const t = this.ctx.currentTime;
      this.stepCounter++;

      if (type === 'MENU') {
        if (this.stepCounter % 8 === 0) {
          const bass = this.ctx.createOscillator();
          const bGain = this.ctx.createGain();
          bass.type = 'sine';
          bass.frequency.value = 110;
          bGain.gain.setValueAtTime(0.08 * this.musicVolume, t);
          bGain.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
          bass.connect(bGain);
          bGain.connect(this.ctx.destination);
          bass.start(t);
          bass.stop(t + 2.4);
        }

        const noteIdx = (this.stepCounter * 3) % menuScale.length;
        const harp = this.ctx.createOscillator();
        const hGain = this.ctx.createGain();
        harp.type = 'triangle';
        harp.frequency.value = menuScale[noteIdx];
        hGain.gain.setValueAtTime(0.06 * this.musicVolume, t);
        hGain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
        harp.connect(hGain);
        hGain.connect(this.ctx.destination);
        harp.start(t);
        harp.stop(t + 0.65);
      } else {
        const step = this.stepCounter % 16;
        if (step % 4 === 0) {
          const kick = this.ctx.createOscillator();
          const kGain = this.ctx.createGain();
          kick.type = 'sine';
          kick.frequency.setValueAtTime(125, t);
          kick.frequency.exponentialRampToValueAtTime(32, t + 0.12);
          kGain.gain.setValueAtTime(0.25 * this.musicVolume, t);
          kGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
          kick.connect(kGain);
          kGain.connect(this.ctx.destination);
          kick.start(t);
          kick.stop(t + 0.14);
        }

        if (step % 2 === 1) {
          const hh = this.ctx.createOscillator();
          const hGain = this.ctx.createGain();
          hh.type = 'square';
          hh.frequency.setValueAtTime(3400, t);
          hh.frequency.exponentialRampToValueAtTime(1100, t + 0.035);
          hGain.gain.setValueAtTime(0.045 * this.musicVolume, t);
          hGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
          hh.connect(hGain);
          hGain.connect(this.ctx.destination);
          hh.start(t);
          hh.stop(t + 0.04);
        }

        const bassFreq = battleBass[step % battleBass.length];
        const bOsc = this.ctx.createOscillator();
        const bGain = this.ctx.createGain();
        bOsc.type = 'sawtooth';
        bOsc.frequency.value = bassFreq;
        bGain.gain.setValueAtTime(0.13 * this.musicVolume, t);
        bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
        bOsc.connect(bGain);
        bGain.connect(this.ctx.destination);
        bOsc.start(t);
        bOsc.stop(t + 0.11);

        if (step % 2 === 0) {
          const leadFreq = battleLead[(Math.floor(this.stepCounter / 2)) % battleLead.length];
          const lOsc = this.ctx.createOscillator();
          const lGain = this.ctx.createGain();
          lOsc.type = 'triangle';
          lOsc.frequency.value = leadFreq;
          lGain.gain.setValueAtTime(0.09 * this.musicVolume, t);
          lGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          lOsc.connect(lGain);
          lGain.connect(this.ctx.destination);
          lOsc.start(t);
          lOsc.stop(t + 0.22);
        }
      }
    }, intervalMs);
  }

  public stopBGM() {
    if (this.bgmInterval !== null) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
    this.currentBGM = 'NONE';
  }
}

export const sounds = new SoundEngine();
