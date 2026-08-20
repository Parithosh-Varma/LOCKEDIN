import React, { useState } from "react";
import { IconLock } from "../lib/icons";

export default function Login() {
  const { login } = useAuthImport();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm card space-y-5">
        <div className="space-y-2 text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <IconLock className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">LOCKEDIN</h1>
          <p className="text-sm text-muted-foreground">Study Command Center</p>
        </div>
        <div className="space-y-2">
          <label className="label">Password</label>
          <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoFocus />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Signing in…" : "Enter command center"}
        </button>
      </form>
    </div>
  );
}

import { useAuth } from "../context/auth";
function useAuthImport() {
  return useAuth();
}