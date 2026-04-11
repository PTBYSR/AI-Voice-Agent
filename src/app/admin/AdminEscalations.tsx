"use client";

import { useEffect, useState, useMemo } from "react";
import { sbFetch } from "@/lib/supabase";
import { FilterBar } from "@/components/ui/FilterBar";
import { SideDrawer } from "@/components/ui/SideDrawer";

interface Escalation {
  id: number;
  call_id: string;
  user_name: string;
  user_email: string;
  category: string;
  escalation_reason: string;
  call_booked: boolean;
  appointment_time: string;
  status: string;
  created_at: string;
  is_test?: boolean;
  meet_link?: string;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  if (s === "open") {
    return <span className="px-2 py-1 rounded bg-[#C0392B]/10 text-[#C0392B] text-[10px] font-bold uppercase tracking-wider">Open</span>;
  }
  if (s === "in progress") {
    return <span className="px-2 py-1 rounded bg-[#F39C12]/10 text-[#F39C12] text-[10px] font-bold uppercase tracking-wider">In Progress</span>;
  }
  if (s === "resolved") {
    return <span className="px-2 py-1 rounded bg-[#00C9A7]/10 text-[#00916E] text-[10px] font-bold uppercase tracking-wider">Resolved</span>;
  }
  return <span className="px-2 py-1 rounded bg-[#00C9A7]/10 text-[#00916E] text-[10px] font-bold uppercase tracking-wider">{status || "Closed"}</span>;
}

