"use client";

import { useState, useRef, useCallback, useEffect, DragEvent, ChangeEvent } from "react";

import { sbFetch } from "@/lib/supabase";

const WEBHOOK_URL = "https://cohort2pod1.app.n8n.cloud/webhook-test/a8a6a5f8-e5b9-4fe0-a018-6da8e6b281cd";
const ADMIN_KEY = "relaypay-admin-2026";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = [".txt", ".md", ".pdf"];
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 120_000;

const CATEGORIES: { value: string; label: string; description: string }[] = [
  { value: "onboarding",   label: "Onboarding",   description: "Getting started guides" },
  { value: "pricing",      label: "Pricing",       description: "Plans, fees & billing" },
  { value: "payouts",      label: "Payouts",       description: "Payout schedules & limits" },
  { value: "transactions", label: "Transactions",  description: "Payment history & records" },
  { value: "invoicing",    label: "Invoicing",     description: "Invoice creation & management" },
  { value: "compliance",   label: "Compliance",    description: "KYC, AML & regulatory" },
  { value: "general",      label: "General",       description: "General support topics" },
];

const CATEGORY_COLORS: Record<string, string> = {
  onboarding: "#0C8C8C", pricing: "#7C3AED", payouts: "#2563EB",
  transactions: "#D97706", invoicing: "#059669", compliance: "#C0392B", general: "#64748B",
};

// ── Types ─────────────────────────────────────────────────────────────────────

type UploadMode = "file" | "url";
type EntryStatus = "pending" | "uploading" | "polling" | "success" | "error" | "timeout";
type PollPhase = "started" | "decoding" | "chunking" | "embedding" | "complete" | "error";

interface ProgressState { phase: PollPhase; detail: string; chunksTotal: number; chunksProcessed: number; pct: number; }

interface UploadEntry {
  id: string; uploadId: string | null; sourceType: "file" | "url";
  file?: File; url?: string; category: string; title: string;
  status: EntryStatus; message: string; preview: string | null; progress: ProgressState | null;
}

interface ProcessedDoc {
  id: number; title: string; source: string; category: string | null;
  chunks_count: number; uploaded_at: string;
}

