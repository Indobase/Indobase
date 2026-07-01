import type { Change } from 'diff';

export type ActionType = 'file' | 'shell' | 'indobase' | 'supabase';

export interface BaseAction {
  content: string;
}

export interface FileAction extends BaseAction {
  type: 'file';
  filePath: string;
}

export interface ShellAction extends BaseAction {
  type: 'shell';
}

export interface StartAction extends BaseAction {
  type: 'start';
}

export interface BuildAction extends BaseAction {
  type: 'build';
}

export interface IndobaseBackendAction extends BaseAction {
  type: 'indobase';
  operation: 'migration' | 'query';
  filePath?: string;
  projectId?: string;
}

/** @deprecated Use IndobaseBackendAction with type "indobase" */
export interface SupabaseAction extends IndobaseBackendAction {
  type: 'supabase';
}

export type BoltAction = FileAction | ShellAction | StartAction | BuildAction | IndobaseBackendAction | SupabaseAction;

export type BoltActionData = BoltAction | BaseAction;

export interface ActionAlert {
  type: string;
  title: string;
  description: string;
  content: string;
  source?: 'terminal' | 'preview'; // Add source to differentiate between terminal and preview errors
}

export interface IndobaseBackendAlert {
  type: string;
  title: string;
  description: string;
  content: string;
  source?: 'indobase';
}

/** @deprecated Use IndobaseBackendAlert */
export type SupabaseAlert = IndobaseBackendAlert;

export interface DeployAlert {
  type: 'success' | 'error' | 'info';
  title: string;
  description: string;
  content?: string;
  url?: string;
  stage?: 'building' | 'deploying' | 'complete';
  buildStatus?: 'pending' | 'running' | 'complete' | 'failed';
  deployStatus?: 'pending' | 'running' | 'complete' | 'failed';
  source?: 'vercel' | 'netlify' | 'github' | 'gitlab';
}

export interface LlmErrorAlertType {
  type: 'error' | 'warning';
  title: string;
  description: string;
  content?: string;
  provider?: string;
  errorType?: 'authentication' | 'rate_limit' | 'quota' | 'network' | 'unknown';
  upgradeUrl?: string;
}

export interface FileHistory {
  originalContent: string;
  lastModified: number;
  changes: Change[];
  versions: {
    timestamp: number;
    content: string;
  }[];

  // Novo campo para rastrear a origem das mudanças
  changeSource?: 'user' | 'auto-save' | 'external';
}
