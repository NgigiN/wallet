import { NavLink, Outlet } from "react-router";
const tabs = [
  { to: "/", label: "Inbox", icon: "📥" }, { to: "/add", label: "Add", icon: "➕" },
  { to: "/stats", label: "Stats", icon: "📊" }, { to: "/settings", label: "Settings", icon: "⚙️" },
];
export function Shell() {
  return (
    <div className="shell">
      <nav className="tabbar" aria-label="Main">
        {tabs.map((t) => <NavLink key={t.to} to={t.to} end={t.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}><span className="icon">{t.icon}</span>{t.label}</NavLink>)}
      </nav>
      <main className="shell-main"><Outlet /></main>
    </div>
  );
}
