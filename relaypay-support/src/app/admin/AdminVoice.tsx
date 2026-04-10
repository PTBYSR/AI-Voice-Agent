"use client";

import VoicePanel from "@/components/VoicePanel";
import HelpLine from "@/components/HelpLine";

export default function AdminVoice() {
  return (
    <div className="flex flex-col gap-8 max-w-xl">
      <div>
        <h1 className="text-2xl font-semibold text-[#0A2540] tracking-tight">Voice Agent</h1>
        <p className="text-sm text-[#4F5B66] mt-1">Test the RelayPay voice support assistant.</p>
      </div>
      <VoicePanel />
      <HelpLine />
    </div>
  );
}
