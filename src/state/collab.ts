import type {
  CollabConflict,
  CollabDraft,
  CollabOwner,
  CollabState,
  FixtureChange,
  LightingPlan,
  Workspace
} from '../types';

export const COLLAB_OWNERS: CollabOwner[] = ['designer', 'programmer'];

export const collabOwnerLabels: Record<CollabOwner, string> = {
  designer: '灯光设计',
  programmer: '编程执行'
};

export function emptyDraft(): CollabDraft {
  return { changes: {}, saved: false };
}

export function createCollabState(planId: string): CollabState {
  return {
    basePlanId: planId,
    drafts: { designer: emptyDraft(), programmer: emptyDraft() },
    pending: null,
    pendingOwner: null,
    archived: false
  };
}

function fixtureKey(change: FixtureChange): string {
  return `${change.circuitId ?? ''}|${change.wattage ?? ''}`;
}

/** 记录某一方对某个灯具的回路/功率修改。 */
export function editCollabDraft(
  state: CollabState,
  owner: CollabOwner,
  cueId: string,
  change: FixtureChange
): CollabState {
  return {
    ...state,
    archived: false,
    drafts: {
      ...state.drafts,
      [owner]: {
        changes: { ...state.drafts[owner].changes, [cueId]: change },
        saved: false
      }
    }
  };
}

export function removeCollabDraftChange(
  state: CollabState,
  owner: CollabOwner,
  cueId: string
): CollabState {
  const changes = { ...state.drafts[owner].changes };
  delete changes[cueId];
  return {
    ...state,
    drafts: { ...state.drafts, [owner]: { changes, saved: false } }
  };
}

/** 计算双方草稿中对同一灯具的冲突修改。 */
export function findCollabConflicts(state: CollabState): CollabConflict[] {
  const { designer, programmer } = state.drafts;
  const conflicts: CollabConflict[] = [];
  for (const cueId of Object.keys(designer.changes)) {
    const other = programmer.changes[cueId];
    if (!other) continue;
    const base: FixtureChange = {};
    if (fixtureKey(designer.changes[cueId]) !== fixtureKey(other)) {
      conflicts.push({ cueId, base, designer: designer.changes[cueId], programmer: other });
    }
  }
  return conflicts;
}

function applyChangeToPlan(plan: LightingPlan, cueId: string, change: FixtureChange) {
  for (const scene of plan.scenes) {
    const cue = scene.cues.find((c) => c.id === cueId);
    if (!cue) continue;
    if (change.circuitId !== undefined) cue.circuitId = change.circuitId;
    if (change.wattage !== undefined) cue.wattage = change.wattage;
  }
}

/**
 * 某一方保存草稿。若双方修改了同一灯具，则不覆盖对方，
 * 而是进入待确认差异流程；否则直接应用本方修改。
 */
export function saveCollabDraft(
  workspace: Workspace,
  owner: CollabOwner
): { workspace: Workspace; conflicts: CollabConflict[] } {
  const state = workspace.collab;
  const conflicts = findCollabConflicts(state);
  if (conflicts.length) {
    return {
      workspace: {
        ...workspace,
        collab: { ...state, pending: conflicts, pendingOwner: owner }
      },
      conflicts
    };
  }
  const plan = workspace.plans.find((p) => p.id === state.basePlanId);
  const next: Workspace = {
    ...workspace,
    collab: {
      ...state,
      drafts: {
        ...state.drafts,
        [owner]: { changes: state.drafts[owner].changes, saved: true }
      }
    }
  };
  if (plan) {
    for (const [cueId, change] of Object.entries(state.drafts[owner].changes)) {
      applyChangeToPlan(plan, cueId, change);
    }
  }
  return { workspace: next, conflicts: [] };
}

/** 确认合并：按每灯具选择保留哪一方的取值，双方草稿均保留为历史。 */
export function resolveCollabMerge(
  workspace: Workspace,
  resolutions: Record<string, CollabOwner>
): Workspace {
  const state = workspace.collab;
  const plan = workspace.plans.find((p) => p.id === state.basePlanId);
  const pending = state.pending ?? [];
  const next: Workspace = {
    ...workspace,
    collab: {
      ...state,
      pending: null,
      pendingOwner: null,
      archived: true,
      drafts: {
        designer: { changes: state.drafts.designer.changes, saved: true },
        programmer: { changes: state.drafts.programmer.changes, saved: true }
      }
    }
  };
  if (plan) {
    for (const conflict of pending) {
      const keep = resolutions[conflict.cueId];
      const change = keep === 'programmer' ? conflict.programmer : conflict.designer;
      applyChangeToPlan(plan, conflict.cueId, change);
    }
  }
  return next;
}

export function discardCollabPending(workspace: Workspace): Workspace {
  return {
    ...workspace,
    collab: { ...workspace.collab, pending: null, pendingOwner: null }
  };
}

export function resetCollabRound(workspace: Workspace): Workspace {
  return {
    ...workspace,
    collab: createCollabState(workspace.activePlanId)
  };
}

/** 切换方案时，协同草稿基准跟随当前方案。 */
export function rebaseCollabToPlan(workspace: Workspace, planId: string): Workspace {
  if (workspace.collab.basePlanId === planId) return workspace;
  return { ...workspace, collab: createCollabState(planId) };
}
