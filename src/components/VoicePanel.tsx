"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Vapi from "@vapi-ai/web";
import { sbFetch } from "@/lib/supabase";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const VAPI_PUBLIC_KEY = "4d545128-691c-483f-85f8-4488e746b9b0";
const ASSISTANT_ID = "ab929d29-0f65-4c0e-9d5b-79515f090218";
const ESCALATION_WEBHOOK = "https://cohort2pod1.app.n8n.cloud/webhook/vapi-tool-call";

const BAR_COUNT = 24;

type CallStatus = "idle" | "connecting" | "connected" | "ended";

interface TranscriptLine {
  role: "user" | "assistant";
  text: string;
}

const statusConfig: Record<CallStatus, { dot: string; label: string }> = {
  idle:       { dot: "bg-gray-400",                      label: "Ready to listen" },
  connecting: { dot: "bg-yellow-400 animate-pulse",      label: "Connecting..." },
  connected:  { dot: "bg-rp-success animate-pulse",      label: "Connected" },
  ended:      { dot: "bg-gray-400",                      label: "Call ended" },
};

function MicIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
      viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function PhoneOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
      viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.26 9.27 2 2 0 0 1 2.09 7.08V4.09A2 2 0 0 1 3.81 2.1a12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 2.11.45l-1.27 1.27" />
      <line x1="23" y1="1" x2="1" y2="23" />
    </svg>
  );
}

// ── Audio waveform visualiser ──────────────────────────────────
function WaveVisualiser({ bars }: { bars: number[] }) {
  return (
    <div className="flex items-center justify-center gap-[3px] h-8 w-full">
      {bars.map((h, i) => (
        <div
          key={i}
          className="rounded-full bg-rp-accent transition-all duration-75"
          style={{
            width: 3,
            height: `${Math.max(4, h * 32)}px`,
            opacity: 0.3 + h * 0.7,
          }}
        />
      ))}
    </div>
  );
}

const TIME_SLOTS = [
  "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM", 
  "11:00 AM", "11:30 AM", "12:00 PM"
];

