import type { Hono } from "hono";

export const CLIENT = "web/0.1.0";

export async function signUp(app: Hono<any>, email: string, password = "correct-horse-battery") {
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:8080" },
    body: JSON.stringify({ email, password, name: email.split("@")[0] }),
  });
  if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
  const token = res.headers.get("set-auth-token");
  if (!token) throw new Error("no set-auth-token header");
  const body = await res.json();
  return { token, userId: body.user.id as string };
}

export function authed(token: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-client": CLIENT,
      ...(init.headers as Record<string, string> | undefined),
    },
  };
}
