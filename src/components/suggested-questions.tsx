"use client";

import { useSearchNavigation } from "@/hooks/use-search-navigation";
import { cn } from "@/lib/utils";

type SuggestedQuestionsProps = {
  questions: string[];
  title?: string;
  description?: string;
  layout?: "chips" | "stack";
  onSameQuery?: (query: string) => void;
};

export function SuggestedQuestions({
  questions,
  title = "常见问题",
  description,
  layout = "chips",
  onSameQuery,
}: SuggestedQuestionsProps) {
  const { submitQuery, isPending } = useSearchNavigation({
    onSameQuery,
  });

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold tracking-[0.18em] text-[var(--official)] uppercase">
          {title}
        </h2>
        {description ? <p className="text-sm muted">{description}</p> : null}
      </div>
      <div className={cn("gap-3", layout === "chips" ? "flex flex-wrap" : "grid")}>
        {questions.map((question) => (
          <button
            className={cn(
              "rounded-full border px-4 py-2 text-left text-sm transition",
              layout === "chips"
                ? "border-[var(--line)] bg-white/70 hover:border-[var(--official)] hover:bg-white"
                : "surface-strong rounded-[var(--radius-sm)] border-[var(--line)] px-4 py-3 hover:-translate-y-0.5",
            )}
            disabled={isPending}
            key={question}
            onClick={() => submitQuery(question)}
            type="button"
          >
            {question}
          </button>
        ))}
      </div>
    </section>
  );
}

