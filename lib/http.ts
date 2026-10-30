import { NextResponse } from "next/server";

const AUTH_HEADER = 'Basic realm="News Admin", charset="UTF-8"';

export function jsonError(
  message: string,
  status = 400,
  code?: string,
): NextResponse {
  return NextResponse.json(
    { error: code ?? "BAD_REQUEST", message },
    { status },
  );
}

export function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "UNAUTHORIZED", message: "Authentication required." },
    {
      status: 401,
      headers: { "WWW-Authenticate": AUTH_HEADER },
    },
  );
}

export function serverError(message = "Internal server error."): NextResponse {
  return NextResponse.json(
    { error: "INTERNAL_ERROR", message },
    { status: 500 },
  );
}