function LiveCountdown({ targetDate }: { targetDate: string }) {
  const [timeLeft, setTimeLeft] = useState<string>("");

  useEffect(() => {
    function update() {
      const target = new Date(targetDate).getTime();
      if (isNaN(target)) {
        setTimeLeft("");
        return;
      }

      const diff = target - Date.now();
      if (diff <= 0) {
        setTimeLeft("Meeting has started or passed");
        return;
      }

      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);

      const parts = [];
      if (d > 0) parts.push(`${d}d`);
      if (h > 0 || d > 0) parts.push(`${h}h`);
      parts.push(`${m}m`);
      if (d === 0 || (d === 0 && h === 0)) parts.push(`${s}s`); // only show seconds if < 1 day

      setTimeLeft(`in ${parts.join(" ")}`);
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  if (!timeLeft) return null;

  return (
    <span className="px-2 py-0.5 bg-[#0C8C8C]/10 text-[#0C8C8C] rounded-full text-[10px] font-bold tracking-tight">
      {timeLeft}
    </span>
  );
}

export default function AdminEscalations({ isTestMode = false, isCompact = false }: { isTestMode?: boolean, isCompact?: boolean } = {}) {
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [selectedEscalation, setSelectedEscalation] = useState<Escalation | null>(null);
  const [escalationToResolve, setEscalationToResolve] = useState<Escalation | null>(null);

  useEffect(() => {
    fetchEscalations();
  }, [isTestMode]);

  async function fetchEscalations() {
    setLoading(true);
    setError(null);
    try {
      const queryExt = isTestMode ? "&is_test=eq.true" : "&or=(is_test.is.null,is_test.eq.false)";
      const res = await sbFetch(`escalations?select=*&order=created_at.desc${queryExt}`);
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Failed to load escalations");
      }
      const data: Escalation[] = await res.json();
      
      // Secondary filter by name in case flag is missing (legacy)
      const fData = data.filter(e => {
        const hasTestFlag = e.is_test;
        const hasTestName = e.user_name?.startsWith("[TEST]");
        const isTest = hasTestFlag || hasTestName;
        return isTestMode ? isTest : !isTest;
      });
      
      setEscalations(fData || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Unknown error occurred");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Are you sure you want to delete this escalation? This cannot be undone.")) return;
    
    setEscalations(escalations.filter(e => e.id !== id));
    if (selectedEscalation?.id === id) setSelectedEscalation(null);

    try {
      await sbFetch(`escalations?id=eq.${id}`, { method: "DELETE" });
    } catch (e) {
      console.error("Failed to delete", e);
      fetchEscalations();
    }
  }

  async function handleResolve(id: number) {
    setEscalationToResolve(null);
    
    // Optimistic update
    setEscalations(escalations.map(e => e.id === id ? { ...e, status: "Resolved" } : e));
    if (selectedEscalation?.id === id) {
      setSelectedEscalation({ ...selectedEscalation, status: "Resolved" });
    }

    try {
      await sbFetch(`escalations?id=eq.${id}`, { 
        method: "PATCH",
        body: JSON.stringify({ status: "Resolved" })
      });
    } catch (e) {
      console.error("Failed to resolve", e);
      fetchEscalations();
    }
  }

  const filteredEscalations = useMemo(() => {
    return escalations.filter(esc => {
      const searchMatch = !search || 
        (esc.user_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (esc.user_email || "").toLowerCase().includes(search.toLowerCase()) ||
        (esc.escalation_reason || "").toLowerCase().includes(search.toLowerCase());
        
      const catMatch = !categoryFilter || (esc.category || "General").toLowerCase() === categoryFilter.toLowerCase();
      const statusMatch = !statusFilter || (esc.status || "").toLowerCase() === statusFilter.toLowerCase();
        
      return searchMatch && catMatch && statusMatch;
    });
  }, [escalations, search, categoryFilter, statusFilter]);

  const filterConfig = [
    {
      key: "status",
      label: "All Statuses",
      value: statusFilter,
      onChange: setStatusFilter,
      options: [
        { label: "Open", value: "open" },
        { label: "In Progress", value: "in progress" },
        { label: "Resolved", value: "resolved" },
        { label: "Closed", value: "closed" },
      ]
    },
    {
      key: "category",
      label: "All Categories",
      value: categoryFilter,
      onChange: setCategoryFilter,
      options: [
        { label: "General", value: "general" },
        { label: "Compliance", value: "compliance" },
        { label: "Account", value: "account" },
        { label: "Dispute", value: "dispute" },
      ]
    }
  ];

  return (
    <div className={`flex flex-col ${isCompact ? "gap-4" : "gap-6"} max-w-6xl`}>
      {!isCompact && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-[#0A2540] tracking-tight">Escalations</h1>
              <p className="text-sm text-[#4F5B66] mt-1">Manage and audit support escalations.</p>
            </div>
            <button
              onClick={fetchEscalations}
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
            searchPlaceholder="Search by name, email, or reason..."
            searchValue={search}
            onSearchChange={setSearch}
            filters={filterConfig}
          />
        </>
      )}

      {error ? (
        <div className="bg-[#C0392B]/10 text-[#C0392B] p-4 rounded-xl text-sm border border-[#C0392B]/20">
          {error}
        </div>
      ) : (
        <div className={`bg-white border border-[#E2E5EA] ${isCompact ? "rounded-lg" : "rounded-xl shadow-sm"} overflow-hidden flex flex-col`}>
          <div className="overflow-x-auto">
            {loading && escalations.length === 0 ? (
              <div className="p-12 flex justify-center">
                <span className="w-6 h-6 border-2 border-[#0C8C8C] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredEscalations.length === 0 ? (
              <div className="p-12 text-center text-[#4F5B66] text-sm font-medium">
                No escalations found matching filters.
              </div>
            ) : (
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-[#F7F8FA] border-b border-[#E2E5EA] text-[#4F5B66] font-semibold text-[10px] uppercase tracking-wider sticky top-0 z-10">
                  <tr>
                    <th className={`${isCompact ? "px-3 py-2" : "px-6 py-4"}`}>Date</th>
                    <th className={`${isCompact ? "px-3 py-2" : "px-6 py-4"}`}>User</th>
                    {!isCompact && <th className="px-6 py-4">Category</th>}
                    <th className={`${isCompact ? "px-3 py-2" : "px-6 py-4"} text-center`}>Status</th>
                    <th className={`${isCompact ? "px-3 py-2" : "px-6 py-4"} text-right`}>{isCompact ? "Time" : "Appt Time"}</th>
                    <th className={`${isCompact ? "px-3 py-2" : "px-6 py-4"} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E5EA]">
                  {filteredEscalations.map((esc) => {
                    return (
                      <tr key={esc.id} className="hover:bg-[#F7F8FA]/50 transition-colors cursor-pointer" onClick={() => setSelectedEscalation(esc)}>
                        <td className={`${isCompact ? "px-3 py-2" : "px-6 py-4"} text-[#4F5B66]`}>{formatDate(esc.created_at)}</td>
                        <td className={`${isCompact ? "px-3 py-2" : "px-6 py-4"}`}>
                          <p className="font-semibold text-[#0A2540] truncate max-w-[100px]">{esc.user_name}</p>
                          {!isCompact && <p className="text-xs text-[#94a3b8]">{esc.user_email}</p>}
                        </td>
                        {!isCompact && <td className="px-6 py-4 text-[#4F5B66] capitalize">{esc.category || "General"}</td>}
                        <td className={`${isCompact ? "px-3 py-2" : "px-6 py-4"} text-center`}>
                          <StatusBadge status={esc.status} />
                        </td>
                        <td className={`${isCompact ? "px-3 py-2" : "px-6 py-4"} text-right text-[#0A2540]`}>
                          {esc.call_booked || esc.appointment_time ? (
                            <span className="font-medium text-xs whitespace-nowrap">{formatDate(esc.appointment_time)}</span>
                          ) : (
                            <span className="text-[#94a3b8] italic text-xs">No</span>
                          )}
                        </td>
                        <td className={`${isCompact ? "px-3 py-2" : "px-6 py-4"} text-right`}>
                          <button className="text-[#0C8C8C] hover:text-[#0C8C8C]/80 font-semibold text-xs text-xs">
                             {isCompact ? "View" : "Details"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <SideDrawer 
        isOpen={!!selectedEscalation} 
        onClose={() => setSelectedEscalation(null)}
        title="Escalation Details"
        subtitle={selectedEscalation ? `For ${selectedEscalation.user_name}` : ""}
      >
        {selectedEscalation && (
          <div className="flex flex-col gap-8">
             <div className="bg-white p-4 rounded-xl border border-[#E2E5EA] shadow-sm flex flex-col gap-1">
                <p className="text-sm font-semibold text-[#0A2540]">{selectedEscalation.user_name}</p>
                <p className="text-sm text-[#4F5B66]">{selectedEscalation.user_email}</p>
             </div>

             <div className="grid grid-cols-2 gap-4">
                <div>
                   <p className="text-[10px] uppercase font-bold text-[#94a3b8] tracking-wider mb-1">Received On</p>
                   <p className="text-sm text-[#0A2540]">{formatDate(selectedEscalation.created_at)}</p>
                </div>
                <div>
                   <p className="text-[10px] uppercase font-bold text-[#94a3b8] tracking-wider mb-1">Status</p>
                   <StatusBadge status={selectedEscalation.status} />
                </div>
                <div>
                   <p className="text-[10px] uppercase font-bold text-[#94a3b8] tracking-wider mb-1">Appointment Time</p>
                   {selectedEscalation.appointment_time ? (
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-[#0A2540]">{formatDate(selectedEscalation.appointment_time)}</p>
                          <LiveCountdown targetDate={selectedEscalation.appointment_time} />
                        </div>
                        {selectedEscalation.meet_link && (
                          <a href={selectedEscalation.meet_link} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-[#00C9A7] hover:text-[#00916E] hover:underline flex items-center gap-1 mt-1.5">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                            Join Google Meet
                          </a>
                        )}
                      </div>
                   ) : <p className="text-sm text-[#94a3b8]">—</p>}
                </div>
                <div>
                   <p className="text-[10px] uppercase font-bold text-[#94a3b8] tracking-wider mb-1">Category</p>
                   <p className="text-sm text-[#0A2540] capitalize">{selectedEscalation.category || "General"}</p>
                </div>
             </div>

             <div>
               <h3 className="text-sm font-semibold text-[#0A2540] mb-2">Escalation Reason</h3>
               <div className="bg-[#C0392B]/5 border border-[#C0392B]/20 p-4 rounded-xl">
                 <p className="text-sm text-[#C0392B]/90 italic leading-relaxed">
                   "{selectedEscalation.escalation_reason}"
                 </p>
               </div>
             </div>

             {selectedEscalation.call_id && (
                <div>
                  <h3 className="text-sm font-semibold text-[#0A2540] mb-2">Associated Voice Call</h3>
                  <div className="bg-white border border-[#E2E5EA] px-4 py-3 rounded-xl flex items-center justify-between">
                     <span className="font-mono text-xs text-[#4F5B66]">{selectedEscalation.call_id}</span>
                     <span className="text-[10px] uppercase font-bold text-[#94a3b8] tracking-wider bg-[#F7F8FA] px-2 py-1 rounded">Read-Only</span>
                  </div>
                </div>
             )}

             <div className="pt-6 border-t border-[#E2E5EA] mt-4 flex justify-between">
               {selectedEscalation.status?.toLowerCase() !== "resolved" ? (
                 <button 
                   onClick={() => setEscalationToResolve(selectedEscalation)}
                   className="px-4 py-2 bg-[#0A2540] text-white border border-transparent hover:opacity-90 rounded-lg text-sm font-semibold transition-opacity shadow-sm"
                 >
                   Mark as Resolved
                 </button>
               ) : <div />}
               <button 
                 onClick={() => handleDelete(selectedEscalation.id)}
                 className="px-4 py-2 bg-white border border-[#C0392B] text-[#C0392B] hover:bg-[#C0392B] hover:text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
               >
                 Delete Record
               </button>
             </div>
          </div>
        )}
      </SideDrawer>

      {/* Confirmation Modal */}
      {escalationToResolve && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-[fadeSlideUp_0.2s_ease-out]">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm flex flex-col gap-4 animate-[fadeSlideDown_0.3s_ease-out]">
            <h3 className="text-lg font-semibold text-[#0A2540]">Mark as Resolved</h3>
            <p className="text-sm text-[#4F5B66]">
              Are you sure you want to resolve the escalation for <strong>{escalationToResolve.user_name}</strong>?
            </p>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => setEscalationToResolve(null)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-[#4F5B66] hover:bg-[#F7F8FA] border border-[#E2E5EA] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleResolve(escalationToResolve.id)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-[#00C9A7] hover:bg-[#00916E] transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
