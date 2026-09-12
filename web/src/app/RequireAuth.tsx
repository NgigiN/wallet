import { Navigate, Outlet, useLocation } from "react-router";
import { useSession } from "../api/auth";

export function RequireAuth() {
  const { data, isPending } = useSession();
  const loc = useLocation();
  if (isPending) return <div className="empty">Loading…</div>;
  if (!data) return <Navigate to="/sign-in" replace state={{ from: loc.pathname }} />;
  return <Outlet />;
}
