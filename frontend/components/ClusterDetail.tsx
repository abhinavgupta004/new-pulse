"use client";

import type { ClusterDetail as ClusterDetailType } from "@/lib/types";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ClusterDetail({
  cluster,
  loading,
}: {
  cluster: ClusterDetailType | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="border border-rule bg-card rounded-sm px-6 py-10 text-center text-ink-soft">
        Loading cluster…
      </div>
    );
  }

  if (!cluster) {
    return (
      <div className="border border-rule bg-card rounded-sm px-6 py-10 text-center">
        <p className="text-ink-soft">Select a topic on the timeline to see its articles.</p>
      </div>
    );
  }

  return (
    <div className="border border-rule bg-card rounded-sm">
      <div className="border-b border-rule px-6 py-4">
        <h2 className="font-display text-2xl">{cluster.label}</h2>
        <p className="text-sm text-ink-soft mt-1">
          {cluster.articles.length} article{cluster.articles.length === 1 ? "" : "s"}
        </p>
      </div>
      <ul className="divide-y divide-rule max-h-[28rem] overflow-y-auto">
        {cluster.articles.map((article) => (
          <li key={article.id} className="px-6 py-4">
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:text-wire transition-colors"
            >
              {article.title}
            </a>
            <div className="mt-1 flex items-center gap-2 text-xs text-ink-soft">
              <span className="font-medium">{article.source}</span>
              <span aria-hidden>·</span>
              <time dateTime={article.published_at}>{formatTime(article.published_at)}</time>
            </div>
            {article.summary && <p className="mt-2 text-sm text-ink-soft line-clamp-2">{article.summary}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