interface PendingDelete { type: "entry" | "doc"; entryId?: string; uploadId?: string | null; doc?: ProcessedDoc; sourceType?: "file" | "url"; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fileIcon(file: File) {
  if (file.name.endsWith(".pdf")) return "📄";
  if (file.name.endsWith(".md")) return "📝";
  return "📃";
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readTextPreview(file: File): Promise<string> {
  return new Promise((resolve) => {
    if (file.type === "application/pdf") { resolve("PDF file — preview not available"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      resolve(text.slice(0, 300) + (text.length > 300 ? "…" : ""));
    };
    reader.onerror = () => resolve("Preview unavailable");
    reader.readAsText(file);
  });
}

function isValidUrl(val: string) { return /^https?:\/\/.+/.test(val.trim()); }

function phasePercent(phase: PollPhase, p: number, t: number): number {
  switch (phase) {
    case "started": return 10; case "decoding": return 20; case "chunking": return 30;
    case "embedding": return t > 0 ? Math.round(30 + (p / t) * 65) : 30;
    case "complete": return 100; case "error": return 0;
  }
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function truncate(str: string, n: number) { return str.length > n ? str.slice(0, n) + "…" : str; }

async function saveProcessedDoc(doc: Omit<ProcessedDoc, "id" | "uploaded_at">) {
  await sbFetch(`processed_documents`, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(doc),
  });
}

async function deleteProcessedDoc(id: number, source: string) {
  // Delete from processed_documents
  await sbFetch(`processed_documents?id=eq.${id}`, { method: "DELETE" });
  // Delete matching chunks from documents table (n8n embeddings store)
  await sbFetch(`documents?metadata->>source=eq.${encodeURIComponent(source)}`, { method: "DELETE" }).catch(() => {});
}

async function deleteUploadStatus(uploadId: string) {
  await sbFetch(`upload_status?id=eq.${uploadId}`, { method: "DELETE" });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminKB() {
  // Category
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [customCategoryInput, setCustomCategoryInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);

  // Document title
  const [docTitle, setDocTitle] = useState("");

  // Mode + upload
  const [mode, setMode] = useState<UploadMode>("file");
  const [fileEntries, setFileEntries] = useState<UploadEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState("");
  const [urlProcessing, setUrlProcessing] = useState(false);
  const [urlEntries, setUrlEntries] = useState<UploadEntry[]>([]);

  // Processed docs
  const [processedDocs, setProcessedDocs] = useState<ProcessedDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);

  // Delete modal
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);

  const pollTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const pollDeadlines = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── Load processed docs ────────────────────────────────────────────────────

  function loadDocs() {
    sbFetch("processed_documents?select=*&order=uploaded_at.desc")
      .then((r) => r.json())
      .then((rows) => setProcessedDocs(Array.isArray(rows) ? rows : []))
      .catch(() => setProcessedDocs([]))
      .finally(() => setDocsLoading(false));
  }

  useEffect(() => { loadDocs(); }, []);

  // ── Category ────────────────────────────────────────────────────────────────

  function selectCategory(value: string) { setSelectedCategory(value); setShowCustomInput(false); setCustomCategoryInput(""); }

  function openCustomInput() {
    setShowCustomInput(true);
    setTimeout(() => customInputRef.current?.focus(), 50);
  }

  function confirmCustomCategory() {
    const val = customCategoryInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (!val) return;
    setSelectedCategory(val);
    setShowCustomInput(false);
  }

  function resetCategory() {
    setSelectedCategory(null); setShowCustomInput(false); setCustomCategoryInput("");
    setFileEntries([]); setUrlEntries([]); setUrlInput(""); setUrlError(""); setDocTitle("");
  }

  // ── Poll ────────────────────────────────────────────────────────────────────

  function stopPolling(id: string) {
    const i = pollTimers.current.get(id); const d = pollDeadlines.current.get(id);
    if (i) { clearInterval(i); pollTimers.current.delete(id); }
    if (d) { clearTimeout(d); pollDeadlines.current.delete(id); }
  }

  function updateFileEntry(id: string, patch: Partial<UploadEntry>) {
    setFileEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }
  function updateUrlEntry(id: string, patch: Partial<UploadEntry>) {
    setUrlEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function startPolling(
    entryId: string, uploadId: string, label: string,
    sourceType: "file" | "url", title: string, category: string, onDone: () => void
  ) {
    const update = sourceType === "file" ? updateFileEntry : updateUrlEntry;

    const deadline = setTimeout(() => {
      stopPolling(entryId);
      update(entryId, { status: "timeout", message: "Processing is taking longer than expected. Check back shortly.", progress: null });
      onDone();
    }, POLL_TIMEOUT_MS);
    pollDeadlines.current.set(entryId, deadline);

    const interval = setInterval(async () => {
      try {
        const res = await sbFetch(`upload_status?id=eq.${uploadId}&select=*`);
        if (!res.ok) return;
        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) return;

        const row = rows[0];
        const phase: PollPhase = row.status;
        const detail: string = row.detail ?? "";
        const chunksTotal: number = row.chunks_total ?? 0;
        const chunksProcessed: number = row.chunks_processed ?? 0;
        const pct = phasePercent(phase, chunksProcessed, chunksTotal);
        const progress: ProgressState = { phase, detail, chunksTotal, chunksProcessed, pct };

        if (phase === "complete") {
          stopPolling(entryId);
          update(entryId, {
            status: "success",
            message: `✓ '${label}' processed — ${chunksTotal} chunk${chunksTotal !== 1 ? "s" : ""} stored.`,
            progress: { ...progress, pct: 100 },
          });
          // Save to processed_documents
          await saveProcessedDoc({ title, source: label, category, chunks_count: chunksTotal }).catch(() => {});
          loadDocs();
          onDone();
          return;
        }

        if (phase === "error") {
          stopPolling(entryId);
          update(entryId, { status: "error", message: detail || "Processing failed. Please try again.", progress: null });
          onDone();
          return;
        }

        update(entryId, { status: "polling", message: detail, progress });
      } catch { /* transient */ }
    }, POLL_INTERVAL_MS);

    pollTimers.current.set(entryId, interval);
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  async function sendToWebhook(
    body: Record<string, unknown>, entryId: string, label: string,
    sourceType: "file" | "url", title: string, category: string, onDone: () => void
  ) {
    const update = sourceType === "file" ? updateFileEntry : updateUrlEntry;
    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
      controller.abort();
      update(entryId, { status: "error", message: "Connection failed. Please check your network and try again.", progress: null });
      onDone();
    }, 60_000);

    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": ADMIN_KEY },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        update(entryId, { status: "error", message: `Error ${res.status}: ${text}`, progress: null });
        onDone(); return;
      }

