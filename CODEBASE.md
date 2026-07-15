# Polish Codebase Guide

A walkthrough of how the Polish app works, file by file.

---

## How the app starts

When the app launches, everything begins in **`app/_layout.tsx`** (the root layout).

1. It wraps the entire app in `SafeAreaProvider` and `AuthProvider` (from `contexts/AuthContext.tsx`)
2. Inside `RootLayoutNav`, it checks auth state and decides where to send the user:
   - **No user / no phone number** → redirect to `/auth`
   - **User exists but no profile or profile not completed** → redirect to `/setup`
   - **Profile completed** → send to `/(tabs)` (the main app)
3. All screens are registered as a `Stack` (meaning they push on top of each other like pages)

**Key concept:** Expo Router uses **file-based routing**. Every file in `app/` becomes a route automatically. The file name = the URL path.

---

## Authentication flow

### `app/auth.tsx` — Phone sign-in screen

- User enters their phone number
- Firebase sends an SMS verification code
- User enters the code to sign in
- On success, `AuthContext` picks up the new user and the root layout redirects them to `/setup` (if new) or `/(tabs)` (if returning)

Uses `lib/phoneAuth.ts` for the actual Firebase phone auth logic (reCAPTCHA, `signInWithPhoneNumber`).

### `app/setup.tsx` — Profile setup (first time only)

After signing in for the first time, users land here to:
1. Pick their role(s): **Customer**, **Nail Tech**, or **both**
2. Enter their name and location
3. If nail tech: pick tools, designs, availability days, and write a bio
4. If customer: pick style preferences
5. Save everything to Firestore → `profileCompleted: true` → redirected to `/(tabs)`

---

## The tab bar (main app)

**`app/(tabs)/_layout.tsx`** defines the bottom tab bar with 4 tabs:

| Tab | File | What it does |
|-----|------|-------------|
| Home | `app/(tabs)/index.tsx` | Discovery feed (customers) or status card (techs) |
| Bookings | `app/(tabs)/bookings.tsx` | Upcoming/past appointments for both roles |
| Inbox | `app/(tabs)/inbox/index.tsx` | List of message threads |
| Profile | `app/(tabs)/profile.tsx` | Edit your profile |

### Home screen — `app/(tabs)/index.tsx`

This screen changes based on your role:

- **Customer only:** Search bar, location/service filters, "Browse by style" chips, grid of nail tech cards. Tap a card → opens tech profile.
- **Tech only:** Status card showing next appointment or pending booking count. If nothing, shows "You're all set for today."
- **Both roles:** Full customer discovery + tech status card at the top.

The tech list comes from a Firestore query: all users where `roles` array contains `"nailTech"`.

### Bookings screen — `app/(tabs)/bookings.tsx`

Uses `SectionList` to show appointments grouped into sections:
- **As customer:** "Upcoming" and "Past bookings"
- **As tech:** "Incoming requests" (pending) and "Upcoming" (confirmed)

Listens to Firestore `appointments` collection with real-time `onSnapshot` listeners.

### Inbox — `app/(tabs)/inbox/`

This is a **nested navigator** (has its own `_layout.tsx`):

- **`inbox/index.tsx`** — List of conversation threads. Queries Firestore `threads` collection where `participantIds` contains your uid. Shows other person's name, last message, and timestamp.
- **`inbox/chat/[id].tsx`** — Individual chat screen. The `[id]` is the thread ID (format: `uid1_uid2` sorted alphabetically). Real-time message listener, sends messages to Firestore `threads/{threadId}/messages` subcollection.

### Profile tab — `app/(tabs)/profile.tsx`

Thin wrapper around `ProfileEditor` component. Shows in the tab bar (no back button).

---

## Standalone screens (outside tabs)

These open as full-screen pages **on top of** the tab bar (with a back button):

### `app/tech/[id].tsx` — Nail tech profile page

- `[id]` is the tech's user ID (passed as a URL param)
- Fetches the tech's Firestore document
- Shows: name, location, bio, tools, designs, availability days
- Two action buttons: **Book** (→ `/book/[id]`) and **Message** (→ opens chat thread)
- If viewing your own profile, shows an "Edit" button instead

### `app/book/[id].tsx` — Booking screen

- `[id]` is the tech's user ID
- Date/time picker and optional note
- Creates a document in Firestore `appointments` collection with status `"pending"`

### `app/profile.tsx` — Profile editor (standalone)

Same `ProfileEditor` component as the tab version, but with a back button. Used when navigating from the tech profile "Edit" button.

---

## Shared code

### `components/ProfileEditor.tsx`

The full profile editing UI, used by both `app/profile.tsx` and `app/(tabs)/profile.tsx`. Props:
- `showBackButton` — whether to show a back arrow (standalone) or not (tab)
- `topPadding` — safe area inset for standalone screens

