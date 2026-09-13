import { apiFetch } from "./client";
export type Space = { id: string; name: string; kind: "personal" | "shared"; role: "owner" | "member" };
export const listSpaces = () => apiFetch<{ spaces: Space[] }>("/api/v2/spaces").then((r) => r.spaces);
