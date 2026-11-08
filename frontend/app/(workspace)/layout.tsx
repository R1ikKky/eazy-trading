import { AuthBoundary } from "../auth-boundary";
import { ReplayWorkspace } from "../workspace";
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <AuthBoundary><ReplayWorkspace />{children}</AuthBoundary>;
}
