import {NextResponse} from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "world-radar",
    mode: "bootstrap",
    timestamp: new Date().toISOString()
  });
}
