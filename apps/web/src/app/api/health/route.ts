import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    {
      service: "control-premium-web",
      status: "ok",
      version: "0.1.0",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
