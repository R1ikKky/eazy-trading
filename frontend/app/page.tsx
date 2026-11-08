import { ReplayWorkspace } from "./workspace";
import { AuthBoundary } from "./auth-boundary";
export default function Home() {
  return (
    <AuthBoundary>
      <ReplayWorkspace />
    </AuthBoundary>
  );
}