      const data = await res.json().catch(() => null);
      if (data?.success === false) {
        update(entryId, { status: "error", message: data?.error ?? data?.message ?? "The server reported a failure.", progress: null });
        onDone(); return;
      }

      const uploadId: string | null = data?.uploadId ?? data?.upload_id ?? null;

      if (uploadId) {
        update(entryId, {
          uploadId, status: "polling",
          message: data?.message ?? "Received. Processing started.",
          progress: { phase: "started", detail: "Processing started…", chunksTotal: 0, chunksProcessed: 0, pct: 10 },
        });
        startPolling(entryId, uploadId, label, sourceType, title, category, onDone);
      } else {
        const chunks = data?.chunks ?? data?.chunkCount ?? data?.chunk_count ?? null;
        update(entryId, {
          status: "success",
          message: chunks != null
            ? `✓ '${label}' processed — ${chunks} chunk${chunks !== 1 ? "s" : ""} stored.`
            : `✓ '${label}' uploaded successfully.`,
          progress: null,
        });
        if (chunks != null) {
          await saveProcessedDoc({ title, source: label, category, chunks_count: chunks }).catch(() => {});
          loadDocs();
        }
        onDone();
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if ((err as { name?: string })?.name === "AbortError") return;
      update(entryId, {
        status: "error",
        message: err instanceof TypeError && err.message.toLowerCase().includes("fetch")
          ? "Connection failed. Please check your network and try again."
          : err instanceof Error ? err.message : "An unexpected error occurred.",
        progress: null,
      });
      onDone();
    }
  }

  // ── File upload ────────────────────────────────────────────────────────────

  async function addFiles(incoming: File[]) {
    const f = incoming.find((f) => {
      const ext = "." + f.name.split(".").pop()?.toLowerCase();
      return ACCEPTED_TYPES.includes(ext) && f.size <= MAX_FILE_SIZE;
    });
    if (!f) return;
    setFileEntries([{
      id: `${f.name}-${Date.now()}`, uploadId: null, sourceType: "file", file: f,
      category: selectedCategory!, title: docTitle, status: "pending",
      message: "", preview: await readTextPreview(f), progress: null,
    }]);
  }

