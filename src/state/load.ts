import type { Cue, LightingPlan } from '../types';

export const DEFAULT_VOLTAGE = 220;

export function cueStart(cue: Cue): number {
  return cue.startTime ?? 0;
}

export function cueEnd(cue: Cue): number {
  return cue.endTime ?? cueStart(cue) + (cue.duration ?? 0);
}

/**
 * 提示在某一时刻的实际亮度（0–100）。
 * 渐入阶段线性上升，保持阶段恒定，渐出阶段线性下降，其余时间为 0。
 * 在 t=end 时渐出恰好结束，亮度为 0。
 */
export function brightnessAt(cue: Cue, t: number): number {
  const start = cueStart(cue);
  const end = cueEnd(cue);
  if (t < start - 1e-6 || t > end + 1e-6) return 0;
  const { fadeIn: fi, hold, fadeOut: fo, brightness: b } = cue;
  if (fi > 0 && t < start + fi) return (b * (t - start)) / fi;
  if (t < start + fi + hold) return b;
  if (fo > 0 && t <= end) return b * (1 - (t - (start + fi + hold)) / fo);
  return t < end ? b : 0;
}

/** 单个灯具在指定时刻的实际电流（A），按亮度线性折算。 */
export function fixtureCurrent(cue: Cue, voltage: number, t: number): number {
  const watts = cue.wattage ?? 0;
  if (watts <= 0) return 0;
  return (watts / voltage) * (brightnessAt(cue, t) / 100);
}

/** 某方案中某回路在指定时刻的总负载电流（A）。 */
export function circuitLoadAt(plan: LightingPlan, circuitId: string, t: number): number {
  const voltage = plan.voltage ?? DEFAULT_VOLTAGE;
  let load = 0;
  for (const scene of plan.scenes) {
    for (const cue of scene.cues) {
      if (cue.circuitId !== circuitId) continue;
      load += fixtureCurrent(cue, voltage, t);
    }
  }
  return load;
}

function breakpoints(plan: LightingPlan): number[] {
  const set = new Set<number>([0]);
  for (const scene of plan.scenes) {
    for (const cue of scene.cues) {
      const start = cueStart(cue);
      set.add(start);
      set.add(start + cue.fadeIn);
      set.add(start + cue.fadeIn + cue.hold);
      set.add(cueEnd(cue));
    }
  }
  return [...set].sort((a, b) => a - b);
}

export interface CircuitOverload {
  circuitId: string;
  start: number;
  end: number;
  peakLoad: number;
  peakTime: number;
}

export interface CircuitAnalysis {
  circuitId: string;
  circuitName: string;
  capacity: number;
  voltage: number;
  peakLoad: number;
  peakTime: number;
  overloaded: boolean;
  overloads: CircuitOverload[];
  utilization: number;
}

function findOverloads(
  plan: LightingPlan,
  circuitId: string,
  capacity: number,
  pts: number[]
): CircuitOverload[] {
  const raw: CircuitOverload[] = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const t0 = pts[i];
    const t1 = pts[i + 1];
    const l0 = circuitLoadAt(plan, circuitId, t0);
    const l1 = circuitLoadAt(plan, circuitId, t1);
    const dt = t1 - t0;
    const over0 = l0 > capacity + 1e-6;
    const over1 = l1 > capacity + 1e-6;
    if (!over0 && !over1) continue;
    let start = t0;
    let end = t1;
    if (over0 && !over1 && dt > 1e-6) {
      end = t0 + ((capacity - l0) / (l1 - l0)) * dt;
    } else if (!over0 && over1 && dt > 1e-6) {
      start = t0 + ((capacity - l0) / (l1 - l0)) * dt;
    }
    const peakLoad = Math.max(l0, l1);
    const peakTime = l0 >= l1 ? t0 : t1;
    raw.push({ circuitId, start, end, peakLoad, peakTime });
  }
  const merged: CircuitOverload[] = [];
  for (const seg of raw) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.end - seg.start) < 1e-4) {
      last.end = seg.end;
      if (seg.peakLoad > last.peakLoad) {
        last.peakLoad = seg.peakLoad;
        last.peakTime = seg.peakTime;
      }
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

export function analyzeCircuit(plan: LightingPlan, circuitId: string): CircuitAnalysis {
  const circuit = plan.circuits?.find((c) => c.id === circuitId);
  const capacity = circuit?.capacity ?? 16;
  const circuitName = circuit?.name ?? circuitId;
  const voltage = plan.voltage ?? DEFAULT_VOLTAGE;
  const pts = breakpoints(plan);
  let peakLoad = 0;
  let peakTime = 0;
  for (const t of pts) {
    const load = circuitLoadAt(plan, circuitId, t);
    if (load > peakLoad) {
      peakLoad = load;
      peakTime = t;
    }
  }
  const overloads = findOverloads(plan, circuitId, capacity, pts);
  return {
    circuitId,
    circuitName,
    capacity,
    voltage,
    peakLoad,
    peakTime,
    overloaded: overloads.length > 0,
    overloads,
    utilization: capacity > 0 ? peakLoad / capacity : 0
  };
}

export function analyzePlan(plan: LightingPlan): CircuitAnalysis[] {
  const ids = new Set<string>();
  for (const scene of plan.scenes) {
    for (const cue of scene.cues) {
      if (cue.circuitId) ids.add(cue.circuitId);
    }
  }
  for (const circuit of plan.circuits ?? []) ids.add(circuit.id);
  return [...ids].map((id) => analyzeCircuit(plan, id));
}

export function planHasOverload(plan: LightingPlan): boolean {
  return analyzePlan(plan).some((analysis) => analysis.overloaded);
}

/** 判断某场次的时间范围内是否存在回路过载时段。 */
export function sceneHasOverload(plan: LightingPlan, sceneId: string): boolean {
  const scene = plan.scenes.find((s) => s.id === sceneId);
  if (!scene) return false;
  const start = scene.startTime ?? 0;
  const end = start + (scene.duration ?? 0);
  return analyzePlan(plan).some((analysis) =>
    analysis.overloads.some((o) => o.start < end - 1e-6 && o.end > start + 1e-6)
  );
}

export interface LoadSample {
  time: number;
  load: number;
}

/** 采样回路负载曲线，用于迷你负载图。 */
export function sampleCircuitLoad(plan: LightingPlan, circuitId: string, samples = 120): LoadSample[] {
  const pts = breakpoints(plan);
  const total = pts[pts.length - 1] || 1;
  const out: LoadSample[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = (total * i) / samples;
    out.push({ time: Number(t.toFixed(2)), load: circuitLoadAt(plan, circuitId, t) });
  }
  return out;
}

/** 找到过载峰值所在的场次与代表提示。 */
export function locateOverload(plan: LightingPlan, overload: CircuitOverload): { sceneId: string; cueId: string } {
  for (const scene of plan.scenes) {
    const start = scene.startTime ?? 0;
    const end = start + (scene.duration ?? 0);
    if (overload.peakTime >= start - 1e-6 && overload.peakTime <= end + 1e-6) {
      const cue = scene.cues.find((c) => c.circuitId === overload.circuitId) ?? scene.cues[0];
      return { sceneId: scene.id, cueId: cue?.id ?? '' };
    }
  }
  const first = plan.scenes[0];
  const cue = first?.cues.find((c) => c.circuitId === overload.circuitId) ?? first?.cues[0];
  return { sceneId: first?.id ?? '', cueId: cue?.id ?? '' };
}
