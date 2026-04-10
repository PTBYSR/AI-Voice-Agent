"use client";

import VoicePanel from "@/components/VoicePanel";
import AdminHistory from "./AdminHistory";
import AdminEscalations from "./AdminEscalations";

export default function AdminVoice() {
  return (
    <div className="flex flex-col xl:flex-row gap-8 w-full max-w-[1400px] mx-auto">
      {/* Left Column: Voice Agent Panel */}
      <div className="w-full xl:w-[400px] flex-shrink-0 flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#0A2540] tracking-tight">Test Voice Agent</h1>
          <p className="text-sm text-[#4F5B66] mt-1">Sandbox environment. Calls made here will not pollute production data.</p>
        </div>
        <VoicePanel isTestMode={true} />
      </div>

      {/* Right Column: Scoped DB Logs */}
      <div className="flex-1 flex flex-col gap-12 bg-[#F7F8FA] rounded-2xl p-6 border border-[#E2E5EA]">
        <div>
          <div className="mb-4">
             <h2 className="text-lg font-bold text-[#0A2540]">Test Logs</h2>
             <p className="text-xs text-[#4F5B66]">Test Call History</p>
          </div>
          <AdminHistory isTestMode={true} isCompact={true} />
        </div>
        
        <div className="pt-8 border-t border-[#E2E5EA]">
          <div className="mb-4">
             <h2 className="text-lg font-bold text-[#0A2540]">Test Escalations</h2>
             <p className="text-xs text-[#4F5B66]">Any escalation submissions logged during testing.</p>
          </div>
          <AdminEscalations isTestMode={true} isCompact={true} />
        </div>
      </div>
    </div>
  );
}
