import { NextResponse } from "next/server";
import { applyCouncilFeedback } from "@/lib/jarvis/council";

export const runtime = "nodejs";

type Body = { sessionId?: string; rating?: "good" | "bad" };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body.sessionId || !["good", "bad"].includes(body.rating || "")) {
      return NextResponse.json({ error: "sessionId and rating=good|bad are required" }, { status: 400 });
    }
    const session = await applyCouncilFeedback(body.sessionId, body.rating as "good" | "bad");
    if (!session) return NextResponse.json({ error: "Council session not found" }, { status: 404 });
    return NextResponse.json({ ok: true, sessionId: body.sessionId, rating: body.rating });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
