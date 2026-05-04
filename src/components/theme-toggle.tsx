"use client";

import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      aria-label={isDark ? "切换到浅色模式" : "切换到暗色模式"}
      aria-pressed={isDark}
      className="theme-toggle"
      onClick={toggleTheme}
      title={isDark ? "浅色模式" : "暗色模式"}
      type="button"
    >
      <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
        {isDark ? (
          <>
            <circle cx="12" cy="12" r="4.25" stroke="currentColor" strokeWidth="2" />
            <path
              d="M12 2.75v2.1M12 19.15v2.1M4.75 4.75l1.48 1.48M17.77 17.77l1.48 1.48M2.75 12h2.1M19.15 12h2.1M4.75 19.25l1.48-1.48M17.77 6.23l1.48-1.48"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2"
            />
          </>
        ) : (
          <path
            d="M20.25 14.35A7.7 7.7 0 0 1 9.65 3.75 8.15 8.15 0 1 0 20.25 14.35Z"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        )}
      </svg>
    </button>
  );
}