  function onFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = "";
  }

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(true); }, []);
  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(false); }, []);
  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragging(false);
    if (e.dataTransfer.files) addFiles(Array.from(e.dataTransfer.files));
  }, []);

  async function uploadAll() {
    const entry = fileEntries.find((e) => e.status === "pending");
    if (!entry) return;
    setFileUploading(true);
    updateFileEntry(entry.id, { status: "uploading", message: "Uploading and processing document… This may take a moment.", progress: null });
    const base64 = await toBase64(entry.file!).catch(() => null);
    if (!base64) { updateFileEntry(entry.id, { status: "error", message: "Failed to read file.", progress: null }); setFileUploading(false); return; }
    await sendToWebhook(
      { type: "file", content: base64, fileName: entry.file!.name, category: entry.category, title: entry.title },
      entry.id, entry.file!.name, "file", entry.title, entry.category,
      () => setFileUploading(false)
    );
  }

  // ── URL upload ────────────────────────────────────────────────────────────

  async function processLink() {
    const trimmed = urlInput.trim();
    if (!isValidUrl(trimmed)) { setUrlError("Please enter a valid URL."); return; }
    setUrlError(""); setUrlProcessing(true);
    const entryId = `url-${Date.now()}`;
    setUrlEntries([{
      id: entryId, uploadId: null, sourceType: "url", url: trimmed,
      category: selectedCategory!, title: docTitle, status: "uploading",
      message: "Sending link for processing…", preview: null, progress: null,
    }]);
    setUrlInput("");
    await sendToWebhook(
      { type: "url", url: trimmed, category: selectedCategory!, title: docTitle },
      entryId, trimmed, "url", docTitle, selectedCategory!,
      () => setUrlProcessing(false)
    );
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  function requestEntryDelete(entry: UploadEntry) {
    const label = entry.sourceType === "url" ? entry.url! : entry.file?.name ?? "this entry";
    setPendingDelete({ type: "entry", entryId: entry.id, uploadId: entry.uploadId, sourceType: entry.sourceType });
    void label;
  }

  function requestDocDelete(doc: ProcessedDoc) {
    setPendingDelete({ type: "doc", doc });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);

    if (pendingDelete.type === "entry") {
      const { entryId, uploadId, sourceType } = pendingDelete;
      if (uploadId) await deleteUploadStatus(uploadId).catch(() => {});
      stopPolling(entryId!);
      if (sourceType === "file") setFileEntries([]);
      else setUrlEntries((prev) => prev.filter((e) => e.id !== entryId));
    } else if (pendingDelete.type === "doc" && pendingDelete.doc) {
      await deleteProcessedDoc(pendingDelete.doc.id, pendingDelete.doc.source).catch(() => {});
      setProcessedDocs((prev) => prev.filter((d) => d.id !== pendingDelete.doc!.id));
    }

    setDeleting(false);
    setPendingDelete(null);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const fileEntry = fileEntries[0] ?? null;
  const hasPendingFile = fileEntry?.status === "pending";
  const isFileProcessing = fileUploading || fileEntry?.status === "uploading" || fileEntry?.status === "polling";
  const isFileDropBlocked = !!fileEntry && ["pending","uploading","polling"].includes(fileEntry.status);
  const isUrlBlocked = urlProcessing || urlEntries.some((e) => ["uploading","polling"].includes(e.status));
  const categoryLabel = CATEGORIES.find((c) => c.value === selectedCategory)?.label;
  const step = selectedCategory ? 2 : 1;
  const titleMissing = selectedCategory && !docTitle.trim();

  // ── Entry card ────────────────────────────────────────────────────────────

  function EntryCard({ entry }: { entry: UploadEntry }) {
    const isActive = entry.status === "uploading" || entry.status === "polling";
    const label = entry.sourceType === "url" ? entry.url! : entry.file!.name;
    return (
      <div className="bg-white border border-[#E2E5EA] rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-start gap-3 px-5 pt-4 pb-3">
          <span className="text-xl leading-none mt-0.5">{entry.sourceType === "url" ? "🔗" : fileIcon(entry.file!)}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#0A2540] truncate">{entry.title || label}</p>
            <p className="text-xs text-[#4F5B66] mt-0.5 truncate">{label}</p>
            <p className="text-xs text-[#B0B8C1]">{entry.sourceType === "file" ? formatSize(entry.file!.size) : entry.category}</p>
          </div>
          {isActive && (
            <span className="flex items-center gap-1.5 text-xs text-[#4F5B66]">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-[#0C8C8C] border-t-transparent animate-spin" />
              {entry.status === "uploading" ? "Uploading…" : "Processing…"}
            </span>
          )}
          {entry.status === "success" && <span className="text-xs text-[#27AE60] font-semibold">✓ Done</span>}
          {(entry.status === "error" || entry.status === "timeout") && (
            <span className="text-xs text-[#C0392B] font-semibold">✗ {entry.status === "timeout" ? "Timeout" : "Failed"}</span>
          )}
          {!isActive && (
            <button onClick={() => requestEntryDelete(entry)} className="text-[#B0B8C1] hover:text-[#C0392B] transition-colors text-lg leading-none ml-1">×</button>
          )}
        </div>
        {entry.progress && (
          <div className="mx-5 mb-3">
            <div style={{ backgroundColor: "#e0e0e0", height: 6, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ width: `${entry.progress.pct}%`, backgroundColor: "#0C8C8C", height: "100%", borderRadius: 8, transition: "width 0.5s ease" }} />
            </div>
            {entry.progress.phase === "embedding" && entry.progress.chunksTotal > 0 && (
              <p className="text-xs text-[#B0B8C1] mt-1 text-right">{entry.progress.chunksProcessed} / {entry.progress.chunksTotal} chunks</p>
            )}
          </div>
        )}
        {entry.preview && entry.status === "pending" && (
          <div className="mx-5 mb-3 bg-[#F7F8FA] rounded-lg px-3 py-2">
            <p className="text-xs text-[#4F5B66] font-mono leading-relaxed whitespace-pre-wrap break-all">{entry.preview}</p>
          </div>
        )}
        {entry.message && entry.status !== "pending" && (
          <div className={`mx-5 mb-3 rounded-lg px-3 py-2 text-xs leading-relaxed flex items-start gap-2 ${
            entry.status === "success" ? "bg-[#27AE60]/10 text-[#27AE60]"
            : entry.status === "error" ? "bg-[#C0392B]/10 text-[#C0392B]"
            : entry.status === "timeout" ? "bg-orange-50 text-orange-600"
            : "bg-[#F7F8FA] text-[#4F5B66]"
          }`}>
            {isActive && <span className="mt-0.5 shrink-0 inline-block w-3 h-3 rounded-full border-2 border-[#0C8C8C] border-t-transparent animate-spin" />}
            {entry.message}
          </div>
        )}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex flex-col gap-8 max-w-2xl">
        <div>
          <h1 className="text-2xl font-semibold text-[#0A2540] tracking-tight">Knowledge Base</h1>
          <p className="text-sm text-[#4F5B66] mt-1">Upload documents to the RelayPay support knowledge base.</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-3">
          <StepDot n={1} active={step === 1} done={step > 1} />
          <span className={`text-xs font-semibold ${step === 1 ? "text-[#0A2540]" : "text-[#B0B8C1]"}`}>Choose category</span>
          <div className="flex-1 h-px bg-[#E2E5EA] mx-1" />
          <StepDot n={2} active={step === 2} done={false} />
          <span className={`text-xs font-semibold ${step === 2 ? "text-[#0A2540]" : "text-[#B0B8C1]"}`}>Upload content</span>
        </div>

        {/* Step 1: Category */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-[#4F5B66] uppercase tracking-wider">Category</p>
            {selectedCategory && (
              <button onClick={resetCategory} className="text-xs text-[#B0B8C1] hover:text-[#0A2540] transition-colors">Change</button>
            )}
          </div>

          {selectedCategory ? (
            <div className="flex items-center gap-2 bg-[#0A2540]/5 border border-[#0A2540]/15 rounded-xl px-4 py-3">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[selectedCategory] ?? "#0C8C8C" }} />
              <span className="text-sm font-semibold text-[#0A2540]">{categoryLabel ?? selectedCategory}</span>
              <span className="text-xs text-[#4F5B66] ml-0.5">
                {CATEGORIES.find((c) => c.value === selectedCategory)?.description
                  ? `— ${CATEGORIES.find((c) => c.value === selectedCategory)!.description}` : ""}
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {CATEGORIES.map((cat) => (
                <button key={cat.value} onClick={() => selectCategory(cat.value)}
                  className="text-left border border-[#E2E5EA] rounded-xl px-4 py-3 hover:border-[#0C8C8C] hover:bg-[#0C8C8C]/5 transition-colors group">
                  <p className="text-sm font-semibold text-[#0A2540] group-hover:text-[#0C8C8C] transition-colors">{cat.label}</p>
                  <p className="text-xs text-[#B0B8C1] mt-0.5 leading-snug">{cat.description}</p>
                </button>
              ))}
              {!showCustomInput ? (
                <button onClick={openCustomInput}
                  className="text-left border border-dashed border-[#E2E5EA] rounded-xl px-4 py-3 hover:border-[#0C8C8C] hover:bg-[#0C8C8C]/5 transition-colors group">
                  <p className="text-sm font-semibold text-[#4F5B66] group-hover:text-[#0C8C8C] transition-colors">Other</p>
                  <p className="text-xs text-[#B0B8C1] mt-0.5">Type your own label</p>
                </button>
              ) : (
                <div className="col-span-2 sm:col-span-3 md:col-span-4 flex gap-2 items-center border border-[#0C8C8C] bg-[#0C8C8C]/5 rounded-xl px-4 py-3">
                  <input ref={customInputRef} type="text" placeholder="e.g. refunds, disputes..."
                    value={customCategoryInput} onChange={(e) => setCustomCategoryInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") confirmCustomCategory(); if (e.key === "Escape") { setShowCustomInput(false); setCustomCategoryInput(""); } }}
                    className="flex-1 bg-transparent text-sm text-[#0A2540] placeholder-[#B0B8C1] focus:outline-none" />
                  <button onClick={confirmCustomCategory} disabled={!customCategoryInput.trim()}
                    className="text-xs font-semibold text-white bg-[#0A2540] rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-40">Use</button>
                  <button onClick={() => { setShowCustomInput(false); setCustomCategoryInput(""); }}
                    className="text-[#B0B8C1] hover:text-[#C0392B] transition-colors text-lg leading-none">×</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 2: Upload */}
        {selectedCategory && (
          <div className="flex flex-col gap-5">

            {/* Document title */}
            <div>
              <label className="block text-xs font-semibold text-[#0A2540] mb-1.5">
                Document Title <span className="text-[#C0392B]">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Product Features Overview, FAQ, Escalation Policy"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                className="w-full border border-[#E2E5EA] rounded-xl px-4 py-3 text-sm text-[#0A2540] placeholder-[#B0B8C1] focus:outline-none focus:ring-2 focus:ring-[#0C8C8C]"
              />
              {titleMissing && (
                <p className="text-xs text-[#C0392B] mt-1.5">A document title is required before uploading.</p>
              )}
            </div>

            {/* Mode toggle */}
            <div className="flex bg-[#F7F8FA] border border-[#E2E5EA] rounded-xl p-1 w-fit">
              {(["file", "url"] as UploadMode[]).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-5 py-2 text-sm font-semibold rounded-lg transition-colors ${
                    mode === m ? "bg-white text-[#0A2540] shadow-sm" : "text-[#4F5B66] hover:text-[#0A2540]"
                  }`}>
                  {m === "file" ? "Upload File" : "Upload Link"}
                </button>
              ))}
            </div>

            {/* File mode */}
            {mode === "file" && (
              <>
                {!isFileDropBlocked && (
                  <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                    onClick={() => !titleMissing && fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 transition-colors select-none ${
                      titleMissing ? "border-[#E2E5EA] opacity-50 cursor-not-allowed"
                      : dragging ? "border-[#0C8C8C] bg-[#0C8C8C]/5 cursor-pointer"
                      : "border-[#E2E5EA] hover:border-[#0C8C8C]/60 hover:bg-[#F7F8FA] cursor-pointer"
                    }`}>
                    <div className="text-3xl">☁️</div>
                    <p className="text-sm font-semibold text-[#0A2540]">Drop a file here or click to browse</p>
                    <p className="text-xs text-[#4F5B66]">.txt, .md, .pdf · max 5 MB</p>
                    <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES.join(",")} className="hidden" onChange={onFileInputChange} disabled={!!titleMissing} />
                  </div>
                )}
                {fileEntry && <EntryCard entry={fileEntry} />}
                {hasPendingFile && (
                  <button onClick={uploadAll} disabled={isFileProcessing || !!titleMissing}
                    className="w-full bg-[#0A2540] text-white text-sm font-semibold rounded-xl py-4 hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed">
                    Upload File
                  </button>
                )}
              </>
            )}

            {/* URL mode */}
            {mode === "url" && (
              <>
                {!isUrlBlocked && (
                  <div className="bg-white border border-[#E2E5EA] rounded-xl shadow-sm p-5 flex flex-col gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#0A2540] mb-1.5">Document URL</label>
                      <input type="url" placeholder="Paste a URL (Notion page, Google Doc, webpage...)"
                        value={urlInput} onChange={(e) => { setUrlInput(e.target.value); setUrlError(""); }}
                        onKeyDown={(e) => e.key === "Enter" && !titleMissing && processLink()}
                        className="w-full border border-[#E2E5EA] rounded-lg px-4 py-3 text-sm text-[#0A2540] placeholder-[#B0B8C1] focus:outline-none focus:ring-2 focus:ring-[#0C8C8C]" />
                      {urlError && <p className="mt-1.5 text-xs text-[#C0392B]">{urlError}</p>}
                    </div>
                    <button onClick={processLink} disabled={!urlInput.trim() || !!titleMissing}
                      className="w-full bg-[#0A2540] text-white text-sm font-semibold rounded-lg py-3 hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed">
                      Process Link
                    </button>
                  </div>
                )}
                {urlEntries.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {urlEntries.map((entry) => <EntryCard key={entry.id} entry={entry} />)}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Divider */}
        <hr className="border-[#E2E5EA]" />

        {/* Processed documents */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-[#0A2540]">Processed Documents</h2>
              <p className="text-xs text-[#4F5B66] mt-0.5">{processedDocs.length} document{processedDocs.length !== 1 ? "s" : ""} in the knowledge base</p>
            </div>
          </div>

          {docsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-28 bg-white border border-[#E2E5EA] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : processedDocs.length === 0 ? (
            <div className="bg-white border border-[#E2E5EA] rounded-xl p-8 text-center">
              <p className="text-sm font-semibold text-[#0A2540]">No documents yet</p>
              <p className="text-xs text-[#4F5B66] mt-1">Upload a document above to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {processedDocs.map((doc) => {
                const color = CATEGORY_COLORS[doc.category ?? ""] ?? "#64748B";
                return (
                  <div key={doc.id} className="bg-white border border-[#E2E5EA] rounded-xl p-4 flex flex-col gap-2 relative group">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-[#0A2540] leading-snug">{doc.title}</p>
                      <button
                        onClick={() => requestDocDelete(doc)}
                        className="shrink-0 text-[#B0B8C1] hover:text-[#C0392B] transition-colors text-lg leading-none opacity-0 group-hover:opacity-100"
                        title="Delete"
                      >×</button>
                    </div>
                    <p className="text-xs text-[#B0B8C1] truncate">{truncate(doc.source, 50)}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-auto pt-1">
                      {doc.category && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${color}18`, color }}>
                          {doc.category}
                        </span>
                      )}
                      <span className="text-xs text-[#B0B8C1]">{doc.chunks_count} chunk{doc.chunks_count !== 1 ? "s" : ""}</span>
                      <span className="text-xs text-[#B0B8C1] ml-auto">{timeAgo(doc.uploaded_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Confirm delete modal */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => !deleting && setPendingDelete(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 flex flex-col gap-4">
            <div>
              <p className="text-sm font-semibold text-[#0A2540]">Delete document?</p>
              <p className="mt-1 text-xs text-[#4F5B66] leading-relaxed">
                {pendingDelete.type === "doc" && pendingDelete.doc
                  ? <>This will remove <span className="font-semibold text-[#0A2540]">{pendingDelete.doc.title}</span> and its chunks from the knowledge base. This cannot be undone.</>
                  : "This will remove the entry and its Supabase record. This cannot be undone."}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPendingDelete(null)} disabled={deleting}
                className="flex-1 border border-[#E2E5EA] rounded-xl py-2.5 text-sm font-semibold text-[#0A2540] hover:bg-[#F7F8FA] transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={deleting}
                className="flex-1 bg-[#C0392B] text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                {deleting && <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />}
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-colors ${
      done ? "bg-[#0C8C8C] text-white" : active ? "bg-[#0A2540] text-white" : "bg-[#E2E5EA] text-[#B0B8C1]"
    }`}>
      {done ? "✓" : n}
    </div>
  );
}
