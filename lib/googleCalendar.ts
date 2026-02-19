import { db } from '@/firebase/config';
import { deleteField, doc, getDoc, updateDoc } from 'firebase/firestore';

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID!;

export type GoogleCalendarTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix ms
};

export type AppointmentForCalendar = {
  dateTime: Date;
  appointmentType?: string;
  note?: string;
};

export async function storeGoogleTokens(
  uid: string,
  tokens: GoogleCalendarTokens
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { googleCalendar: tokens });
}

export async function getValidAccessToken(uid: string): Promise<string | null> {
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (!userDoc.exists()) return null;

    const gcal = userDoc.data()?.googleCalendar as GoogleCalendarTokens | undefined;
    if (!gcal?.accessToken || !gcal?.refreshToken) return null;

    // Still valid — return as-is
    if (gcal.expiresAt > Date.now() + 60_000) return gcal.accessToken;

    // Refresh
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: GOOGLE_CLIENT_ID,
        refresh_token: gcal.refreshToken,
      }).toString(),
    });

    if (!res.ok) {
      console.warn('Google token refresh failed:', await res.text());
      return null;
    }

    const data = await res.json();
    const updated: GoogleCalendarTokens = {
      accessToken: data.access_token,
      refreshToken: gcal.refreshToken, // unchanged
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    await storeGoogleTokens(uid, updated);
    return updated.accessToken;
  } catch (err) {
    console.warn('getValidAccessToken error:', err);
    return null;
  }
}

export async function createCalendarEvent(
  accessToken: string,
  appointment: AppointmentForCalendar,
  techName: string,
  clientName: string
): Promise<string | null> {
  try {
    const start = appointment.dateTime;
    const end = new Date(start.getTime() + 90 * 60 * 1000); // 90 min
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const description = [
      appointment.appointmentType,
      appointment.note ? `Notes: ${appointment.note}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: `${techName} / ${clientName} Nail Appointment`,
          description,
          start: { dateTime: start.toISOString(), timeZone: tz },
          end: { dateTime: end.toISOString(), timeZone: tz },
          reminders: { useDefault: true },
        }),
      }
    );

    if (!res.ok) {
      console.warn('createCalendarEvent failed:', await res.text());
      return null;
    }

    const data = await res.json();
    return data.id as string;
  } catch (err) {
    console.warn('createCalendarEvent error:', err);
    return null;
  }
}

export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  try {
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
    );
  } catch (err) {
    console.warn('deleteCalendarEvent error:', err);
  }
}

export async function disconnectGoogleCalendar(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { googleCalendar: deleteField() });
}
