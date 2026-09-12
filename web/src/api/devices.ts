import { apiFetch } from "./client";
export type DeviceWire = { id: string; platform: "android" | "web"; name: string; app_version: string; last_seen_at: string; has_push_token: boolean };
export const registerDevice = (input: { id: string; platform: "web"; name: string; app_version: string }) =>
  apiFetch<{ device: DeviceWire }>("/api/v2/me/devices", { method: "POST", body: JSON.stringify(input) }).then((r) => r.device);
export const listDevices = () => apiFetch<{ devices: DeviceWire[] }>("/api/v2/me/devices").then((r) => r.devices);
