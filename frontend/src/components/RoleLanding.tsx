import { Navigate } from "react-router-dom";
import { useMe } from "../api/auth";

// The "/" landing: route by role — owners to the owner portal, doctors to the
// dashboard. Unauthenticated -> /login (mirrors RequireAuth semantics).
export default function RoleLanding() {
  const { data, isLoading, isError } = useMe();
  if (isLoading) return null;
  if (isError || !data) return <Navigate to="/login" replace />;
  return <Navigate to={data.role === "OWNER" ? "/owner" : "/dashboard"} replace />;
}
