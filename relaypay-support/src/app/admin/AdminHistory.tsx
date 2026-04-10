"use client";

import { useEffect, useState, useMemo } from "react";
import { sbFetch } from "@/lib/supabase";
import { FilterBar } from "@/components/ui/FilterBar";
import { SideDrawer } from "@/components/ui/SideDrawer";

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
  feedback_rating: number | null;
  created_at: string;
  is_test?: boolean;
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

function StatusBadge({ status }: { status: string | null }) {
  const s = (status || "").toLowerCase();
  if (s === "completed") {
    return <span className="px-2 py-1 rounded bg-[#27AE60]/10 text-[#27AE60] text-[10px] font-bold uppercase tracking-wider">Completed</span>;
  }
  if (s === "failed") {
    return <span className="px-2 py-1 rounded bg-[#C0392B]/10 text-[#C0392B] text-[10px] font-bold uppercase tracking-wider">Failed</span>;
  }
  return <span className="px-2 py-1 rounded bg-[#F59E0B]/10 text-[#F59E0B] text-[10px] font-bold uppercase tracking-wider">{status || "Unknown"}</span>;
}

function TranscriptView({ text }: { text: string | null }) {
  if (!text) return <p className="text-sm text-[#4F5B66]">No transcript available.</p>;
  
  const lines = text.split("\n");
  
  return (
    <div className="flex flex-col gap-3">
      {lines.map((line, i) => {
        if (!line.trim()) return null;
        const isAgent = line.startsWith("Agent:");
        const content = line.replace(/^(Agent|Customer):\s*/, "");
        
        return (
          <div key={i} className={`flex ${isAgent ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
              isAgent 
                ? "bg-white border border-[#E2E5EA] text-[#0A2540] rounded-tl-sm shadow-sm" 
                : "bg-rp-primary text-white rounded-tr-sm shadow-sm"
            }`}>
              <span className={`text-[10px] font-bold block mb-1 uppercase tracking-wider ${isAgent ? "text-[#94a3b8]" : "text-white/70"}`}>
                {isAgent ? "Agent" : "Customer"}
              </span>
              <p className="leading-relaxed">{content}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminHistory({ isTestMode = false, isCompact = false }: { isTestMode?: boolean, isCompact?: boolean } = {}) {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ratingFilter, setRatingFilter] = useState("");
  const [escalatedFilter, setEscalatedFilter] = useState("");
  
  const [selectedCall, setSelectedCall] = useState<CallRow | null>(null);

  useEffect(() => {
    fetchHistory();
  }, [isTestMode]);

  async function fetchHistory() {
    setLoading(true);
    try {
      const queryExt = isTestMode ? "&is_test=eq.true" : "&or=(is_test.is.null,is_test.eq.false)";
      const res = await sbFetch(`call_history?select=*&order=created_at.desc${queryExt}`);
      if (res.ok) {
        const rows = await res.json();
        setCalls(Array.isArray(rows) ? rows : []);
      }
    } catch (err) {
      console.error(err);
      setCalls([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Are you sure you want to delete this call record? This cannot be undone.")) return;
    
    setCalls(calls.filter(c => c.id !== id));
    if (selectedCall?.id === id) setSelectedCall(null);

    try {
      await sbFetch(`call_history?id=eq.${id}`, { method: "DELETE" });
    } catch (e) {
      console.error("Failed to delete", e);
      fetchHistory();
    }
  }

  const filteredCalls = useMemo(() => {
    return calls.filter(call => {
      const searchMatch = !search || 
        (call.transcript?.toLowerCase() || "").includes(search.toLowerCase()) ||
        (call.call_id?.toLowerCase() || "").includes(search.toLowerCase());
        
      const statusMatch = !statusFilter || (call.status || "").toLowerCase() === statusFilter.toLowerCase();
      const ratingMatch = !ratingFilter || call.feedback_rating?.toString() === ratingFilter;
      const escalatedMatch = !escalatedFilter || 
        (escalatedFilter === "true" && call.escalated) || 
        (escalatedFilter === "false" && !call.escalated);
        
      return searchMatch && statusMatch && ratingMatch && escalatedMatch;
    });
  }, [calls, search, statusFilter, ratingFilter, escalatedFilter]);

  const filterConfig = [
    {
      key: "status",
      label: "All Statuses",
      value: statusFilter,
      onChange: setStatusFilter,
      options: [
        { label: "Completed", value: "completed" },
        { label: "Failed", value: "failed" },
      ]
    },
    {
      key: "rating",
      label: "All Ratings",
      value: ratingFilter,
      onChange: setRatingFilter,
      options: [
        { label: "5 Stars", value: "5" },
        { label: "4 Stars", value: "4" },
        { label: "3 Stars", value: "3" },
        { label: "2 Stars", value: "2" },
        { label: "1 Star", value: "1" },
      ]
    },
    {
      key: "escalated",
      label: "All Escalations",
      value: escalatedFilter,
      onChange: setEscalatedFilter,
      options: [
        { label: "Escalated", value: "true" },
        { label: "Not Escalated", value: "false" }
      ]
    }
  ];

  return (
    <div className={`flex flex-col ${isCompact ? "gap-4" : "gap-6"} max-w-6xl`}>
      {!isCompact && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-[#0A2540] tracking-tight">Call History</h1>
              <p className="text-sm text-[#4F5B66] mt-1">All voice agent sessions logged by n8n.</p>
            </div>
            <button
              onClick={fetchHistory}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E2E5EA] rounded-lg text-sm font-semibold text-[#0A2540] hover:bg-[#F7F8FA] transition-colors shadow-sm disabled:opacity-50"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              )}
              Refresh
            </button>
          </div>

          <FilterBar 
            searchPlaceholder="Search transcripts or Call IDs..."
            searchValue={search}
            onSearchChange={setSearch}
            filters={filterConfig}
          />
        </>
      )}

      <div className={`bg-white border border-[#E2E5EA] ${isCompact ? "rounded-lg" : "rounded-xl shadow-sm"} overflow-hidden flex flex-col`}>
        <div className="overflow-x-auto">
          {loading && calls.length === 0 ? (
             <div className="p-12 flex justify-center">
               <span className="w-6 h-6 border-2 border-[#0C8C8C] border-t-transparent rounded-full animate-spin" />
             </div>
          ) : filteredCalls.length === 0 ? (
             <div className="p-12 text-center text-[#4F5B66] text-sm font-medium">
               No call history found.
             </div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-[#F7F8FA] border-b border-[#E2E5EA] text-[#4F5B66] font-semibold text-[10px] uppercase tracking-wider sticky top-0 z-10">
                <tr>
                   <th className={`${isCompact ? "px-3 py-2" : "px-6 py-4"}`}>Date</th>
                   {!isCompact && <th className="px-6 py-4">Call ID</th>}
                   {!isCompact && <th className="px-6 py-4">Duration</th>}
                   <th className={`${isCompact ? "px-3 py-2" : "px-6 py-4"} text-center`}>Rating</th>
                   {!isCompact && <th className="px-6 py-4 text-center">Status</th>}
                   <th className={`${isCompact ? "px-3 py-2" : "px-6 py-4"}`}>Escalation</th>
                   <th className={`${isCompact ? "px-3 py-2" : "px-6 py-4"} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E5EA]">
                {filteredCalls.map(call => (
                  <tr key={call.id} className="hover:bg-[#F7F8FA]/50 transition-colors cursor-pointer" onClick={() => setSelectedCall(call)}>
                    <td className={`${isCompact ? "px-3 py-2" : "px-6 py-4"} text-[#4F5B66]`}>{formatDate(call.started_at)}</td>
                    {!isCompact && (
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs text-[#0A2540] truncate max-w-[120px] inline-block" title={call.call_id || ""}>
                          {call.call_id || "—"}
                        </span>
                      </td>
                    )}
                    {!isCompact && <td className="px-6 py-4 text-[#4F5B66]">{formatDuration(call.duration_seconds)}</td>}
                    <td className={`${isCompact ? "px-3 py-2" : "px-6 py-4"} text-center`}>
                      {call.feedback_rating ? (
                        <span className={`inline-flex items-center gap-1 text-[#F59E0B] font-semibold ${isCompact ? "text-xs" : ""}`}>
                           ★ {call.feedback_rating}
                        </span>
                      ) : <span className="text-[#94a3b8]">—</span>}
                    </td>
                    {!isCompact && (
                      <td className="px-6 py-4 text-center">
                        <StatusBadge status={call.status} />
                      </td>
                    )}
                    <td className={`${isCompact ? "px-3 py-2" : "px-6 py-4"}`}>
                      {call.escalated ? (
                        <span className="px-2 py-0.5 rounded bg-[#C0392B]/10 text-[#C0392B] text-[9px] font-bold uppercase tracking-wider">Yes</span>
                      ) : <span className="text-[#94a3b8]">—</span>}
                    </td>
                    <td className={`${isCompact ? "px-3 py-2" : "px-6 py-4"} text-right`}>
                       <button className="text-[#0C8C8C] hover:text-[#0C8C8C]/80 font-semibold text-xs">
                          {isCompact ? "View" : "Details"}
                       </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <SideDrawer 
        isOpen={!!selectedCall} 
        onClose={() => setSelectedCall(null)}
        title="Call Details"
        subtitle={selectedCall ? `Call ID: ${selectedCall.call_id}` : ""}
      >
        {selectedCall && (
          <div className="flex flex-col gap-8">
             <div className="grid grid-cols-2 gap-4 bg-white p-4 rounded-xl border border-[#E2E5EA] shadow-sm">
                <div>
                   <p className="text-[10px] uppercase font-bold text-[#94a3b8] tracking-wider mb-1">Started</p>
                   <p className="text-sm font-semibold text-[#0A2540]">{formatDate(selectedCall.started_at)}</p>
                </div>
                <div>
                   <p className="text-[10px] uppercase font-bold text-[#94a3b8] tracking-wider mb-1">Duration</p>
                   <p className="text-sm font-semibold text-[#0A2540]">{formatDuration(selectedCall.duration_seconds)}</p>
                </div>
                <div>
                   <p className="text-[10px] uppercase font-bold text-[#94a3b8] tracking-wider mb-1">Status</p>
                   <StatusBadge status={selectedCall.status} />
                </div>
                <div>
                   <p className="text-[10px] uppercase font-bold text-[#94a3b8] tracking-wider mb-1">Rating</p>
                   {selectedCall.feedback_rating ? (
                     <span className="inline-flex items-center gap-1 text-[#F59E0B] font-semibold text-sm">
                        ★ {selectedCall.feedback_rating} / 5
                     </span>
                   ) : <span className="text-sm text-[#4F5B66]">—</span>}
                </div>
             </div>

             {selectedCall.escalated && (
               <div className="bg-[#C0392B]/5 border border-[#C0392B]/20 p-4 rounded-xl">
                 <div className="flex items-center gap-2 mb-2">
                   <span className="px-2 py-1 rounded bg-[#C0392B] text-white text-[10px] font-bold uppercase tracking-wider">Escalation Triggered</span>
                 </div>
                 <p className="text-sm font-semibold text-[#C0392B] mb-1">Reason:</p>
                 <p className="text-sm text-[#C0392B]/90 italic">{selectedCall.escalation_reason}</p>
               </div>
             )}

             <div>
               <h3 className="text-lg font-semibold text-[#0A2540] mb-4">Transcript</h3>
               <TranscriptView text={selectedCall.transcript} />
             </div>

             <div className="pt-6 border-t border-[#E2E5EA] mt-4 flex justify-end">
               <button 
                 onClick={() => handleDelete(selectedCall.id)}
                 className="px-4 py-2 bg-white border border-[#C0392B] text-[#C0392B] hover:bg-[#C0392B] hover:text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
               >
                 Delete Record
               </button>
             </div>
          </div>
        )}
      </SideDrawer>
    </div>
  );
}
