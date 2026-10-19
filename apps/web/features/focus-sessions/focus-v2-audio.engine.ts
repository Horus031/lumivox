import type { FocusV2Cue } from "./focus-v2-audio.cues";
import type { FocusV2AudioSound } from "./focus-v2-audio.settings";
import { clampAudioPercent } from "./focus-v2-audio.settings";

// Browser-only Web Audio synthesizer. No network, media files, analytics or microphone.
// Constructing it does not create an AudioContext: unlock() MUST be called from a user gesture.
export class FocusV2AudioEngine {
  private context: AudioContext | null = null;
  private ambientOutput: GainNode | null = null;
  private cueOutput: GainNode | null = null;
  private playingSources: AudioScheduledSourceNode[] = [];
  private playingNodes: AudioNode[] = [];
  private sound: FocusV2AudioSound | null = null;
  private destroyed = false;

  async unlock(): Promise<void> {
    if (this.destroyed) throw new Error("Audio engine was closed.");
    if (typeof AudioContext === "undefined") throw new Error("Web Audio is not supported in this browser.");
    if (!this.context) {
      const context = new AudioContext();
      this.context = context;
      this.ambientOutput = context.createGain();
      this.ambientOutput.gain.value = 0;
      this.ambientOutput.connect(context.destination);
      this.cueOutput = context.createGain();
      this.cueOutput.gain.value = 0;
      this.cueOutput.connect(context.destination);
    }
    if (this.context.state !== "running") await this.context.resume();
    if (this.context.state !== "running") throw new Error("Audio playback is blocked by your browser.");
  }

  isUnlocked(): boolean {
    return !this.destroyed && this.context?.state === "running";
  }

  setAmbientVolume(volume: number, muted: boolean): void {
    if (!this.context || !this.ambientOutput) return;
    const gain = muted ? 0 : clampAudioPercent(volume) / 100 * 0.48;
    this.ambientOutput.gain.setTargetAtTime(gain, this.context.currentTime, 0.035);
  }

  setCueVolume(volume: number, enabled: boolean): void {
    if (!this.context || !this.cueOutput) return;
    this.cueOutput.gain.setTargetAtTime(enabled ? clampAudioPercent(volume) / 100 * 0.24 : 0,
      this.context.currentTime, 0.02);
  }

  playAmbient(sound: FocusV2AudioSound): void {
    if (!this.isUnlocked() || !this.context || !this.ambientOutput) return;
    if (this.sound === sound) return;
    this.stopAmbient();
    const context = this.context;
    this.sound = sound;

    if (sound === "ambient_pad") {
      for (const [index, frequency] of [196, 246.94, 293.66, 392].entries()) {
        const oscillator = context.createOscillator();
        oscillator.type = index % 2 === 0 ? "sine" : "triangle";
        oscillator.frequency.value = frequency;
        oscillator.detune.value = index % 2 === 0 ? -3 : 3;
        const localGain = context.createGain();
        localGain.gain.value = 0.11;
        oscillator.connect(localGain);
        localGain.connect(this.ambientOutput);
        oscillator.start();
        this.playingSources.push(oscillator);
        this.playingNodes.push(localGain);
      }
      return;
    }

    const buffer = this.createNoiseBuffer(context, sound === "pink" ? "pink" : sound === "brown" || sound === "ocean" ? "brown" : "white");
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    let tail: AudioNode = source;
    if (sound === "rain") {
      const highpass = context.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 450;
      tail.connect(highpass);
      tail = highpass;
      this.playingNodes.push(highpass);
      const lowpass = context.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 5200;
      tail.connect(lowpass);
      tail = lowpass;
      this.playingNodes.push(lowpass);
    }
    if (sound === "ocean") {
      const lowpass = context.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 500;
      tail.connect(lowpass);
      tail = lowpass;
      this.playingNodes.push(lowpass);
      const waveGain = context.createGain();
      waveGain.gain.value = 0.6;
      tail.connect(waveGain);
      this.playingNodes.push(waveGain);
      const lfo = context.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.09;
      const depth = context.createGain();
      depth.gain.value = 0.32;
      lfo.connect(depth);
      depth.connect(waveGain.gain);
      lfo.start();
      this.playingSources.push(lfo);
      this.playingNodes.push(depth);
      tail = waveGain;
    }
    tail.connect(this.ambientOutput);
    source.start();
    this.playingSources.push(source);
  }

  stopAmbient(): void {
    for (const source of this.playingSources) {
      try { source.stop(); } catch { /* Already stopped. */ }
      source.disconnect();
    }
    for (const node of this.playingNodes) node.disconnect();
    this.playingSources = [];
    this.playingNodes = [];
    this.sound = null;
  }

  playCue(cue: FocusV2Cue): void {
    if (!this.isUnlocked() || !this.context || !this.cueOutput) return;
    const context = this.context;
    const patterns: Record<FocusV2Cue, number[]> = {
      focus_end: [523.25, 659.25],
      break_start: [659.25, 783.99],
      focus_start: [440, 587.33, 659.25],
      session_complete: [523.25, 659.25, 783.99],
      distraction: [392, 330],
    };
    const notes = patterns[cue];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, context.currentTime + index * 0.15);
      const start = context.currentTime + index * 0.15;
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(0.7, start + 0.025);
      envelope.gain.exponentialRampToValueAtTime(0.001, start + 0.23);
      oscillator.connect(envelope);
      envelope.connect(this.cueOutput!);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
      oscillator.start(start);
      oscillator.stop(start + 0.25);
    });
  }

  async close(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopAmbient();
    const context = this.context;
    this.context = null;
    this.ambientOutput = null;
    this.cueOutput = null;
    if (context && context.state !== "closed") await context.close();
  }

  private createNoiseBuffer(context: AudioContext, kind: "white" | "pink" | "brown"): AudioBuffer {
    const frameCount = Math.floor(context.sampleRate * 4);
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let brown = 0;
    const pink = new Float32Array(7);
    for (let index = 0; index < frameCount; index++) {
      const white = Math.random() * 2 - 1;
      if (kind === "white") { channel[index] = white * 0.19; continue; }
      if (kind === "brown") {
        brown = (brown + 0.02 * white) / 1.02;
        channel[index] = brown * 1.9;
        continue;
      }
      pink[0] = 0.99886 * pink[0] + white * 0.0555179;
      pink[1] = 0.99332 * pink[1] + white * 0.0750759;
      pink[2] = 0.969 * pink[2] + white * 0.153852;
      pink[3] = 0.8665 * pink[3] + white * 0.3104856;
      pink[4] = 0.55 * pink[4] + white * 0.5329522;
      pink[5] = -0.7616 * pink[5] - white * 0.016898;
      channel[index] = (pink[0] + pink[1] + pink[2] + pink[3] + pink[4] + pink[5] + pink[6] + white * 0.5362) * 0.055;
      pink[6] = white * 0.115926;
    }
    return buffer;
  }
}
