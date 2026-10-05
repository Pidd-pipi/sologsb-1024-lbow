import { LIGHTING_STORAGE_KEY } from './state/useLightingDesk';
import type { Circuit, LightingPlan, PendingCircuitDraft, PositionPatch, ServerSnapshot, Workspace } from './types';

export const SERVER_STORAGE_KEY = `${LIGHTING_STORAGE_KEY}/server`;

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function readServerSnapshot(): ServerSnapshot | null {
  try {
    const raw = localStorage.getItem(SERVER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ServerSnapshot;
    if (!parsed.workspace?.plans?.length) return null;
    parsed.pendingDrafts = Array.isArray(parsed.pendingDrafts) ? parsed.pendingDrafts : [];
    return parsed;
  } catch {
    return null;
  }
}

export function writeServerSnapshot(snapshot: ServerSnapshot) {
  localStorage.setItem(SERVER_STORAGE_KEY, JSON.stringify(snapshot));
}

/** 单个方案内被改动的回路集合 */
export interface CircuitChangeSet {
  circuitIds: Set<string>;
  positions: Set<string>;
}

function diffPlans(base: LightingPlan | undefined, current: LightingPlan): CircuitChangeSet {
  const changes: CircuitChangeSet = { circuitIds: new Set(), positions: new Set() };
  const baseCircuits = new Map<string, Circuit>((base?.circuits ?? []).map((item) => [item.id, item]));
  for (const item of current.circuits) {
    const previous = baseCircuits.get(item.id);
    if (!previous || previous.capacity !== item.capacity || previous.name !== item.name) {
      changes.circuitIds.add(item.id);
    }
    baseCircuits.delete(item.id);
  }
  for (const removedId of baseCircuits.keys()) changes.circuitIds.add(removedId);

  const basePatch = new Map<string, PositionPatch>((base?.patch ?? []).map((entry) => [entry.position, entry]));
  for (const entry of current.patch) {
    const previous = basePatch.get(entry.position);
    if (!previous || previous.circuitId !== entry.circuitId || previous.ratedCurrent !== entry.ratedCurrent) {
      changes.positions.add(entry.position);
    }
    basePatch.delete(entry.position);
  }
  for (const removedPosition of basePatch.keys()) changes.positions.add(removedPosition);
  return changes;
}

/** 对比基准版本与当前版本，列出每个方案被改动的回路 / 灯位 */
export function diffCircuitChanges(basePlans: LightingPlan[], currentPlans: LightingPlan[]): Map<string, CircuitChangeSet> {
  const result = new Map<string, CircuitChangeSet>();
  const baseById = new Map(basePlans.map((plan) => [plan.id, plan]));
  for (const plan of currentPlans) {
    const changes = diffPlans(baseById.get(plan.id), plan);
    if (changes.circuitIds.size || changes.positions.size) result.set(plan.id, changes);
  }
  return result;
}

function findCircuitIdForPosition(plan: LightingPlan | undefined, position: string) {
  return plan?.patch.find((entry) => entry.position === position)?.circuitId ?? '';
}

/**
 * 判断双方改动是否落在同一回路上：
 * 直接改同一回路、改同一灯位，或一方把灯位挂到另一方改过的回路，都视为冲突。
 */
export function hasCircuitOverlap(
  mine: Map<string, CircuitChangeSet>,
  theirs: Map<string, CircuitChangeSet>,
  myPlans: LightingPlan[],
  theirPlans: LightingPlan[]
): boolean {
  for (const [planId, myChanges] of mine) {
    const theirChanges = theirs.get(planId);
    if (!theirChanges) continue;
    for (const id of myChanges.circuitIds) {
      if (theirChanges.circuitIds.has(id)) return true;
    }
    for (const position of myChanges.positions) {
      if (theirChanges.positions.has(position)) return true;
    }
    const myPlan = myPlans.find((plan) => plan.id === planId);
    const theirPlan = theirPlans.find((plan) => plan.id === planId);
    for (const position of myChanges.positions) {
      if (theirChanges.circuitIds.has(findCircuitIdForPosition(myPlan, position))) return true;
    }
    for (const position of theirChanges.positions) {
      if (myChanges.circuitIds.has(findCircuitIdForPosition(theirPlan, position))) return true;
    }
  }
  return false;
}

/** 无冲突时把对方的回路改动合并进本地工作区（对方新增/修改/删除都按基准对比应用） */
export function mergeTheirCircuitChanges(merged: Workspace, basePlans: LightingPlan[], theirPlans: LightingPlan[]) {
  const baseById = new Map(basePlans.map((plan) => [plan.id, plan]));
  for (const theirPlan of theirPlans) {
    const target = merged.plans.find((plan) => plan.id === theirPlan.id);
    if (!target) continue;
    const basePlan = baseById.get(theirPlan.id);

    const baseCircuits = new Map((basePlan?.circuits ?? []).map((item) => [item.id, item]));
    for (const item of theirPlan.circuits) {
      const previous = baseCircuits.get(item.id);
      if (!previous || previous.capacity !== item.capacity || previous.name !== item.name) {
        const index = target.circuits.findIndex((candidate) => candidate.id === item.id);
        if (index >= 0) target.circuits[index] = clone(item);
        else target.circuits.push(clone(item));
      }
      baseCircuits.delete(item.id);
    }
    target.circuits = target.circuits.filter((item) => !baseCircuits.has(item.id));

    const basePatch = new Map((basePlan?.patch ?? []).map((entry) => [entry.position, entry]));
    for (const entry of theirPlan.patch) {
      const previous = basePatch.get(entry.position);
      if (!previous || previous.circuitId !== entry.circuitId || previous.ratedCurrent !== entry.ratedCurrent) {
        const index = target.patch.findIndex((candidate) => candidate.position === entry.position);
        if (index >= 0) target.patch[index] = clone(entry);
        else target.patch.push(clone(entry));
      }
      basePatch.delete(entry.position);
    }
    target.patch = target.patch.filter((entry) => !basePatch.has(entry.position));
  }
  return merged;
}

/** 生成待确认草稿与对方版本的逐条差异说明 */
export function describeDraftDiff(draft: PendingCircuitDraft, serverPlan: LightingPlan | undefined): string[] {
  const lines: string[] = [];
  const circuitName = (plans: (Circuit | undefined)[], id: string) =>
    plans.find((item) => item?.id === id)?.name ?? id;
  for (const item of draft.circuits) {
    const other = serverPlan?.circuits.find((candidate) => candidate.id === item.id);
    if (!other) lines.push(`新增回路 ${item.name}（容量 ${item.capacity}A）`);
    else if (other.capacity !== item.capacity || other.name !== item.name) {
      lines.push(`${other.name}：容量 ${other.capacity}A → ${item.capacity}A`);
    }
  }
  for (const item of serverPlan?.circuits ?? []) {
    if (!draft.circuits.some((candidate) => candidate.id === item.id)) lines.push(`对方版本中的 ${item.name} 在草稿里被移除`);
  }
  for (const entry of draft.patch) {
    const other = serverPlan?.patch.find((candidate) => candidate.position === entry.position);
    const nameOf = (circuitId: string) =>
      circuitName([...draft.circuits, ...(serverPlan?.circuits ?? [])], circuitId);
    if (!other) {
      lines.push(`灯位「${entry.position}」→ ${nameOf(entry.circuitId)} · ${entry.ratedCurrent}A（草稿新增）`);
    } else if (other.circuitId !== entry.circuitId || other.ratedCurrent !== entry.ratedCurrent) {
      lines.push(
        `灯位「${entry.position}」：${nameOf(other.circuitId)} / ${other.ratedCurrent}A → ${nameOf(entry.circuitId)} / ${entry.ratedCurrent}A`
      );
    }
  }
  if (!lines.length) lines.push('草稿与对方当前版本的回路登记一致');
  return lines;
}
