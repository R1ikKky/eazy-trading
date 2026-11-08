export const WORKSPACE_ROUTES: Record<string, string> = {
  sessions: "/sessions", replay: "/replay", journal: "/journal",
  analytics: "/analytics", playbooks: "/strategies",
};
export function workspaceView(pathname: string): string {
  return Object.keys(WORKSPACE_ROUTES).find((view) => WORKSPACE_ROUTES[view] === pathname) || "sessions";
}
