import { createAuthClient } from "better-auth/react";
export const authClient = createAuthClient({ baseURL: typeof window === "undefined" ? "http://localhost" : window.location.origin });
export const { useSession } = authClient;
