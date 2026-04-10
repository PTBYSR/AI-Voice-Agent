"use client";

import { useState, useEffect } from "react";
import AdminHome from "./AdminHome";
import AdminKB from "./AdminKB";
import AdminVoice from "./AdminVoice";
import AdminHistory from "./AdminHistory";
import AdminEscalations from "./AdminEscalations";

type Page = "home" | "kb" | "voice" | "history" | "escalation";

const ADMIN_PASSWORD = "relaypay-admin-2026";

// ── SVG Icons ─────────────────────────────────────────────────────────────────

function IconHome({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#0C8C8C" : "#94a3b8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12L12 3L21 12V21H15V15H9V21H3V12Z" />
    </svg>
  );
}

function IconKB({ active }: { active: boolean }) {
  const c = active ? "#0C8C8C" : "#94a3b8";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
    </svg>
  );
}

function IconVoice({ active }: { active: boolean }) {
  const c = active ? "#0C8C8C" : "#94a3b8";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function IconHistory({ active }: { active: boolean }) {
  const c = active ? "#0C8C8C" : "#94a3b8";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconEscalation({ active }: { active: boolean }) {
  const c = active ? "#0C8C8C" : "#94a3b8";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
      <line x1="12" y1="9" x2="12" y2="13"></line>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
  );
}

const NAV_ITEMS: { id: Page; label: string; Icon: React.FC<{ active: boolean }> }[] = [
  { id: "home",       label: "Home",           Icon: IconHome },
  { id: "kb",         label: "Knowledge Base", Icon: IconKB },
  { id: "voice",      label: "Voice Agent",    Icon: IconVoice },
  { id: "history",    label: "Call History",   Icon: IconHistory },
  { id: "escalation", label: "Escalations",    Icon: IconEscalation },
];

// ── Shell ─────────────────────────────────────────────────────────────────────

export default function AdminClient() {
  const [authed, setAuthed] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [page, setPage] = useState<Page>("home");

  useEffect(() => {
    const isAuthed = sessionStorage.getItem("relaypay_admin_authed") === "true";
    if (isAuthed) {
      setAuthed(true);
    }
  }, []);

  function handleLogin() {
    if (passwordInput === ADMIN_PASSWORD) {
      setAuthed(true);
      sessionStorage.setItem("relaypay_admin_authed", "true");
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  }

  // ── Password gate ────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center p-4">
        <div className="bg-white border border-[#E2E5EA] rounded-2xl shadow-sm p-8 w-full max-w-sm flex flex-col gap-6">
          <div className="flex flex-col items-center text-center">
            <img src="/logo.png" alt="RelayPay Logo" className="w-12 h-12 object-contain mb-4" />
            <p className="text-xl font-semibold text-[#0A2540]">RelayPay Admin</p>
            <p className="text-sm text-[#4F5B66] mt-1">Enter your password to continue</p>
          </div>
          <input
            type="password"
            placeholder="Password"
            value={passwordInput}
            autoFocus
            onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false); }}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            className="w-full border border-[#E2E5EA] rounded-xl px-4 py-3 text-sm text-[#0A2540] placeholder-[#B0B8C1] focus:outline-none focus:ring-2 focus:ring-[#0C8C8C]"
          />
          {passwordError && <p className="text-xs text-[#C0392B] -mt-2">Incorrect password.</p>}
          <button
            onClick={handleLogin}
            className="w-full bg-[#0A2540] text-white text-sm font-semibold rounded-xl py-3 hover:opacity-90 transition-opacity"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  // ── Dashboard ────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen bg-[#F7F8FA]">

      {/* Sidebar — desktop */}
      <aside className="hidden md:flex flex-col items-center w-16 bg-[#0A1F44] py-6 gap-2 fixed top-0 left-0 h-full z-20">
        {/* Logo */}
        <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center mb-4 shrink-0 overflow-hidden p-1.5">
          <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
        </div>

        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            title={label}
            className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors group ${
              page === id ? "bg-white/10" : "hover:bg-white/5"
            }`}
          >
            <Icon active={page === id} />
            {/* Tooltip */}
            <span className="absolute left-14 bg-[#0A1F44] text-white text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-lg border border-white/10">
              {label}
            </span>
          </button>
        ))}
      </aside>

      {/* Main content */}
      <div className="flex-1 md:ml-16 flex flex-col pb-16 md:pb-0">
        <main className="flex-1 p-6 md:p-8">
          {page === "home"       && <AdminHome onNavigate={setPage} />}
          {page === "kb"         && <AdminKB />}
          {page === "voice"      && <AdminVoice />}
          {page === "history"    && <AdminHistory />}
          {page === "escalation" && <AdminEscalations />}
        </main>
      </div>

      {/* Bottom nav — mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0A1F44] flex justify-around items-center h-16 z-20">
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            className="flex flex-col items-center gap-1 px-3"
          >
            <Icon active={page === id} />
            <span className={`text-[10px] font-medium ${page === id ? "text-[#0C8C8C]" : "text-[#94a3b8]"}`}>
              {label}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
