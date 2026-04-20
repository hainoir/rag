import { NextResponse } from "next/server";

import { searchServiceProvider } from "@/lib/search/search-provider";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const response = await searchServiceProvider.search(query);

  return NextResponse.json(response);
}
