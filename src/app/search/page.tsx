import { ResultsShell } from "@/components/results-shell";

type SearchPageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q = "" } = await searchParams;

  return <ResultsShell initialQuery={q} />;
}
