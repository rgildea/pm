"use client";

import type { Priority } from "@/lib/kanban";

export type FilterState = {
  search: string;
  priority: Priority | "";
};

type FilterBarProps = {
  filter: FilterState;
  onChange: (filter: FilterState) => void;
  totalCards: number;
  visibleCards: number;
};

export const FilterBar = ({ filter, onChange, totalCards, visibleCards }: FilterBarProps) => {
  const isFiltered = filter.search !== "" || filter.priority !== "";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1" style={{ minWidth: "180px", maxWidth: "320px" }}>
        <input
          type="text"
          value={filter.search}
          onChange={(e) => onChange({ ...filter, search: e.target.value })}
          placeholder="Search cards"
          className="w-full rounded-xl border border-[var(--stroke)] bg-white px-4 py-2 pl-8 text-sm text-[var(--navy-dark)] shadow-sm focus:border-[var(--primary-blue)] focus:outline-none"
        />
        <svg
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--gray-text)]"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="6" cy="6" r="4" />
          <path d="M9.5 9.5L13 13" strokeLinecap="round" />
        </svg>
      </div>

      <div className="flex items-center gap-1">
        {(["", "high", "medium", "low"] as (Priority | "")[]).map((p) => (
          <button
            key={p === "" ? "all" : p}
            type="button"
            onClick={() => onChange({ ...filter, priority: p })}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] transition ${
              filter.priority === p
                ? p === ""
                  ? "border-[var(--navy-dark)] bg-[var(--navy-dark)] text-white"
                  : p === "high"
                    ? "border-red-500 bg-red-500 text-white"
                    : p === "medium"
                      ? "border-amber-500 bg-amber-500 text-white"
                      : "border-emerald-500 bg-emerald-500 text-white"
                : "border-[var(--stroke)] text-[var(--gray-text)] hover:border-[var(--navy-dark)]"
            }`}
          >
            {p === "" ? "All" : p}
          </button>
        ))}
      </div>

      {isFiltered && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--gray-text)]">
            {visibleCards}/{totalCards} cards
          </span>
          <button
            type="button"
            onClick={() => onChange({ search: "", priority: "" })}
            className="text-xs font-semibold text-[var(--primary-blue)] hover:underline"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
};
