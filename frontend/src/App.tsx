import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "./context/auth";
import { useTheme } from "./context/theme";
import {
  IconDashboard,
  IconCalendar,
  IconTimer,
  IconBook,
  IconChart,
  IconActivity,
  IconHistory,
  IconSend,
  IconCloud,
  IconSettings,
  IconLock,
  IconSun,
  IconMoon,
  IconLogout,
  IconGithub,
} from "./lib/icons";
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
  { to: "/session", label: "Active Session", icon: IconTimer },
  { to: "/tests", label: "Tests", icon: IconBook },
  { to: "/performance", label: "Performance", icon: IconChart },
  { to: "/autopsy", label: "Test Autopsy", icon: IconActivity },
  { to: "/history", label: "History", icon: IconHistory },
  { to: "/analytics", label: "Analytics", icon: IconActivity },
  { to: "/telegram", label: "Telegram", icon: IconSend },
  { to: "/allen", label: "Allen", icon: IconCloud },
  { to: "/settings", label: "Settings", icon: IconSettings },
];

function Sidebar() {
  const { logout } = useAuth();
  const { theme, toggle } = useTheme();
  return (
    <aside className="hidden md:flex flex-col w-60 border-r border-border bg-card/50 shrink-0 h-screen sticky top-0">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <IconLock />
        </div>
        <div>
          <div className="font-bold tracking-tight leading-none">LOCKEDIN</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Study Command Center</div>
        </div>
      </div>
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`
            }
          >
            <n.icon className="w-4 h-4" />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 space-y-1 border-t border-border">
        <button onClick={toggle} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
          {theme === "dark" ? <IconSun className="w-4 h-4" /> : <IconMoon className="w-4 h-4" />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
        <button onClick={logout} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
          <IconLogout className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

function MobileNav() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur">
      <div className="flex overflow-x-auto">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => `flex-1 min-w-[64px] flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}>
            <n.icon className="w-4 h-4" />
            {n.label.split(" ")[0]}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export default function App() {
  const { token, ready } = useAuth();
  const navigate = useNavigate();

  if (!ready) return null;

  if (!token) return <Login />;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0 px-4 md:px-8 py-6 md:py-8 pb-24 md:pb-8">
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
      <MobileNav />
    </div>
  );
}