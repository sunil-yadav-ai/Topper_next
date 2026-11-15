"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./auth-context.js";
import { api } from "../lib/api.js";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    api
      .get("/auth/me", { pageLoading: false })
      .then(({ data }) => setUser(data.user))
      .catch((error) => {
        if (error.response?.status !== 401) {
          setAuthError(error.response?.data?.message ?? "Could not load your session.");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function signIn(credentials, admin = false) {
    const endpoint = admin ? "/auth/admin/login" : "/auth/login";
    const { data } = await api.post(endpoint, credentials);
    setUser(data.user);
    setAuthError("");
    return data.user;
  }

  async function signOut() {
    await api.post("/auth/logout");
    setUser(null);
    setAuthError("");
  }

  function updateUser(profile) {
    setUser((currentUser) => (currentUser ? { ...currentUser, ...profile } : profile));
  }

  const value = useMemo(
    () => ({ user, loading, authError, signIn, signOut, updateUser }),
    [user, loading, authError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
}
