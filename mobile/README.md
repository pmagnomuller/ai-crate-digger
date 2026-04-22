# AI Crate Digger Mobile (Expo)

Minimal iOS + Android client for the existing API.

## Prerequisites

- Node 20+
- Expo Go app (or iOS Simulator / Android Emulator)
- Backend API running at `http://localhost:3000` (or your configured URL)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
```

3. Start app:

```bash
npm run start
```

Then press `i` for iOS simulator or `a` for Android emulator.

## Features in this MVP

- Streaming chat via `POST /chat/stream`
- Assistant audio playback from `final_answer` audio payload
- Local conversation persistence with AsyncStorage
- Clear local chat history action

## Troubleshooting

- If using a real device, `localhost` points to your phone, not your computer.
  - Use your machine LAN IP in `EXPO_PUBLIC_API_BASE_URL`.
- Ensure backend CORS is enabled and API is reachable from the device network.
