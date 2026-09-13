import { Navigate, Outlet, useLocation } from "react-router";
import { useSession } from "../api/auth";

export function RequireAuth() {
  const { data, isPending, error, refetch } = useSession();
  const loc = useLocation();
  if (isPending) return <div className="empty">Loading…</div>;
  // A failed session check (429, network, server hiccup) is not a signed-out session.
  // Redirecting on one throws the user out of the app and reads as "it forgot me".
  if (error && !data) return (
    <div className="empty">
      <div>Couldn't check your session.</div>
      <button className="btn" style={{ width: "auto", marginTop: 12 }} onClick={() => void refetch()}>Retry</button>
    </div>
  );
  if (!data) return <Navigate to="/sign-in" replace state={{ from: loc.pathname }} />;
  return <Outlet />;
}
