# Firebase setup for Polish

## 1. Firebase Console

1. **Create a project** (or use an existing one) at [console.firebase.google.com](https://console.firebase.google.com).
2. **Add an app** (iOS, Android, or Web) and copy the config into `firebase/config.ts` if you haven’t already.

---

## 2. Authentication – Phone

1. In Firebase Console go to **Build → Authentication**.
2. Open the **Sign-in method** tab.
3. Enable **Phone**.
4. (Optional) Add **test phone numbers** for development (e.g. `+1 650 555 1234` with a test code).

Your app already uses Phone auth; no code changes needed for this step.

---

## 3. Firestore Database

1. Go to **Build → Firestore Database**.
2. **Create database** if you don’t have one (start in **test mode** for development, then lock down with rules).
3. Choose a region (e.g. `us-central1`).

You don’t need to create collections by hand. The app will create:

- **`users`** – profiles (uid as document id).
- **`appointments`** – bookings (clientId, techId, dateTime, status, note).
- **`threads`** – chat threads (participantIds, lastMessage, lastMessageAt).
- **`threads/{threadId}/messages`** – messages in a thread (text, senderId, createdAt).

---

## 4. Firestore Security Rules

In **Firestore → Rules**, replace your rules with the following (then **Publish**):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users: anyone can read (for names, tech lists); only own doc writable
    match /users/{userId} {
      allow read: if request.auth != null;
      allow create, update, delete: if request.auth != null && request.auth.uid == userId;
    }

    // Appointments: clients create; client and tech can read their own
    match /appointments/{appointmentId} {
      allow read: if request.auth != null
        && (resource.data.clientId == request.auth.uid || resource.data.techId == request.auth.uid);
      allow create: if request.auth != null && request.resource.data.clientId == request.auth.uid;
      allow update, delete: if request.auth != null
        && (resource.data.clientId == request.auth.uid || resource.data.techId == request.auth.uid);
    }

    // Threads: only participants can read/write; create with auth user in participantIds
    match /threads/{threadId} {
      allow read, update: if request.auth != null
        && request.auth.uid in resource.data.participantIds;
      allow create: if request.auth != null
        && request.auth.uid in request.resource.data.participantIds;
      allow delete: if false;

      // Messages: only participants of the thread
      match /messages/{messageId} {
        allow read: if request.auth != null
          && request.auth.uid in get(/databases/$(database)/documents/threads/$(threadId)).data.participantIds;
        allow create: if request.auth != null
          && request.auth.uid in get(/databases/$(database)/documents/threads/$(threadId)).data.participantIds
          && request.resource.data.senderId == request.auth.uid;
        allow update, delete: if false;
      }
    }
  }
}
```

---

## 5. Firestore indexes

- **`users`** – query `roles` array-contains: if Firestore suggests an index, create it.
- **`appointments`** – queries by `clientId` and `techId`. Create any composite indexes Firestore asks for in the error link.
- **`threads`** – query `participantIds` array-contains. No composite index is required for the current app (sorting is done in memory). If you later add `orderBy('lastMessageAt', 'desc')`, use the index link from the error to create the composite index.

---

## 6. Checklist

- [ ] Firebase project created and app registered.
- [ ] Phone sign-in method enabled in Authentication.
- [ ] Firestore database created.
- [ ] Firestore rules updated and published.
- [ ] (Optional) Test phone numbers added for development.

After this, the app should work with Firebase for auth, profiles, bookings, and messaging.
