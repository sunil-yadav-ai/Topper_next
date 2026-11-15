"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext.jsx";
import { PageLoader } from "./PageState.jsx";
import { getPostLoginPath } from "../lib/navigation.js";

export default function RouteGuard({ children, role, authenticatedOnly = false }) {
  const { user, loading, authError } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || authError) return;
    if (!user) {
      router.replace(role === "admin" ? "/admin/login" : "/login");
      return;
    }
    if (role && user.role !== role) {
      router.replace(getPostLoginPath(user));
      return;
    }
    if (!authenticatedOnly && !role && user.role !== "user") {
      router.replace(getPostLoginPath(user));
    }
  }, [authenticatedOnly, authError, loading, role, router, user]);

  if (loading) return <PageLoader label="Loading your account…" />;
  if (authError) {
    return <p className="ed-page-error grid min-h-screen place-items-center px-5 text-center" role="alert">{authError}</p>;
  }
  if (!user || (role && user.role !== role) || (!authenticatedOnly && !role && user.role !== "user")) {
    return <PageLoader label="Opening your learning space…" />;
  }
  return children;
}