Handles: loading profile from Firestore, editing name/location/bio/tools/designs/availability/preferences, role display, saving to Firestore, and logout.

### `contexts/AuthContext.tsx`

React context that provides auth state to the entire app:
- `user` — Firebase Auth user object (has `uid`, `phoneNumber`)
- `userProfile` — Firestore profile document (has `roles`, `firstName`, `lastName`, `nailTechProfile`, etc.)
- `loading` — whether auth state is still being determined
- `refreshProfile()` — re-fetch the profile from Firestore
- `logout()` — sign out

Listens to `onAuthStateChanged` and fetches the matching Firestore document from `users/{uid}`.

### `firebase/config.ts`

Initializes Firebase and exports:
- `auth` — Firebase Auth instance
- `db` — Firestore instance
- `firebaseConfig` — the config object (used by auth.tsx for reCAPTCHA)

### `lib/utils.ts`

Shared utility functions used across many screens:
- `buildFullName(firstName, lastName, fallback)` — combines name parts into a display name
- `getUserName(uid, fallback)` — fetches a user's name from Firestore by uid
- `formatDateTime(date)` — formats a Date as "Mon, Jan 5 at 2:30 PM"

### `lib/phoneAuth.ts`

Phone authentication helper:
- `sendPhoneVerificationCode()` — handles reCAPTCHA setup and calls `signInWithPhoneNumber`
- `formatPhoneNumber()` — normalizes phone input to `+1XXXXXXXXXX` format

### `lib/threadId.ts`

- `getThreadId(uid1, uid2)` — creates a stable, sorted thread ID like `abc123_xyz789`. Used to ensure both users always reference the same chat thread.

### `constants/theme.ts`

Design tokens (`Polish` object): colors, spacing, radius, typography, shadows. Every screen imports from here for consistent styling.

### `constants/nailTechOptions.ts`

Predefined option lists: tools/techniques, designs, customer preferences, locations. Used in setup, profile editing, and home screen filters.

---

## Firestore data model

### `users` collection
```
users/{uid}
├── phoneNumber: "+15551234567"
├── firstName: "Jane"
├── lastName: "Doe"
├── roles: ["user", "nailTech"]    // can have both
├── profileCompleted: true
├── location: "Downtown"
├── preferences: ["Gel manicures", "Nail art"]  // customer prefs
├── nailTechProfile:               // only if role includes "nailTech"
│   ├── bio: "Specializing in gel art..."
│   ├── location: "Collegetown"
│   ├── tools: ["Gel polish", "Chrome"]
│   ├── designs: ["French", "Abstract"]
│   └── availabilities:
│       └── days: ["Monday", "Wednesday", "Friday"]
└── createdAt: Timestamp
```

### `appointments` collection
```
appointments/{id}
├── clientId: "uid_of_customer"
├── techId: "uid_of_tech"
├── dateTime: Timestamp
├── note: "French tips please"     // optional
└── status: "pending" | "confirmed"
```

### `threads` collection (messaging)
```
threads/{threadId}                  // threadId = sorted "uid1_uid2"
├── participantIds: ["uid1", "uid2"]
├── lastMessage: "See you tomorrow!"
├── lastMessageAt: Timestamp
├── lastSenderId: "uid1"
└── messages/                       // subcollection
    └── {messageId}
        ├── text: "See you tomorrow!"
        ├── senderId: "uid1"
        └── createdAt: Timestamp
```

---

## File tree summary

```
app/
├── _layout.tsx              # Root layout: auth guard + routing logic
├── auth.tsx                 # Phone sign-in screen
├── setup.tsx                # First-time profile setup
├── profile.tsx              # Standalone profile editor (with back button)
├── book/[id].tsx            # Booking screen for a specific tech
├── tech/[id].tsx            # Tech profile view
└── (tabs)/
    ├── _layout.tsx          # Tab bar config (Home, Bookings, Inbox, Profile)
    ├── index.tsx            # Home: discovery (customer) or status (tech)
    ├── bookings.tsx         # Appointments list
    ├── profile.tsx          # Profile editor (in tab bar)
    └── inbox/
        ├── _layout.tsx      # Inbox stack navigator
        ├── index.tsx        # Thread list
        └── chat/[id].tsx    # Individual chat

components/
└── ProfileEditor.tsx        # Shared profile editing component

constants/
├── theme.ts                 # Design tokens (colors, spacing, typography)
└── nailTechOptions.ts       # Predefined option lists

contexts/
└── AuthContext.tsx           # Auth state provider

firebase/
└── config.ts                # Firebase initialization

lib/
├── utils.ts                 # buildFullName, getUserName, formatDateTime
├── phoneAuth.ts             # Phone auth + reCAPTCHA helper
└── threadId.ts              # Stable chat thread ID generator
```