// ── Escalation Form Overlay ────────────────────────────────────
function EscalationForm({
  visible,
  onClose,
  onSuccess,
  isTestMode = false,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  isTestMode?: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [animState, setAnimState] = useState<"entering" | "visible" | "exiting" | "hidden">("hidden");
  const [busyDates, setBusyDates] = useState<Date[]>([]);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(false);

  // Fetch busy dates when form becomes visible
  useEffect(() => {
    if (visible && animState === "entering") {
      const fetchBusyDates = async () => {
        setIsLoadingCalendar(true);
        try {
          // TODO: Replace with your actual n8n webhook URL
          const res = await fetch("https://cohort2pod1.app.n8n.cloud/webhook/get-busy-dates");
          if (res.ok) {
            const data = await res.json();
            if (data.busyDates && Array.isArray(data.busyDates)) {
              setBusyDates(data.busyDates.map((d: string) => new Date(d)));
            }
          }
        } catch (err) {
          console.error("Failed to fetch calendar availability", err);
        } finally {
          setIsLoadingCalendar(false);
        }
      }
      fetchBusyDates();
    }
  }, [visible, animState]);

  // Calculate tomorrow for min validation
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDateStr = tomorrow.toISOString().split("T")[0];

  // Manage enter/exit animations
  useEffect(() => {
    if (visible) {
      if (animState === "hidden" || animState === "exiting") {
        setAnimState("entering");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setAnimState("visible"));
        });
      }
    } else {
      if (animState === "visible" || animState === "entering") {
        setAnimState("exiting");
      }
    }
  }, [visible]);

  useEffect(() => {
    if (animState === "exiting") {
      const timer = setTimeout(() => {
        setAnimState("hidden");
        // Reset form state when fully hidden
        setName("");
        setEmail("");
        setSelectedDate(null);
        setSelectedSlot("");
        setError(null);
        setSubmitting(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [animState]);

  if (animState === "hidden") return null;

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const allFilled = name.trim() && email.trim() && selectedDate && selectedSlot;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!allFilled) return;
    if (!isEmailValid) {
      setError("Please enter a valid email address.");
      return;
    }

    setSubmitting(true);

    // Convert date + slot to ISO 8601 format
    let isoTime = "";
    if (selectedDate) {
      const dateStr = selectedDate.toISOString().split("T")[0];
      isoTime = `${dateStr} at ${selectedSlot}`;
      try {
        const [hourStr, minPart] = selectedSlot.split(":");
        const [minStr, ampm] = minPart.split(" ");
        let hour = parseInt(hourStr);
        const min = parseInt(minStr);
        if (ampm === "PM" && hour < 12) hour += 12;
        if (ampm === "AM" && hour === 12) hour = 0;
        
        const d = new Date(selectedDate);
        d.setHours(hour, min, 0, 0);
        isoTime = d.toISOString();
      } catch (e) {
        console.error("Failed to parse ISO time, falling back to string", e);
      }
    }

    const toolCallId = `form-escalation-${Date.now()}`;
    const toolCallObj = {
      id: toolCallId,
      type: "function",
      function: {
        name: "submit_escalation",
        arguments: {
          user_name: isTestMode ? `[TEST] ${name.trim()}` : name.trim(),
          user_email: email.trim(),
          preferred_time: isoTime,
          reason: "Escalation triggered during voice support call",
          is_test: isTestMode,
        },
      },
    };

    const payload = {
      message: {
        type: "tool-calls",
        toolCalls: [toolCallObj],
        toolCallList: [toolCallObj],
      },
    };

    try {
      const res = await fetch(ESCALATION_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      onSuccess();
    } catch {
      setError("Something went wrong. Please try again or email support@relaypay.co");
      setSubmitting(false);
    }
  }

  const opacity = animState === "visible" ? "opacity-100" : "opacity-0";

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${opacity}`}
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={!submitting ? onClose : undefined}
      />

      {/* Modal */}
      <form
        onSubmit={handleSubmit}
        className={`relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 flex flex-col gap-6 transition-all duration-300 ${
          animState === "visible" ? "translate-y-0 scale-100" : "translate-y-4 scale-95"
        }`}
      >
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-rp-accent shrink-0" />
            <h2 className="text-lg font-semibold text-rp-primary tracking-tight">
              Schedule a Support Callback
            </h2>
          </div>
          <p className="text-xs text-rp-text-muted ml-4">
            A specialist will reach out at your preferred time.
          </p>
        </div>

        {/* Fields */}
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-rp-primary mb-1.5">
              Full Name <span className="text-rp-error">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              disabled={submitting}
              className="w-full border border-rp-border rounded-xl px-4 py-3 text-sm text-rp-primary placeholder-rp-text-faint focus:outline-none focus:ring-2 focus:ring-rp-accent disabled:opacity-50 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-rp-primary mb-1.5">
              Email Address <span className="text-rp-error">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              placeholder="you@example.com"
              disabled={submitting}
              className="w-full border border-rp-border rounded-xl px-4 py-3 text-sm text-rp-primary placeholder-rp-text-faint focus:outline-none focus:ring-2 focus:ring-rp-accent disabled:opacity-50 transition-all"
            />
          </div>

          <div className="flex flex-col gap-3">
            <label className="block text-xs font-semibold text-rp-primary flex items-center justify-between">
              <span>Preferred Callback Date <span className="text-rp-error">*</span></span>
              {isLoadingCalendar && <span className="text-[10px] text-rp-text-muted animate-pulse">Loading calendar...</span>}
            </label>
            <DatePicker
              selected={selectedDate}
              onChange={(date: Date | null) => setSelectedDate(date)}
              minDate={tomorrow}
              excludeDates={busyDates}
              disabled={submitting}
              placeholderText="Select a date"
              className="w-full border border-rp-border rounded-xl px-4 py-3 text-sm text-rp-primary focus:outline-none focus:ring-2 focus:ring-rp-accent disabled:opacity-50 transition-all font-sans cursor-pointer placeholder-rp-text-faint"
              wrapperClassName="w-full"
              required
            />
          </div>

          <div className="flex flex-col gap-3">
            <label className="block text-xs font-semibold text-rp-primary">
              Select Time Slot <span className="text-rp-error">*</span>
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {TIME_SLOTS.map((slot) => {
                const isSelected = selectedSlot === slot;
                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={submitting}
                    onClick={() => setSelectedSlot(slot)}
                    className={`py-2 text-xs font-semibold rounded-lg border transition-colors disabled:opacity-50 ${
                      isSelected
                        ? "bg-rp-primary border-rp-primary text-white shadow-sm"
                        : "bg-white border-rp-border text-rp-text hover:border-rp-primary/40 hover:bg-gray-50"
                    }`}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <p className="text-xs text-rp-error bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 border border-rp-border rounded-xl py-3 text-sm font-semibold text-rp-text-muted hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !allFilled}
            className="flex-[2] bg-rp-primary text-white rounded-xl py-3 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting && (
              <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            )}
            {submitting ? "Submitting..." : "Submit"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Success Toast ──────────────────────────────────────────────
function SuccessToast({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-[fadeSlideUp_0.3s_ease-out]">
      <div className="bg-rp-success text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
        <span>✓</span>
        <span>Callback scheduled. A specialist will reach out.</span>
      </div>
    </div>
  );
}

// ── Feedback Toast ─────────────────────────────────────────────
function FeedbackToast({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-[fadeSlideUp_0.3s_ease-out]">
      <div className="bg-rp-success text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
        <span>✓</span>
        <span>Thanks for your feedback!</span>
      </div>
    </div>
  );
}

// ── Feedback Modal ─────────────────────────────────────────────
// ── Feedback Modal ─────────────────────────────────────────────

const RATING_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Poor" },
  { value: 2, label: "Fair" },
  { value: 3, label: "Okay" },
  { value: 4, label: "Good" },
  { value: 5, label: "Perfect" },
];

function FeedbackModal({
  visible,
  onSubmit,
  onSkip,
}: {
  visible: boolean;
  onSubmit: (rating: number) => Promise<void>;
  onSkip: () => void;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [animState, setAnimState] = useState<"entering" | "visible" | "exiting" | "hidden">("hidden");

  useEffect(() => {
    if (visible) {
      if (animState === "hidden" || animState === "exiting") {
        setAnimState("entering");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setAnimState("visible"));
        });
      }
    } else {
      if (animState === "visible" || animState === "entering") {
        setAnimState("exiting");
      }
    }
  }, [visible]);

  useEffect(() => {
    if (animState === "exiting") {
      const timer = setTimeout(() => {
        setAnimState("hidden");
        setRating(null);
        setSubmitting(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [animState]);

  if (animState === "hidden") return null;

  async function handleSubmit() {
    if (rating === null) return;
    setSubmitting(true);
    await onSubmit(rating);
  }

  const opacity = animState === "visible" ? "opacity-100" : "opacity-0";

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${opacity}`}
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={!submitting ? onSkip : undefined} />

      {/* Card */}
      <div
        className={`relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7 flex flex-col gap-5 transition-all duration-300 ${
          animState === "visible" ? "translate-y-0 scale-100" : "translate-y-4 scale-95"
        }`}
      >
        {/* Header */}
        <div>
          <p className="text-base font-semibold text-[#0A2540]">How was your experience?</p>
          <p className="text-xs text-[#4F5B66] mt-0.5">Rate your call with our support agent</p>
        </div>

        {/* Rating options */}
        <div className="flex gap-2">
          {RATING_OPTIONS.map(({ value, label }) => {
            const selected = rating === value;
            return (
              <button
                key={value}
                onClick={() => setRating(value)}
                disabled={submitting}
                className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border text-xs font-semibold transition-all duration-150 disabled:opacity-50 ${
                  selected
                    ? "border-[#00C9A7] bg-[#00C9A7]/10 text-[#00916E]"
                    : "border-[#E2E5EA] text-[#4F5B66] hover:border-[#00C9A7]/50 hover:bg-[#00C9A7]/5"
                }`}
              >
                <span className="text-base font-bold">{value}</span>
                <span className="text-[10px] leading-none">{label}</span>
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleSubmit}
            disabled={rating === null || submitting}
            className="w-full bg-[#0A2540] text-white text-sm font-semibold rounded-xl py-3 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting && (
              <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            )}
            {submitting ? "Submitting…" : "Submit"}
          </button>
          <button
            onClick={onSkip}
            disabled={submitting}
            className="w-full text-xs text-[#B0B8C1] hover:text-[#4F5B66] transition-colors py-1 disabled:opacity-50"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────
export default function VoicePanel({ isTestMode = false }: { isTestMode?: boolean } = {}) {
  const vapiRef              = useRef<Vapi | null>(null);
  const transcriptRef        = useRef<HTMLDivElement>(null);
  const analyserRef          = useRef<AnalyserNode | null>(null);
  const animFrameRef         = useRef<number | null>(null);
  const streamRef            = useRef<MediaStream | null>(null);
  const callEndedRecentlyRef = useRef(false);
  const currentCallIdRef     = useRef<string | null>(null);

  const [status, setStatus]           = useState<CallStatus>("idle");
  const [isMuted, setIsMuted]         = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [transcript, setTranscript]   = useState<TranscriptLine[]>([]);
  const [error, setError]             = useState<string | null>(null);
  const [bars, setBars]               = useState<number[]>(Array(BAR_COUNT).fill(0.05));

  // Escalation form state
  const [showForm, setShowForm]       = useState(false);
  const [showToast, setShowToast]     = useState(false);

  // Feedback modal state
  const [showFeedback, setShowFeedback]     = useState(false);
  const [showFeedbackToast, setShowFeedbackToast] = useState(false);

  const showEscalationForm = useCallback(() => {
    setShowForm(true);
  }, []);

  const hideEscalationForm = useCallback(() => {
    setShowForm(false);
  }, []);

  const handleEscalationSuccess = useCallback(() => {
    setShowForm(false);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 5000);

    // Notify the voice agent that the form was submitted
    if (vapiRef.current) {
      vapiRef.current.send({
        type: "add-message",
        message: {
          role: "system",
          content: "The customer has submitted the escalation form with their details. The callback has been scheduled. Confirm this to the customer and ask if there's anything else you can help with.",
        },
      });
    }
  }, []);

  // ── Waveform loop ──────────────────────────────────────────
  function startWave(stream: MediaStream) {
    const ctx      = new AudioContext();
    const source   = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);
    function loop() {
      analyser.getByteFrequencyData(data);
      const slice = Math.floor(data.length / BAR_COUNT);
      const next = Array.from({ length: BAR_COUNT }, (_, i) =>
        data[i * slice] / 255
      );
      setBars(next);
      animFrameRef.current = requestAnimationFrame(loop);
    }
    loop();
  }

  function stopWave() {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setBars(Array(BAR_COUNT).fill(0.05));
  }

  // ── VAPI init ──────────────────────────────────────────────
  useEffect(() => {
    const vapi = new Vapi(VAPI_PUBLIC_KEY);
    vapiRef.current = vapi;

    vapi.on("call-start", () => {
      callEndedRecentlyRef.current = false;
      setStatus("connected");
      setError(null);
      setTranscript([]);
    });

    vapi.on("call-end", () => {
      callEndedRecentlyRef.current = true;
      setTimeout(() => { callEndedRecentlyRef.current = false; }, 2000);
      setStatus("ended");
      setIsMuted(false);
      setAgentSpeaking(false);
      stopWave();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setTimeout(() => {
        setStatus("idle");
        if (currentCallIdRef.current) {
          setShowFeedback(true);
        }
      }, 2000);
    });

    vapi.on("speech-start", () => setAgentSpeaking(true));
    vapi.on("speech-end",   () => setAgentSpeaking(false));

    vapi.on("message", (msg: {
      type: string;
      role?: string;
      transcript?: string;
      transcriptType?: string;
      call?: { id: string };
    }) => {
      // Capture the call ID if present
      if (msg.call?.id) {
        currentCallIdRef.current = msg.call.id;
      }

      if (msg.type !== "transcript" || !msg.transcript?.trim()) return;

      // ── Escalation detection ──────────────────────────────
      if (msg.role === "assistant") {
        const text = msg.transcript.toLowerCase();
        if (
          text.includes("escalation form") || 
          text.includes("short form") ||
          (text.includes("form") && (text.includes("fill") || text.includes("screen") || text.includes("schedule") || text.includes("callback")))
        ) {
          showEscalationForm();
        }
      }

      const isFinal = msg.transcriptType === "final";
      const role: "user" | "assistant" = msg.role === "assistant" ? "assistant" : "user";

      setTranscript((prev) => {
        if (isFinal) {
          // Replace last partial of same role (if any) with the final, or append
          const last = prev[prev.length - 1];
          if (last && last.role === role) {
            return [...prev.slice(0, -1), { role, text: msg.transcript! }];
          }
          return [...prev, { role, text: msg.transcript! }];
        } else {
          // Update last line if same role (streaming), otherwise append
          const last = prev[prev.length - 1];
          if (last && last.role === role) {
            return [...prev.slice(0, -1), { role, text: msg.transcript! }];
          }
          return [...prev, { role, text: msg.transcript! }];
        }
      });
    });

    vapi.on("error", (err: unknown) => {
      if (callEndedRecentlyRef.current) return;
      console.error("VAPI error:", JSON.stringify(err));
      let msg = "Connection failed. Please try again.";
      if (typeof err === "string") {
        msg = err;
      } else if (err && typeof err === "object") {
        const e = err as Record<string, unknown>;
        if (typeof e.message === "string") msg = e.message;
        else if (e.error && typeof (e.error as Record<string, unknown>).message === "string")
          msg = (e.error as Record<string, unknown>).message as string;
        else if (e.error && typeof e.error === "string")
          msg = e.error;
        else if (typeof (e as any).errorMsg === "string")
          msg = (e as any).errorMsg;
      }

      // Ignore normal ejection errors from daily when the call ends
      if (msg === "Meeting has ended" || msg.includes("ejected") || msg.includes("Meeting ended due to ejection")) {
        return;
      }

      setError(msg);
      setStatus("idle");
      setAgentSpeaking(false);
      stopWave();
    });

    return () => {
      vapi.stop();
      stopWave();
    };
  }, [showEscalationForm]);

  // ── Auto-scroll ────────────────────────────────────────────
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  // ── Handlers ───────────────────────────────────────────────
  async function handleStart() {
    setError(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
    } catch {
      setError("Microphone access denied. Please allow it in your browser settings.");
      return;
    }

    if (!window.RTCPeerConnection) {
      setError("Your browser doesn't support voice calls. Please use Chrome or Edge.");
      return;
    }

    startWave(stream);
    setStatus("connecting");

    try {
      const call = await vapiRef.current!.start(ASSISTANT_ID, {
        variableValues: { is_test: isTestMode.toString() }
      });
      if (call && (call as any).id) {
        currentCallIdRef.current = (call as any).id;
      }
    } catch (err) {
      console.error(err);
      setError("Failed to connect. Please try again.");
      setStatus("idle");
      stopWave();
    }
  }

  function handleEnd() {
    callEndedRecentlyRef.current = true;
    vapiRef.current?.stop();
  }

  function handleMute() {
    if (!vapiRef.current) return;
    const next = !isMuted;
    vapiRef.current.setMuted(next);
    setIsMuted(next);
  }

  const { dot, label } = statusConfig[status];
  const isActive   = status === "connected" || status === "connecting";
  const statusLabel = isActive && agentSpeaking ? "Agent is speaking..." :
                      isActive && !agentSpeaking && status === "connected" ? "Listening..." :
                      label;

  return (
    <>
      <div className="bg-white border border-rp-border rounded-lg shadow-sm p-8 flex flex-col items-center gap-6">
        {/* Logo */}
        <img src="/logo.png" alt="RelayPay Logo" className="w-12 h-12 object-contain" />

        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dot} transition-colors duration-200`} />
          <span className="text-rp-text-muted text-xs">{statusLabel}</span>
        </div>

        {/* Waveform — shown when active and listening */}
        {isActive && !agentSpeaking && !isMuted && (
          <WaveVisualiser bars={bars} />
        )}

        {/* Primary button */}
        {!isActive ? (
          <button
            onClick={handleStart}
            className="flex items-center gap-2 px-6 h-14 w-52 justify-center rounded-lg text-sm font-semibold bg-rp-primary text-white hover:bg-rp-accent transition-colors duration-200"
          >
            <MicIcon />
            Start Conversation
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={handleMute}
              className={`px-4 h-10 rounded-lg text-xs font-semibold border transition-colors duration-200 ${
                isMuted
                  ? "bg-rp-error text-white border-rp-error"
                  : "bg-white text-rp-text-muted border-rp-border hover:bg-gray-50"
              }`}
            >
              {isMuted ? "Unmute" : "Mute"}
            </button>
            <button
              onClick={handleEnd}
              className="flex items-center gap-2 px-5 h-10 rounded-lg text-sm font-semibold bg-rp-error text-white hover:opacity-90 transition-opacity duration-200"
            >
              <PhoneOffIcon />
              End Call
            </button>
          </div>
        )}

        {/* Divider */}
        <hr className="w-full border-rp-border" />

        {/* Transcript */}
        <div ref={transcriptRef} className="w-full max-h-60 overflow-y-auto flex flex-col gap-2">
          {transcript.length === 0 ? (
            <p className="text-rp-text-muted text-xs italic text-center">
              Transcript will appear here...
            </p>
          ) : (
            transcript.map((line, i) => (
              <div key={i} className="text-xs leading-relaxed">
                <span className={`font-semibold mr-1 ${line.role === "assistant" ? "text-rp-accent" : "text-rp-primary"}`}>
                  {line.role === "assistant" ? "Agent:" : "You:"}
                </span>
                <span className="text-rp-text-muted">{line.text}</span>
              </div>
            ))
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="w-full text-xs text-rp-error bg-red-50 border border-red-200 rounded-md px-3 py-2 text-center">
            {error}
          </p>
        )}
      </div>

      {/* Escalation Form Overlay */}
      <EscalationForm
        visible={showForm}
        isTestMode={isTestMode}
        onClose={hideEscalationForm}
        onSuccess={handleEscalationSuccess}
      />

      {/* Success Toast */}
      <SuccessToast visible={showToast} />

       {/* Feedback Modal */}
       <FeedbackModal
         visible={showFeedback}
         onSubmit={async (rating: number) => {
           const callId = currentCallIdRef.current;
           if (!callId) {
             console.error("No call ID found for feedback.");
             setShowFeedback(false);
             setShowFeedbackToast(true);
             setTimeout(() => setShowFeedbackToast(false), 4000);
             return;
           }
 
           const submitFeedback = async (retries = 3) => {
             try {
                await sbFetch("call_history", {
                  method: "POST",
                  headers: { Prefer: "resolution=merge-duplicates" },
                  body: JSON.stringify({
                    call_id: callId,
                    feedback_rating: rating,
                    ...(isTestMode ? { is_test: true } : {})
                  }),
                });
             } catch (err) {
                if (retries > 0) setTimeout(() => submitFeedback(retries - 1), 3000);
                else console.error("Feedback submit error after retries:", err);
             }
           };
           submitFeedback();
           setShowFeedback(false);
           setShowFeedbackToast(true);
           setTimeout(() => setShowFeedbackToast(false), 4000);
         }}
         onSkip={() => {
           setShowFeedback(false);
           if (isTestMode && currentCallIdRef.current) {
             const callId = currentCallIdRef.current;
             const submitFlag = async (retries = 3) => {
               try {
                 await sbFetch("call_history", {
                   method: "POST",
                   headers: { Prefer: "resolution=merge-duplicates" },
                   body: JSON.stringify({ call_id: callId, is_test: true }),
                 });
               } catch (err) {
                 if (retries > 0) setTimeout(() => submitFlag(retries - 1), 3000);
               }
             };
             submitFlag();
           }
         }}
       />

      {/* Feedback Toast */}
      <FeedbackToast visible={showFeedbackToast} />

      {/* Keyframe animation for toast */}
      <style jsx global>{`
        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </>
  );
}
