export interface WorkspacePayload {
  version: 1;
  sessions: Record<string, unknown>[];
  playbooks: Record<string, unknown>[];
  settings: Record<string, unknown>;
}

export interface SaveWorkspaceDto extends WorkspacePayload {
  revision: number;
}
