# Polish

A dual-role nail service marketplace app connecting customers with nail technicians. Built with React Native, Expo, and Firebase.

## Features

- **Phone authentication** — Sign up and log in with your phone number (SMS OTP)
- **Dual roles** — Users can be a Customer, Nail Tech, or both
- **Tech discovery** — Browse nail techs by location, tools, and designs
- **Booking** — Schedule appointments with date/time picker and availability validation
- **Messaging** — Real-time 1:1 chat between customers and techs
- **Profile management** — Edit your profile, switch roles, manage availability

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native + Expo |
| Routing | Expo Router (file-based) |
| Backend | Firebase (Auth + Firestore) |
| Language | TypeScript |

## Getting Started

### Prerequisites

- Node.js
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac) or Android Emulator, or Expo Go on your phone

### Install & Run

```bash
npm install
npx expo start
```

Then open in your simulator or scan the QR code with Expo Go.

## Project Structure

```
app/
  _layout.tsx          Root layout — routes between auth, setup, and tabs
  auth.tsx             Phone login flow (phone → OTP → role selection)
  setup.tsx            First-time profile setup
  profile.tsx          Profile editing screen
  book/[id].tsx        Book an appointment with a tech
  tech/[id].tsx        View a tech's profile
  (tabs)/
    _layout.tsx        Tab navigator (Home, Bookings, Inbox, Profile)
    index.tsx          Home — discover techs (customers) / status (techs)
    bookings.tsx       View and manage appointments
    profile.tsx        Profile tab
    inbox/
      index.tsx        Conversation list
      chat/[id].tsx    1:1 chat thread

contexts/
  AuthContext.tsx       Global auth state and user profile management

firebase/
  config.ts            Firebase app initialization

lib/
  phoneAuth.ts         Phone verification helpers
  threadId.ts          Chat thread ID generation
  getUser.ts           Firestore user lookup

constants/
  theme.ts             Design tokens (colors, spacing, typography)
  nailTechOptions.ts   Predefined options for tools, designs, locations
```

## Data Model (Firestore)

**users/{uid}** — Profile, roles, nail tech info (bio, tools, designs, availability)

**appointments/{id}** — Booking linking a client to a tech (date, status, notes)

**threads/{id}** — Conversation between two users, with a `messages` subcollection
