import { db } from '@/firebase/config';
import { doc, getDoc } from 'firebase/firestore';

/** Build a display name from first/last, with a fallback */
export function buildFullName(
  firstName?: string,
  lastName?: string,
  fallback = 'Unknown'
): string {
  const first = firstName || '';
  const last = lastName || '';
  return first && last ? `${first} ${last}`.trim() : first || last || fallback;
}

/** Fetch a user's display name from Firestore by uid */
export async function getUserName(uid: string, fallback = 'Unknown'): Promise<string> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const d = snap.data();
      return buildFullName(d.firstName, d.lastName, fallback);
    }
  } catch (_) {}
  return fallback;
}

/** Format a Date as "Mon, Jan 5 at 2:30 PM" */
export function formatDateTime(dt: Date): string {
  return `${dt.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })} at ${dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}
