"use client";

export default function SourceFilter({
  sources,
  enabled,
  onToggle,
}: {
  sources: string[];
  enabled: Set<string>;
  onToggle: (source: string) => void;
}) {
  if (sources.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-ink-soft mr-1">Sources</span>
      {sources.map((source) => {
        const active = enabled.has(source);
        return (
          <button
            key={source}
            onClick={() => onToggle(source)}
            aria-pressed={active}
            className={`text-sm px-3 py-1 rounded-full border transition-colors ${
              active
                ? "border-wire text-wire bg-wire/5"
                : "border-rule text-ink-soft hover:border-ink-soft"
            }`}
          >
            {source}
          </button>
        );
      })}
    </div>
  );
}
