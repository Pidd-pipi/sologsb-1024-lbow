export type CueStatus = 'draft' | 'ready' | 'confirmed';
export type UserRole = 'designer' | 'programmer' | 'stage-manager' | 'readonly';
export type ConflictSeverity = 'error' | 'warning';

export interface Cue {
  id: string;
  number: string;
  label: string;
  position: string;
  channel: string;
  color: string;
  colorHex: string;
  brightness: number;
  fadeIn: number;
  hold: number;
  fadeOut: number;
  followCueId: string;
  targetNote: string;
  notes: string;
  status: CueStatus;
  startTime?: number;
  duration?: number;
  endTime?: number;
}

export interface Scene {
  id: string;
  name: string;
  order: number;
  frozen: boolean;
  startTime?: number;
  duration?: number;
  cues: Cue[];
}

/** 配电回路：巡演换台时灯具会临时拆到不同回路 */
export interface Circuit {
  id: string;
  name: string;
  /** 回路容量（安培） */
  capacity: number;
}

/** 灯位回路登记：灯位所属回路 + 额定电流（满亮度时的电流） */
export interface PositionPatch {
  id: string;
  /** 与提示的 position 字段对应 */
  position: string;
  circuitId: string;
  /** 额定电流（安培），按亮度百分比折算实际负载 */
  ratedCurrent: number;
}

export interface LightingPlan {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  scenes: Scene[];
  circuits: Circuit[];
  patch: PositionPatch[];
}

export interface CueConflict {
  id: string;
  planId: string;
  cueId: string;
  sceneId: string;
  severity: ConflictSeverity;
  type:
    | 'channel-overlap'
    | 'follow-order'
    | 'missing-data'
    | 'duplicate-position'
    | 'duration'
    | 'circuit-overload'
    | 'circuit-unpatched';
  message: string;
}

/** 回路过载时段（整剧时间轴上的秒） */
export interface OverloadSegment {
  start: number;
  end: number;
  /** 时段内折算负载峰值（安培） */
  peak: number;
  /** 参与叠光的提示 */
  cueIds: string[];
}

/** 单个回路在整剧时间轴上的负载核算结果 */
export interface CircuitReport {
  circuitId: string;
  capacity: number;
  /** 整剧峰值负载（安培） */
  peak: number;
  peakStart: number;
  peakEnd: number;
  overloads: OverloadSegment[];
  patchedPositions: number;
}

export interface Workspace {
  plans: LightingPlan[];
  activePlanId: string;
  comparePlanId: string;
  selectedSceneId: string;
  selectedCueId: string;
  role: UserRole;
}

export interface EditorState {
  workspace: Workspace;
  past: Workspace[];
  future: Workspace[];
  lastAction: string;
}

export interface PersistedState {
  workspace: Workspace;
}

/** 并发修改同一回路时保留的待确认草稿（后到的一方不覆盖对方） */
export interface PendingCircuitDraft {
  id: string;
  planId: string;
  author: string;
  savedAt: string;
  baseRevision: number;
  circuits: Circuit[];
  patch: PositionPatch[];
}

/** 模拟制作服务器上的已确认版本 */
export interface ServerSnapshot {
  revision: number;
  savedBy: string;
  savedAt: string;
  workspace: Workspace;
  pendingDrafts: PendingCircuitDraft[];
}
