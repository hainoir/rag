import { escapeRegExp } from "@/lib/utils";

type QueryHighlightProps = {
  text: string;
  terms: string[];
};

export function QueryHighlight({ text, terms }: QueryHighlightProps) {
  const filteredTerms = Array.from(new Set(terms.filter(Boolean))).sort(
    (left, right) => right.length - left.length,
  );

  if (!filteredTerms.length) {
    return <>{text}</>;
  }

  const pattern = new RegExp(`(${filteredTerms.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, index) => {
        const shouldHighlight = filteredTerms.some(
          (term) => term.toLowerCase() === part.toLowerCase(),
        );

        if (!shouldHighlight) {
          return <span key={`${part}-${index}`}>{part}</span>;
        }

        return (
          <mark className="mark" key={`${part}-${index}`}>
            {part}
          </mark>
        );
      })}
    </>
  );
}

