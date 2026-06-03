import { getAuth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Build the handler lazily per request so importing this route at build time
// never constructs the auth instance (which reads env).
export const GET = (req: Request) => toNextJsHandler(getAuth()).GET(req);
export const POST = (req: Request) => toNextJsHandler(getAuth()).POST(req);
