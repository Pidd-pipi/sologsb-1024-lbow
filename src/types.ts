export type CueStatus = 'draft' | 'ready' | 'confirmed';
export type UserRole = 'designer' | 'programmer' | 'stage-manager' | 'readonly';
export type ConflictSeverity = 'error' | 'warning';

export interface Circuit {
  id: string;
  name: string;
  capacity: number; // 额定电流（安培 A）
}

export interface Cue {
  id: string;
  number: string;
  label: string;
  position: string;
  channel: string;
  circuitId: string;
  wattage: number; // 灯具功率（瓦 W），用于按亮度折算回路负载
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

export interface LightingPlan {
  id: string;
  name: string;
  description: string;
  voltage: number; // 供电电压（V），用于由功率折算电流
  updatedAt: string;
  circuits: Circuit[];
  scenes: Scene[];
}

export interface CueConflict {
  id: string;
  planId: string;
  cueId: string;
  sceneId: string;
  severity: ConflictSeverity;
  type: 'channel-overlap' | 'follow-order' | 'missing-data' | 'duplicate-position' | 'duration' | 'circuit-overload';
  message: string;
  circuitId?: string;
  startTime?: number;
  endTime?: number;
  peakLoad?: number;
  capacity?: number;
}

export interface Workspace {
  plans: LightingPlan[];
  activePlanId: string;
  comparePlanId: string;
  selectedSceneId: string;
  selectedCueId: string;
  role: UserRole;
  collab: CollabState;
}

export type CollabOwner = 'designer' | 'programmer';

export interface FixtureChange {
  circuitId?: string;
  wattage?: number;
}

export interface CollabDraft {
  changes: Record<string, FixtureChange>;
  saved: boolean;
}

export interface CollabConflict {
  cueId: string;
  base: FixtureChange;
  designer: FixtureChange;
  programmer: FixtureChange;
}

export interface CollabState {
  basePlanId: string;
  drafts: Record<CollabOwner, CollabDraft>;
  pending: CollabConflict[] | null;
  pendingOwner: CollabOwner | null;
  archived: boolean;
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
