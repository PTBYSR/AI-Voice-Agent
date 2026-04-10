"use client";

import { useEffect, useRef, useState } from "react";
import Vapi from "@vapi-ai/web";

const VAPI_PUBLIC_KEY = "4d545128-691c-483f-85f8-4488e746b9b0";
const ASSISTANT_ID = "ab929d29-0f65-4c0e-9d5b-79515f090218";

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

export default function VoicePanel() {
  const vapiRef         = useRef<Vapi | null>(null);
  const transcriptRef   = useRef<HTMLDivElement>(null);
  const analyserRef     = useRef<AnalyserNode | null>(null);
  const animFrameRef    = useRef<number | null>(null);
  const streamRef       = useRef<MediaStream | null>(null);

  const [status, setStatus]           = useState<CallStatus>("idle");
  const [isMuted, setIsMuted]         = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [transcript, setTranscript]   = useState<TranscriptLine[]>([]);
  const [error, setError]             = useState<string | null>(null);
  const [bars, setBars]               = useState<number[]>(Array(BAR_COUNT).fill(0.05));

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
      setStatus("connected");
      setError(null);
      setTranscript([]);
    });

    vapi.on("call-end", () => {
      setStatus("ended");
      setIsMuted(false);
      setAgentSpeaking(false);
      stopWave();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setTimeout(() => setStatus("idle"), 3000);
    });

    vapi.on("speech-start", () => setAgentSpeaking(true));
    vapi.on("speech-end",   () => setAgentSpeaking(false));

    vapi.on("message", (msg: {
      type: string;
      role?: string;
      transcript?: string;
      transcriptType?: string;
    }) => {
      if (msg.type !== "transcript" || !msg.transcript?.trim()) return;

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
      console.error("VAPI error:", JSON.stringify(err));
      let msg = "Connection failed. Please try again.";
      if (typeof err === "string") {
        msg = err;
      } else if (err && typeof err === "object") {
        const e = err as Record<string, unknown>;
        if (typeof e.message === "string") msg = e.message;
        else if (e.error && typeof (e.error as Record<string, unknown>).message === "string")
          msg = (e.error as Record<string, unknown>).message as string;
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
  }, []);

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
      await vapiRef.current!.start(ASSISTANT_ID);
    } catch (err) {
      console.error(err);
      setError("Failed to connect. Please try again.");
      setStatus("idle");
      stopWave();
    }
  }

  function handleEnd() {
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
    <div className="bg-white border border-rp-border rounded-lg shadow-sm p-8 flex flex-col items-center gap-6">

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
  );
}
