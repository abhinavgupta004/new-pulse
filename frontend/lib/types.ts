export type TimelineCluster = {
  id: string;
  label: string;
  article_count: number;
  start_time: string; // ISO 8601
  end_time: string; // ISO 8601
  sources: string[];
  intensity: number; // 0-1, normalized against the busiest cluster
};

export type Article = {
  id: string;
  source: string;
  title: string;
  summary: string | null;
  link: string;
  published_at: string;
};

export type ClusterDetail = {
  id: string;
  label: string;
  articles: Article[];
};

export type IngestStatus = {
  jobId: string;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: string;
  finishedAt: string | null;
  result: Record<string, unknown> | null;
};
