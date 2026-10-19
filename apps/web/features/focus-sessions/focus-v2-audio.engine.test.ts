import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { FocusV2AudioEngine } from "./focus-v2-audio.engine";

const created = { contexts: [] as FakeAudioContext[] };

class FakeParameter {
  value = 0;
  setTargetAtTime = vi.fn();
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}

class FakeAudioNode {
  gain = new FakeParameter();
  frequency = new FakeParameter();
  detune = new FakeParameter();
  type = "sine";
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
  onended: (() => void) | null = null;
  buffer: unknown = null;
  loop = false;
}

class FakeAudioContext {
  state: "suspended" | "running" | "closed" = "suspended";
  sampleRate = 1000;
  currentTime = 1;
  destination = new FakeAudioNode();
  sources: FakeAudioNode[] = [];
  gains: FakeAudioNode[] = [];
  resume = vi.fn(async () => { this.state = "running"; });
  close = vi.fn(async () => { this.state = "closed"; });
  constructor() { created.contexts.push(this); }
  createGain() { const node = new FakeAudioNode(); this.gains.push(node); return node; }
  createOscillator() { const node = new FakeAudioNode(); this.sources.push(node); return node; }
  createBiquadFilter() { return new FakeAudioNode(); }
  createBufferSource() { const node = new FakeAudioNode(); this.sources.push(node); return node; }
  createBuffer(_channels: number, length: number) {
    const samples = new Float32Array(length);
    return { getChannelData: () => samples };
  }
}

describe("Focus V2 browser audio engine", () => {
  beforeEach(() => {
    created.contexts.length = 0;
    vi.stubGlobal("AudioContext", FakeAudioContext);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("does not construct an AudioContext until explicitly unlocked", async () => {
    const engine = new FocusV2AudioEngine();
    engine.playAmbient("brown");
    expect(created.contexts).toHaveLength(0);
    await engine.unlock();
    expect(created.contexts).toHaveLength(1);
    expect(created.contexts[0].resume).toHaveBeenCalledOnce();
    await engine.close();
    expect(created.contexts[0].close).toHaveBeenCalledOnce();
  });

  it("plays and replaces all six synthesis modes with cleanup", async () => {
    const engine = new FocusV2AudioEngine();
    await engine.unlock();
    for (const sound of ["white", "pink", "brown", "rain", "ocean", "ambient_pad"] as const) {
      engine.playAmbient(sound);
    }
    const context = created.contexts[0];
    expect(context.sources.length).toBeGreaterThan(6);
    engine.stopAmbient();
    expect(context.sources.filter((source) => source.stop.mock.calls.length > 0).length).toBe(context.sources.length);
    await engine.close();
  });

  it("keeps cue/ambient gains independent and supports cue playback", async () => {
    const engine = new FocusV2AudioEngine();
    await engine.unlock();
    engine.setAmbientVolume(100, true);
    engine.setCueVolume(50, true);
    const context = created.contexts[0];
    expect(context.gains[0].gain.setTargetAtTime).toHaveBeenCalledWith(0, 1, 0.035);
    expect(context.gains[1].gain.setTargetAtTime).toHaveBeenCalledWith(0.12, 1, 0.02);
    engine.playCue("focus_end");
    expect(context.sources).toHaveLength(2);
    await engine.close();
  });

  it("rejects unlocking a disposed engine", async () => {
    const engine = new FocusV2AudioEngine();
    await engine.close();
    await expect(engine.unlock()).rejects.toThrow();
  });
});
