"use client";

import React from "react";

export interface FilterConfig {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}

interface FilterBarProps {
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters: FilterConfig[];
}

export function FilterBar({ searchPlaceholder, searchValue, onSearchChange, filters }: FilterBarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 items-center bg-white border border-[#E2E5EA] rounded-xl p-4 shadow-sm mb-6 w-full">
      {/* Search Input */}
      <div className="relative flex-1 w-full">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-[#E2E5EA] rounded-lg text-sm text-[#0A2540] focus:outline-none focus:ring-2 focus:ring-rp-accent placeholder-[#94a3b8] transition-all"
        />
      </div>

      {/* Select Filters */}
      <div className="flex items-center gap-3 w-full sm:w-auto">
        {filters.map((f) => (
          <select
            key={f.key}
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
            className="w-full sm:w-auto bg-[#F7F8FA] border border-[#E2E5EA] text-[#4F5B66] text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rp-accent hover:bg-[#E2E5EA]/50 transition-colors cursor-pointer"
          >
            <option value="">{f.label}</option>
            {f.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ))}
      </div>
    </div>
  );
}
