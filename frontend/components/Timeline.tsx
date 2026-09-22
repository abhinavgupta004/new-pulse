"use client";

import { useMemo } from "react";
import type { TimelineCluster } from "@/lib/types";

const PX_PER_HOUR = 26;
const ROW_HEIGHT = 46;
const BAR_MIN_WIDTH = 10;
const AXIS_HEIGHT = 32;

type Lane = { endTime: number; items: (TimelineCluster & { x: number; width: number })[] };

/**
 * Greedy interval scheduling: walk clusters in start-time order, place each
 * into the first lane whose last bar already ended before this one starts.
 * This is what keeps overlapping stories from being drawn on top of each other.
 */
function assignLanes(clusters: TimelineCluster[], domainStart: number) {
  const lanes: Lane[] = [];
  const sorted = [...clusters].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  const positioned = sorted.map((c) => {
    const startMs = new Date(c.start_time).getTime();
    const endMs = new Date(c.end_time).getTime();
    const x = ((startMs - domainStart) / 3_600_000) * PX_PER_HOUR;
    const width = Math.max(BAR_MIN_WIDTH, ((endMs - startMs) / 3_600_000) * PX_PER_HOUR);

    let lane = lanes.find((l) => l.endTime <= startMs);
    if (!lane) {
      lane = { endTime: -Infinity, items: [] };
      lanes.push(lane);
    }
    const item = { ...c, x, width };
    lane.items.push(item);
    lane.endTime = endMs;
    return { item, laneIndex: lanes.indexOf(lane) };
  });

  return { positioned, laneCount: lanes.length };
}

export default function Timeline({
  clusters,
  selectedId,
  onSelect,
}: {
  clusters: TimelineCluster[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { positioned, laneCount, domainStart, totalWidth, dayTicks } = useMemo(() => {
    if (clusters.length === 0) {
      return { positioned: [], laneCount: 0, domainStart: 0, totalWidth: 0, dayTicks: [] as { x: number; label: string }[] };
    }
    const starts = clusters.map((c) => new Date(c.start_time).getTime());
    const ends = clusters.map((c) => new Date(c.end_time).getTime());
    const domainStart = Math.min(...starts);
    const domainEnd = Math.max(...ends);
    const { positioned, laneCount } = assignLanes(clusters, domainStart);
    const totalWidth = Math.max(600, ((domainEnd - domainStart) / 3_600_000) * PX_PER_HOUR + 120);

    // One tick per day across the domain, for the axis.
    const dayTicks: { x: number; label: string }[] = [];
    const cursor = new Date(domainStart);
    cursor.setHours(0, 0, 0, 0);
    while (cursor.getTime() <= domainEnd) {
      const x = ((cursor.getTime() - domainStart) / 3_600_000) * PX_PER_HOUR;
      dayTicks.push({
        x,
        label: cursor.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return { positioned, laneCount, domainStart, totalWidth, dayTicks };
  }, [clusters]);

  if (clusters.length === 0) {
    return (
      <div className="border border-rule bg-card rounded-sm px-6 py-16 text-center">
        <p className="font-display text-xl text-ink-soft">Nothing on the wire yet.</p>
        <p className="mt-2 text-sm text-ink-soft">
          Trigger a refresh to pull the latest articles and build the timeline.
        </p>
      </div>
    );
  }

  const svgHeight = laneCount * ROW_HEIGHT + AXIS_HEIGHT + 16;

  return (
    <div className="border border-rule bg-card rounded-sm overflow-x-auto">
      <svg width={totalWidth} height={svgHeight} role="img" aria-label="Topic timeline">
        {/* day gridlines + labels */}
        {dayTicks.map((tick) => (
          <g key={tick.x}>
            <line
              x1={tick.x}
              x2={tick.x}
              y1={AXIS_HEIGHT}
              y2={svgHeight}
              stroke="#C9C2AE"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            <text x={tick.x + 6} y={20} fontSize={12} fill="#4B5468" fontFamily="var(--font-public-sans)">
              {tick.label}
            </text>
          </g>
        ))}

        {/*
          Labels are intentionally NOT drawn permanently next to every bar.
          With dozens of clusters close together in time (common right after
          a refresh), fixed inline text collides with neighboring bars and
          their own labels, producing unreadable overlapping text. Instead:
          hover shows the native <title> tooltip, and clicking a bar opens
          the full detail panel below — the selected bar also gets a single
          floating label so there's still an at-a-glance caption for exactly
          one topic at a time.
        */}
        {positioned.map(({ item, laneIndex }) => {
          const y = AXIS_HEIGHT + laneIndex * ROW_HEIGHT + 10;
          const barHeight = 14 + item.intensity * 12;
          const isSelected = item.id === selectedId;
          const opacity = 0.35 + item.intensity * 0.65;

          return (
            <g
              key={item.id}
              transform={`translate(${item.x}, ${y})`}
              onClick={() => onSelect(item.id)}
              style={{ cursor: "pointer" }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(item.id)}
              aria-label={`${item.label}, ${item.article_count} article${item.article_count === 1 ? "" : "s"}`}
            >
              <title>
                {item.label} · {item.article_count} article{item.article_count === 1 ? "" : "s"}
              </title>
              <rect
                width={item.width}
                height={barHeight}
                rx={4}
                fill={isSelected ? "#B0272D" : "#B08328"}
                opacity={isSelected ? 1 : opacity}
                stroke={isSelected ? "#1B2233" : "none"}
                strokeWidth={isSelected ? 1.5 : 0}
              />
              {isSelected && (
                <text
                  x={item.width + 8}
                  y={barHeight / 2 + 4}
                  fontSize={13}
                  fontFamily="var(--font-public-sans)"
                  fill="#B0272D"
                  fontWeight={600}
                >
                  {item.label} · {item.article_count}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
