# Verdict Rush

**Verdict Rush** is a multiplayer **“Predict the Consensus”** game powered by GenLayer Intelligent Contracts and Optimistic Democracy.

Instead of asking players to find one objectively correct answer, each game contains subjective questions with four possible options. GenLayer validators rank those options according to a host-defined judging criterion, and players compete to predict the final AI consensus.

## Why GenLayer

Traditional smart contracts can verify deterministic inputs, but they cannot reliably judge subjective questions such as:

- Which proposal best balances impact and fairness?
- Which argument would most likely persuade an AI decision-maker?
- Which response best satisfies a natural-language criterion?

Verdict Rush uses a GenLayer Intelligent Contract to interpret each question, evaluate all four options, and produce a consensus ranking through Optimistic Democracy.

## Core Features

- Multiplayer rooms
- Public rooms without an access code
- Private rooms with a creator-defined access code
- Three to twelve questions per game
- Exactly four options per question
- Host-defined natural-language judging criterion
- Configurable timer from 10 to 60 seconds per question
- GenLayer consensus ranking for every option
- Scoring based on ranking accuracy and response speed
- Onchain leaderboard
- Privy authentication with email, Google, Discord, wallet, and guest access
- Independent display names for rooms and leaderboards
- Gasless game publishing through a server-side platform relayer
- One final batch submission per player

## Game Flow

1. A host signs in and selects a public or private room.
2. The host creates a game with 3–12 subjective questions.
3. Each question contains exactly four candidate answers.
4. The host defines the judging criterion and question timer.
5. The platform relayer publishes the game without requiring a wallet popup from the host.
6. GenLayer validators rank all four options for every question.
7. Players join with the room ID and, for private rooms, the creator-defined access code.
8. Players answer each question before the timer expires.
9. Answers are submitted in one final batch.
10. The contract calculates rank points, speed bonuses, and the final leaderboard.

## Deployed Contract

**Network:** GenLayer Studio Network / Studionet

**Verdict Rush V3:**

```text
0x16d3074b70a0B02Cd6E700e1403d2b5066437FE3
```

## Architecture

### Intelligent Contract

`contracts/verdict_rush_v3.py`

The V3 contract handles:

- Game creation and AI consensus ranking
- Public and private room creation
- Access-tag verification for private rooms
- Player registration and room state
- Match start and answer submission
- Deterministic scoring
- Final leaderboard generation

### Frontend

`frontend/app/v2/page.tsx`

The frontend provides:

- Entry screen for creating or joining rooms
- Game builder
- Public/private room controls
- Multiplayer lobby and game flow
- Player answer interface
- Results and leaderboard

### Authentication

Privy is used for email, Google, Discord, wallet, and guest login. Authentication identity is kept separate from the public display name shown in the game.

### Gasless Publishing

`frontend/app/api/v2/relay/route.ts`

Game and room writes can be signed by a server-side GenLayer relayer. The user does not need to connect a wallet or approve a transaction. The relayer private key remains server-only and must never use a `NEXT_PUBLIC_` environment variable.

## Project Structure

```text
contracts/
  verdict_rush.py
  verdict_rush_v2.py
  verdict_rush_v3.py

deploy/
  deployScript.ts

frontend/
  app/
    api/v2/relay/route.ts
    v2/
      account-menu.tsx
      auth-wall.tsx
      layout.tsx
      page.tsx
      privy-provider.tsx
  lib/genlayer/client.ts
```

## Local Setup

### Requirements

- Node.js 20 or newer
- Python 3.12 or newer
- GenLayer CLI
- Access to GenLayer Studionet
- A Privy application
- A funded GenLayer relayer account for gasless writes

### Install Dependencies

```powershell
cd C:\Projects\verdict-rush-genlayer
npm.cmd install

cd frontend
npm.cmd install --legacy-peer-deps
```

### Environment Variables

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_PRIVY_APP_ID=<your-privy-app-id>
NEXT_PUBLIC_VERDICT_RUSH_V3_CONTRACT_ADDRESS=0x16d3074b70a0B02Cd6E700e1403d2b5066437FE3
VERDICT_RUSH_V3_CONTRACT_ADDRESS=0x16d3074b70a0B02Cd6E700e1403d2b5066437FE3
GENLAYER_RELAYER_PRIVATE_KEY=<server-only-private-key>
```

Never commit `.env.local` or the relayer private key.

### Run the Frontend

```powershell
cd C:\Projects\verdict-rush-genlayer\frontend
npm.cmd run dev
```

Open:

```text
http://localhost:3000/v2
```

### TypeScript and Production Build

```powershell
npm.cmd run lint
npx.cmd next build --webpack
```

### Contract Validation

```powershell
genlayer contract lint contracts\verdict_rush_v3.py
genlayer contract validate contracts\verdict_rush_v3.py
```

### Deploy the Contract

```powershell
cd C:\Projects\verdict-rush-genlayer
npx.cmd genlayer deploy --contract contracts\verdict_rush_v3.py
```

## Current Status

Verdict Rush V3 is deployed on Studionet and the source code includes the complete game-builder, authentication, gasless publishing, public/private room, multiplayer submission, scoring, and leaderboard architecture.

The next milestone is full public deployment and broader multiplayer testing across multiple browsers and devices.

## Repository

```text
https://github.com/Shahin021/verdict-rush-genlayer
```

## License

MIT
