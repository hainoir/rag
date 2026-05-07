import { NextResponse } from "next/server";

import { parseSearchFeedbackPayload } from "@/lib/search/feedback";
import { storeSearchFeedback } from "@/lib/server/feedback-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_json",
      },
      { status: 400 },
    );
  }

  const parsed = parseSearchFeedbackPayload(payload);

  if (!parsed.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_feedback",
        message: parsed.error,
      },
      { status: 400 },
    );
  }

  try {
    await storeSearchFeedback(parsed.feedback);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        timestamp: new Date().toISOString(),
        service: "feedback-api",
        event: "feedback.store_failed",
        requestId: parsed.feedback.requestId,
        errorMessage: error instanceof Error ? error.message : String(error),
      }),
    );

    return NextResponse.json(
      {
        ok: false,
        error: "feedback_store_unavailable",
      },
      { status: 500 },
    );
  }
}
