"use client";

import { useEffect, useState } from "react";

const SUPABASE_URL = "https://qfkwdfqrkrgjejzqxrsm.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFma3dkZnFya3JnamVqenF4cnNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MjA5NzksImV4cCI6MjA5MTI5Njk3OX0.LWA3bEOc9mwMHhSCgbg36jTt7VJJHVBEvUVQCbpMfuw";

interface CallRow {
  id: number;
  call_id: string | null;
  status: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  transcript: string | null;
  escalated: boolean;
  escalation_reason: string | null;
  created_at: string;
}

function formatDuration(secs: number | null) {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function StatusDot({ status }: { status: string | null }) {
  const color =
    status === "completed" ? "#27AE60" :
    status === "failed"    ? "#C0392B" :
    "#F59E0B";
  const label =
    status === "completed" ? "Completed" :
    status === "failed"    ? "Failed" :
    status ?? "Unknown";
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color }}>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export default function AdminHistory() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetch(
      `${SUPABASE_URL}/rest/v1/call_history?select=*&order=created_at.desc`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    )
      .then((r) => r.json())
      .then((rows) => setCalls(Array.isArray(rows) ? rows : []))
      .catch(() => setCalls([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-[#0A2540] tracking-tight">Call History</h1>
        <p className="text-sm text-[#4F5B66] mt-1">All voice agent sessions logged by n8n.</p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-white border border-[#E2E5EA] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : calls.length === 0 ? (
        <div className="bg-white border border-[#E2E5EA] rounded-2xl p-12 text-center">
          <p className="text-2xl mb-2">📞</p>
          <p className="text-sm font-semibold text-[#0A2540]">No call history yet</p>
          <p className="text-xs text-[#4F5B66] mt-1 max-w-xs mx-auto">
            Calls will appear here once the voice agent is used and n8n logs them.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {calls.map((call) => {
            const isOpen = expanded === call.id;
            return (
              <div key={call.id} className="bg-white border border-[#E2E5EA] rounded-xl overflow-hidden">
                {/* Row */}
                <button
                  onClick={() => setExpanded(isOpen ? null : call.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-[#F7F8FA] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#0A2540]">{formatDate(call.started_at)}</p>
                    <p className="text-xs text-[#4F5B66] mt-0.5">{formatDuration(call.duration_seconds)}</p>
                  </div>

                  <StatusDot status={call.status} />

                  {call.escalated && (
                    <span className="text-xs font-semibold text-[#C0392B] bg-[#C0392B]/10 px-2 py-0.5 rounded-full">
                      Escalated
                    </span>
                  )}

                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="#B0B8C1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Detail panel */}
                {isOpen && (
                  <div className="border-t border-[#E2E5EA] px-5 py-4 flex flex-col gap-4 bg-[#F7F8FA]">
                    {/* Meta */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {[
                        ["Call ID", call.call_id ?? "—"],
                        ["Status", call.status ?? "—"],
                        ["Started", formatDate(call.started_at)],
                        ["Ended", formatDate(call.ended_at)],
                        ["Duration", formatDuration(call.duration_seconds)],
                        ["Escalated", call.escalated ? "Yes" : "No"],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <p className="text-[#B0B8C1] font-medium">{k}</p>
                          <p className="text-[#0A2540] font-semibold mt-0.5 break-all">{v}</p>
                        </div>
                      ))}
                    </div>

                    {call.escalation_reason && (
                      <div>
                        <p className="text-xs text-[#B0B8C1] font-medium mb-1">Escalation reason</p>
                        <p className="text-xs text-[#C0392B] bg-[#C0392B]/8 rounded-lg px-3 py-2 leading-relaxed">
                          {call.escalation_reason}
                        </p>
                      </div>
                    )}

                    {call.transcript ? (
                      <div>
                        <p className="text-xs text-[#B0B8C1] font-medium mb-1">Transcript</p>
                        <div className="bg-white border border-[#E2E5EA] rounded-xl px-4 py-3 max-h-64 overflow-y-auto">
                          <pre className="text-xs text-[#0A2540] whitespace-pre-wrap leading-relaxed font-sans">
                            {call.transcript}
                          </pre>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-[#B0B8C1]">No transcript available.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
