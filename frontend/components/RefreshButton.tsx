"use client";

import { useRef, useState } from "react";
import { getIngestStatus, triggerIngest } from "@/lib/api";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 40; // ~2 minutes before giving up, in case a job hangs

export default function RefreshButton({ onComplete }: { onComplete: () => void }) {
  const [state, setState] = useState<"idle" | "running" | "error">("idle");
  const pollCount = useRef(0);

  async function poll(jobId: string) {
    pollCount.current += 1;
    try {
      const status = await getIngestStatus(jobId);
      if (status.status === "completed") {
        setState("idle");
        onComplete();
        return;
      }
      if (status.status === "failed") {
        setState("error");
        return;
      }
      if (pollCount.current >= MAX_POLLS) {
        setState("error");
        return;
      }
      setTimeout(() => poll(jobId), POLL_INTERVAL_MS);
    } catch {
      setState("error");
    }
  }

  async function handleClick() {
    setState("running");
    pollCount.current = 0;
    try {
      const { jobId } = await triggerIngest();
      setTimeout(() => poll(jobId), POLL_INTERVAL_MS);
    } catch {
      setState("error");
    }
  }

  const label = state === "running" ? "Pulling latest…" : state === "error" ? "Refresh failed — retry" : "Refresh data";

  return (
    <button
      onClick={handleClick}
      disabled={state === "running"}
      className="text-sm px-4 py-2 rounded-sm bg-ink text-paper font-medium hover:bg-ink/90 disabled:opacity-60 disabled:cursor-wait transition-colors"
    >
      {label}
    </button>
  );
}
