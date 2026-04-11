"use client";

import { useEffect, useState } from "react";

import { sbFetch } from "@/lib/supabase";

type Page = "home" | "kb" | "voice" | "history";

interface LastCall {
  started_at: string;
  duration_seconds: number | null;
  status: string;
}

function formatDuration(secs: number | null) {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const isYesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toDateString() === d.toDateString();

  const timeStr = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  let dateStr = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  if (isToday) dateStr = "Today";
  else if (isYesterday) dateStr = "Yesterday";

  return (
    <div className="flex flex-col leading-tight">
      <span className="text-sm font-medium text-[#4F5B66]">{dateStr}</span>
      <span className="text-2xl mt-0.5">{timeStr}</span>
    </div>
  );
}

function StatCard({
  label,
  sub,
  value,
  loading,
  accent,
  onClick,
}: {
  label: string;
  sub: string;
  value: React.ReactNode;
  loading: boolean;
  accent: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white border border-[#E2E5EA] rounded-2xl p-6 flex flex-col gap-3 shadow-sm ${onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${accent}18` }}>
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: accent }} />
      </div>
      <div>
        <p className="text-xs font-semibold text-[#4F5B66] uppercase tracking-wider">{label}</p>
        {loading ? (
          <div className="h-8 w-16 bg-[#F7F8FA] rounded-lg animate-pulse mt-1" />
        ) : (
          <div className="text-3xl font-semibold text-[#0A2540] mt-1 leading-none">{value}</div>
        )}
        <p className="text-xs text-[#B0B8C1] mt-1">{sub}</p>
      </div>
    </div>
  );
}

export default function AdminHome({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [docCount, setDocCount] = useState<number | null>(null);
  const [lastCall, setLastCall] = useState<LastCall | null | "none">(null);
  const [escalations, setEscalations] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      await Promise.all([
        sbFetch("processed_documents?select=id")
          .then((r) => r.json())
          .then((rows) => setDocCount(Array.isArray(rows) ? rows.length : 0))
          .catch(() => setDocCount(0)),

        sbFetch("call_history?select=started_at,duration_seconds,status&order=created_at.desc&limit=1")
          .then((r) => r.json())
          .then((rows) => setLastCall(Array.isArray(rows) && rows.length > 0 ? rows[0] : "none"))
          .catch(() => setLastCall("none")),

        (() => {
          const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          return sbFetch(`call_history?select=id&escalated=eq.true&created_at=gte.${since}`)
            .then((r) => r.json())
            .then((rows) => setEscalations(Array.isArray(rows) ? rows.length : 0))
            .catch(() => setEscalations(0));
        })(),
      ]);
      setLoading(false);
    }
    load();
  }, []);

  const lastCallValue =
    lastCall === null ? "—" :
    lastCall === "none" ? "No calls yet" :
    formatDate(lastCall.started_at);

  const lastCallSub =
    lastCall === "none" || lastCall === null
      ? "No calls recorded"
      : `${formatDuration(lastCall.duration_seconds)} · ${lastCall.status}`;

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-[#0A2540] tracking-tight">Dashboard</h1>
        <p className="text-sm text-[#4F5B66] mt-1">Overview of your RelayPay knowledge base and voice agent.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Processed Documents"
          sub="documents in knowledge base"
          value={docCount ?? "—"}
          loading={loading}
          accent="#0C8C8C"
          onClick={() => onNavigate("kb")}
        />
        <StatCard
          label="Last Voice Call"
          sub={lastCall !== null && lastCall !== "none" ? lastCallSub : "No calls recorded"}
          value={lastCall === "none" || lastCall === null ? (loading ? "—" : "None") : formatDate((lastCall as LastCall).started_at)}
          loading={loading}
          accent="#0A2540"
          onClick={() => onNavigate("history")}
        />
        <StatCard
          label="Escalation Flags"
          sub="escalations this week"
          value={escalations ?? 0}
          loading={loading}
          accent="#C0392B"
          onClick={() => onNavigate("history")}
        />
      </div>

      {/* Quick links */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-[#B0B8C1] uppercase tracking-wider">Quick actions</p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => onNavigate("kb")}
            className="text-sm font-semibold text-[#0A2540] bg-white border border-[#E2E5EA] rounded-xl px-4 py-2.5 hover:border-[#0C8C8C] hover:text-[#0C8C8C] transition-colors"
          >
            Upload document →
          </button>
          <button
            onClick={() => onNavigate("voice")}
            className="text-sm font-semibold text-[#0A2540] bg-white border border-[#E2E5EA] rounded-xl px-4 py-2.5 hover:border-[#0C8C8C] hover:text-[#0C8C8C] transition-colors"
          >
            Test voice agent →
          </button>
          <button
            onClick={() => onNavigate("history")}
            className="text-sm font-semibold text-[#0A2540] bg-white border border-[#E2E5EA] rounded-xl px-4 py-2.5 hover:border-[#0C8C8C] hover:text-[#0C8C8C] transition-colors"
          >
            View call history →
          </button>
        </div>
      </div>
    </div>
  );
}
