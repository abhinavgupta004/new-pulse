"use client";

import { useEffect, useMemo, useState } from "react";
import Timeline from "@/components/Timeline";
import ClusterDetail from "@/components/ClusterDetail";
import SourceFilter from "@/components/SourceFilter";
import RefreshButton from "@/components/RefreshButton";
import { getCluster, getTimeline } from "@/lib/api";
import type { ClusterDetail as ClusterDetailType, TimelineCluster } from "@/lib/types";

export default function Page() {
  const [clusters, setClusters] = useState<TimelineCluster[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [enabledSources, setEnabledSources] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<ClusterDetailType | null>(null);
  const [loadingCluster, setLoadingCluster] = useState(false);

  async function loadTimeline() {
    setLoadingTimeline(true);
    setLoadError(null);
    try {
      const { timeline } = await getTimeline();
      setClusters(timeline);
      setLastUpdated(new Date());
      setEnabledSources((prev) => {
        const allSources = new Set(timeline.flatMap((c) => c.sources));
        // First load: everything on. Later refreshes: keep the user's choices,
        // just fold in any brand-new source as enabled by default.
        if (prev.size === 0) return allSources;
        const next = new Set(prev);
        allSources.forEach((s) => next.add(s));
        return next;
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load timeline");
    } finally {
      setLoadingTimeline(false);
    }
  }

  useEffect(() => {
    loadTimeline();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelectedCluster(null);
      return;
    }
    setLoadingCluster(true);
    getCluster(selectedId)
      .then(setSelectedCluster)
      .catch(() => setSelectedCluster(null))
      .finally(() => setLoadingCluster(false));
  }, [selectedId]);

  const allSources = useMemo(
    () => Array.from(new Set(clusters.flatMap((c) => c.sources))).sort(),
    [clusters]
  );

  const visibleClusters = useMemo(
    () => clusters.filter((c) => c.sources.some((s) => enabledSources.has(s))),
    [clusters, enabledSources]
  );

  function toggleSource(source: string) {
    setEnabledSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <header className="border-b border-rule pb-6 mb-8 flex items-end justify-between gap-6 flex-wrap">
        <div>
          <h1 className="font-display text-masthead">News Pulse</h1>
          <p className="text-ink-soft mt-1">Live articles, grouped by topic, laid out on a timeline.</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-ink-soft">
              Updated {lastUpdated.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
          <RefreshButton onComplete={loadTimeline} />
        </div>
      </header>

      <div className="mb-5">
        <SourceFilter sources={allSources} enabled={enabledSources} onToggle={toggleSource} />
      </div>

      {loadError && (
        <div className="border border-wire text-wire bg-wire/5 rounded-sm px-4 py-3 mb-6 text-sm">
          Couldn&apos;t reach the API: {loadError}. Is the backend running and{" "}
          <code>NEXT_PUBLIC_API_URL</code> set correctly?
        </div>
      )}

      {loadingTimeline ? (
        <div className="border border-rule bg-card rounded-sm px-6 py-16 text-center text-ink-soft">
          Loading timeline…
        </div>
      ) : (
        <Timeline clusters={visibleClusters} selectedId={selectedId} onSelect={setSelectedId} />
      )}

      <div className="mt-8">
        <ClusterDetail cluster={selectedCluster} loading={loadingCluster} />
      </div>
    </main>
  );
}
