import { useState } from "react";
import { useAuth } from "../context/auth";
import { IconLock } from "../lib/icons";

export default function Login() {
  const { login } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try { await login(password); } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-[#050507] relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(99,102,241,0.25),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(40%_40%_at_80%_80%,rgba(139,92,246,0.18),transparent_60%)]" />
      </div>
      <form onSubmit={submit} className="w-full max-w-sm card space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-[linear-gradient(135deg,#6366f1,#8b5cf6)] grid place-items-center shadow-[0_12px_30px_-10px_rgba(99,102,241,0.7)]">
            <IconLock className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">LOCKEDIN</h1>
          <p className="text-white/60 text-sm">Study accountability that doesn't quit.</p>
        </div>
        <div className="space-y-2">
          <label className="label">Password</label>
          <input type="password" className="input" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your command code" autoFocus />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button disabled={loading} className="btn-primary w-full">{loading?"Signing in…":"Enter"}</button>
      </form>
    </div>
  );
}