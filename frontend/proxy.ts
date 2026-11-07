import { NextRequest, NextResponse } from "next/server";
export function proxy(request: NextRequest) {
  const origin =
    process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3000}`;
  if (request.headers.get("host") !== new URL(origin).host)
    return new NextResponse("Local requests only", { status: 403 });
  const sentOrigin = request.headers.get("origin");
  if (sentOrigin && sentOrigin !== origin)
    return new NextResponse("Same origin required", { status: 403 });
  return NextResponse.next();
}
