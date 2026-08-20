import { NavLink, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/auth";
import { useTheme } from "./context/theme";
import { IconDashboard, IconCalendar, IconTimer, IconBook, IconChart, IconActivity, IconHistory, IconSend, IconCloud, IconSettings, IconLock, IconGithub } from "./lib/icons";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Schedule from "./pages/Schedule";
import Session from "./pages/Session";
import Tests from "./pages/Tests";
import Performance from "./pages/Performance";
import Autopsy from "./pages/Autopsy";
import History from "./pages/History";
import Analytics from "./pages/Analytics";
import Telegram from "./pages/Telegram";
import Allen from "./pages/Allen";
import Settings from "./pages/Settings";

const nav = [
  { to: "/", label: "Dashboard", icon: IconDashboard },
  { to: "/schedule", label: "Schedule", icon: IconCalendar },
  { to: "/session", label: "Session", icon: IconTimer },
  { to: "/tests", label: "Tests", icon: IconBook },
  { to: "/performance", label: "Performance", icon: IconChart },
  { to: "/autopsy", label: "Autopsy", icon: IconActivity },
  { to: "/history", label: "History", icon: IconHistory },
  { to: "/analytics", label: "Analytics", icon: IconActivity },
  { to: "/telegram", label: "Telegram", icon: IconSend },
  { to: "/allen", label: "Allen", icon: IconCloud },
  { to: "/settings", label: "Settings", icon: IconSettings },
];

function Sidebar() {
  const { logout } = useAuth();
  return (
    <aside className="hidden md:flex flex-col w-[280px] shrink-0 h-screen sticky top-0 border-r border-white/10 bg-black/20 backdrop-blur-xl">
      <div className="px-6 py-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-[linear-gradient(135deg,#6366f1,#8b5cf6)] grid place-items-center shadow-[0_8px_20px_-8px_rgba(99,102,241,0.7)]">
          <IconLock />
        </div>
        <div>
          <div className="text-xl font-black tracking-tight leading-none">LOCKEDIN</div>
          <div className="text-[11px] text-white/50 mt-1">Command Center</div>
        </div>
      </div>
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {nav.map(n => (
          <NavLink key={n.to} to={n.to} end={n.to==="/"} className={({isActive})=>`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${isActive?"bg-white/10 text-white":"text-white/70 hover:bg-white/5 hover:text-white"}`}>
            <n.icon className="w-4 h-4" />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-white/10">
        <button onClick={logout} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-white/70 hover:bg-white/5 hover:text-white">
          <IconGithub className="w-4 h-4" /> Sign out
        </button>
      </div>
    </aside>
  );
}

export default function App() {
  const { ready } = useAuth();
  if (!ready) return null;
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="min-h-screen bg-[#050507] text-white">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(99,102,241,0.25),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(40%_40%_at_80%_80%,rgba(139,92,246,0.18),transparent_60%)]" />
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(99,102,241,0.25),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(40%_40%_at_80%_80%,rgba(139,92,246,0.18),transparent_60%)]" />
      </div>
      <div className="flex">
        <Sidebar />
        <main className="flex-1 min-w-0 px-6 md:px-10 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/session" element={<Session />} />
            <Route path="/tests" element={<Tests />} />
            <Route path="/performance" element={<Performance />} />
            <Route path="/autopsy" element={<Autopsy />} />
            <Route path="/history" element={<History />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/telegram" element={<Telegram />} />
            <Route path="/allen" element={<Allen />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
