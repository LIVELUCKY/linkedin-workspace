import { initializeApp, getApps } from "firebase/app";
import { getAnalytics, logEvent, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyDgfkVekZ9_pgJ8WdHhqeXgwRFl5WU6iLU",
  authDomain: "linkedin-workspace-tool.firebaseapp.com",
  projectId: "linkedin-workspace-tool",
  storageBucket: "linkedin-workspace-tool.firebasestorage.app",
  messagingSenderId: "1003302835190",
  appId: "1:1003302835190:web:7613466b9d14f74e0fadd7",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const CONSENT_KEY = "analytics_consent";

export function getConsent(): "granted" | "denied" | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CONSENT_KEY) as "granted" | "denied" | null;
}

export function setConsent(value: "granted" | "denied"): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONSENT_KEY, value);
}

// Analytics is never initialised until consent is "granted".
export async function track(event: string, params?: Record<string, string | number>) {
  if (typeof window === "undefined") return;
  if (getConsent() !== "granted") return;
  if (!process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID) return;
  if (!(await isSupported())) return;
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  logEvent(getAnalytics(app), event, params);
}
