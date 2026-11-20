import React, { useEffect, useRef } from "react";

const WIDTH = 96;
const HEIGHT = 18;
// How long a sound takes to cross the pill, right to left.
const SPAN_MS = 1600;
const STEP_PX = 2;
const PX_PER_MS = WIDTH / SPAN_MS;
const MAX_AMPLITUDE = HEIGHT / 2 - 1;
// The faint ripple left on a line when nothing is heard.
const REST_AMPLITUDE = 0.5;

// One curve per part of the voice, so they don't move as one: the whole
// spectrum in front, then the low and the high buckets behind it.
const CURVES = [
  { from: 0, to: 16, wavelength: 22, offset: 0 },
  { from: 0, to: 6, wavelength: 31, offset: 2.1 },
  { from: 6, to: 16, wavelength: 15, offset: 4.2 },
];

// The narrowest span between room and voice the curves stretch to full
// height. Below it a level is room noise, and stretching it would make the
// idle lines twitch.
const MIN_RANGE = 0.05;
// How far above the room a level has to be before it counts as voice: a
// fifth of the room's own level, since a louder room also wavers more.
const ROOM_MARGIN = 0.2;
const MIN_ROOM_MARGIN = 0.012;

/**
 * Fits the curves to the voice being heard instead of to a fixed loudness:
 * it follows the room's level and the voice's recent peaks, and places each
 * level between the two. A quiet voice in an open space then fills the pill
 * as a loud one does. Rates are per frame, at about 60 a second.
 */
export class AutoRange {
  private room: number | null = null;
  private peak = 0;

  /** Where `level` stands from the room (0) to the voice's peaks (1). */
  fit(level: number): number {
    if (this.room === null) {
      // The microphone's first buckets are empty; wait for a real level.
      if (level <= 0) return 0;
      this.room = level;
      this.peak = level;
    }
    // The room drops at once and creeps up over a few seconds, so speech
    // doesn't pass for it but a room that gets louder does.
    this.room += (level - this.room) * (level < this.room ? 0.2 : 0.004);
    // A peak is taken at once and forgotten over about five seconds.
    this.peak =
      level > this.peak
        ? this.peak + (level - this.peak) * 0.4
        : this.peak + (this.room - this.peak) * 0.003;
    const range = Math.max(this.peak - this.room, MIN_RANGE);
    const margin = Math.max(MIN_ROOM_MARGIN, this.room * ROOM_MARGIN);
    const fitted = (level - this.room - margin) / range;
    return Math.pow(Math.min(1, Math.max(0, fitted)), 0.6);
  }
}

interface Sample {
  time: number;
  values: number[];
}

const bandLevel = (levels: number[], from: number, to: number) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += levels[i] || 0;
  return sum / (to - from);
};

/** The value of `curve` at `time`, read between the two nearest samples. */
const valueAt = (
  samples: Sample[],
  cursor: number,
  time: number,
  curve: number,
) => {
  const before = samples[cursor];
  const after = samples[cursor + 1];
  if (!before || time < before.time) return 0;
  if (!after) return before.values[curve];
  const mix = (time - before.time) / (after.time - before.time || 1);
  return before.values[curve] * (1 - mix) + after.values[curve] * mix;
};

interface WaveformProps {
  /** The latest microphone levels, 16 buckets from 0 to 1. */
  levelsRef: React.MutableRefObject<number[]>;
  /** False until the microphone delivers its first samples. */
  ready: boolean;
}

/**
 * The voice as a strip chart: what was just said enters on the right and
 * travels left, each curve as tall as the voice was loud at that moment.
 */
const Waveform: React.FC<WaveformProps> = ({ levelsRef, ready }) => {
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const markRef = useRef<SVGPathElement>(null);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  useEffect(() => {
    // Without motion the curves stand still and only their height follows.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const followers = CURVES.map(() => 0);
    const ranges = CURVES.map(() => new AutoRange());
    let samples: Sample[] = [];
    let frame = 0;

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);

      const levels = readyRef.current ? levelsRef.current : [];
      CURVES.forEach((curve, i) => {
        const target = ranges[i].fit(bandLevel(levels, curve.from, curve.to));
        // Rise with the syllable, fall a little slower than it does.
        const rate = target > followers[i] ? 0.5 : 0.14;
        followers[i] += (target - followers[i]) * rate;
      });
      samples.push({ time: now, values: [...followers] });
      const oldest = now - SPAN_MS - 100;
      if (samples[0].time < oldest) {
        samples = samples.filter((sample) => sample.time >= oldest);
      }

      CURVES.forEach((curve, i) => {
        let d = "";
        let cursor = 0;
        for (let x = 0; x <= WIDTH; x += STEP_PX) {
          const time = now - (1 - x / WIDTH) * SPAN_MS;
          while (samples[cursor + 1] && samples[cursor + 1].time <= time) {
            cursor++;
          }
          const level = still
            ? followers[i]
            : valueAt(samples, cursor, time, i);
          // The ripple is tied to the moment, not the pixel, so a syllable
          // keeps its shape while it crosses.
          const travelled = (still ? x : time * PX_PER_MS) / curve.wavelength;
          // Both ends pinch back onto the centre line.
          const taper = Math.pow(Math.sin((Math.PI * x) / WIDTH), 0.6);
          const y =
            HEIGHT / 2 +
            (REST_AMPLITUDE + level * (MAX_AMPLITUDE - REST_AMPLITUDE)) *
              taper *
              Math.sin(travelled * 2 * Math.PI + curve.offset);
          d += `${x === 0 ? "M" : "L"}${x} ${y.toFixed(2)}`;
        }
        pathRefs.current[i]?.setAttribute("d", d);
        if (i === 0) markRef.current?.setAttribute("d", d);
      });
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [levelsRef]);

  return (
    <div className={`swave ${ready ? "ready" : "arming"}`}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
        {[2, 1].map((i) => (
          <path
            key={i}
            ref={(el) => {
              pathRefs.current[i] = el;
            }}
            className="swave-back"
          />
        ))}
        <path ref={markRef} className="swave-mark" />
        <path
          ref={(el) => {
            pathRefs.current[0] = el;
          }}
          className="swave-front"
        />
      </svg>
    </div>
  );
};

export default Waveform;
