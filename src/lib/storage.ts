import { PersistedAppSchema, type PersistedApp } from "@/lib/schema";

/** One localStorage key for all saved state, validated on every load. */
export const STORAGE_KEY = "benefitsshield:v1";

export function loadApp(): PersistedApp | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = PersistedAppSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveApp(app: PersistedApp): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(app));
  } catch {
    // Storage can be full or blocked (private mode). The app still works for this session.
  }
}
