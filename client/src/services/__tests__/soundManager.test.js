// Mock the Web Audio API — soundManager builds everything from
// oscillators + gain nodes synthesised at call time.
function makeAudioContextInstance(state = "running") {
  const gainNode = {
    connect: jest.fn(),
    gain: {
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
      exponentialRampToValueAtTime: jest.fn(),
    },
  };
  const oscNode = {
    connect: jest.fn(),
    type: "",
    frequency: {
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
    },
    start: jest.fn(),
    stop: jest.fn(),
  };

  return {
    state,
    currentTime: 0,
    destination: {},
    resume: jest.fn(),
    createOscillator: jest.fn(() => ({ ...oscNode, frequency: { ...oscNode.frequency } })),
    createGain: jest.fn(() => ({ ...gainNode, gain: { ...gainNode.gain } })),
  };
}

describe("soundManager", () => {
  let soundManager;

  beforeEach(() => {
    jest.resetModules();
    delete window.webkitAudioContext;
  });

  test("starts unmuted", () => {
    window.AudioContext = jest.fn(() => makeAudioContextInstance());
    soundManager = require("../soundManager").default;
    expect(soundManager.isMuted()).toBe(false);
  });

  test("setMuted toggles isMuted", () => {
    window.AudioContext = jest.fn(() => makeAudioContextInstance());
    soundManager = require("../soundManager").default;
    soundManager.setMuted(true);
    expect(soundManager.isMuted()).toBe(true);
    soundManager.setMuted(false);
    expect(soundManager.isMuted()).toBe(false);
  });

  test.each([
    ["playSubmit"],
    ["playRoundStart"],
    ["playWin"],
    ["playLose"],
    ["playElimination"],
    ["playExactMatch"],
    ["playTimerTick"],
  ])("%s creates oscillator nodes when unmuted", (fnName) => {
    const instance = makeAudioContextInstance();
    window.AudioContext = jest.fn(() => instance);
    soundManager = require("../soundManager").default;

    expect(() => soundManager[fnName]()).not.toThrow();
    expect(instance.createOscillator).toHaveBeenCalled();
  });

  test("muted sounds do not create oscillator nodes", () => {
    const instance = makeAudioContextInstance();
    window.AudioContext = jest.fn(() => instance);
    soundManager = require("../soundManager").default;

    soundManager.setMuted(true);
    soundManager.playSubmit();
    soundManager.playWin();

    expect(instance.createOscillator).not.toHaveBeenCalled();
  });

  test("resumes a suspended audio context", () => {
    const instance = makeAudioContextInstance("suspended");
    window.AudioContext = jest.fn(() => instance);
    soundManager = require("../soundManager").default;

    soundManager.playSubmit();
    soundManager.playRoundStart();

    expect(instance.resume).toHaveBeenCalled();
  });

  test("falls back gracefully when AudioContext construction throws", () => {
    window.AudioContext = jest.fn(() => {
      throw new Error("not supported");
    });
    soundManager = require("../soundManager").default;

    expect(() => soundManager.playSubmit()).not.toThrow();
    expect(() => soundManager.playElimination()).not.toThrow();
  });

  test("falls back to webkitAudioContext when AudioContext is unavailable", () => {
    delete window.AudioContext;
    const instance = makeAudioContextInstance();
    window.webkitAudioContext = jest.fn(() => instance);
    soundManager = require("../soundManager").default;

    soundManager.playWin();
    expect(instance.createOscillator).toHaveBeenCalled();
  });
});
