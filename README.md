# Verdict Rush

Verdict Rush is a multiplayer **Predict the Consensus** game powered by GenLayer Intelligent Contracts and AI consensus.

Players do not search for one objectively correct answer. Instead, GenLayer validators rank four possible answers according to a natural language judging criterion, and players compete to predict that final consensus.

## Live Application

https://verdict-rush-genlayer.vercel.app/v2

## How It Works

1. A host signs in with Privy.
2. The host creates a game with 3 to 12 subjective questions.
3. Each question contains exactly four possible answers.
4. The host defines the judging criterion and timer.
5. The platform relayer publishes the game gaslessly on GenLayer.
6. GenLayer validators rank all four answers.
7. The host creates a public or private multiplayer room.
8. Players join and answer before the room deadline.
9. Server authoritative timing and room state are used for scoring.
10. A final leaderboard ranks all submitted players.

## Production Features

- Privy authentication
- Gasless game publishing
- GenLayer Intelligent Contract consensus
- Public multiplayer rooms
- Private rooms with creator defined access codes
- Three to twelve questions per game
- Four answers per question
- Configurable question timer
- Server authoritative room timing
- Redis backed multiplayer room state
- Ranking accuracy and response speed scoring
- Final multiplayer leaderboard
- Independent player display names
- Transaction retry handling for network backpressure
- Stable Back to Home navigation after results

## Reviewer Security Fixes

All requested security changes have been implemented:

- Relay and room API requests require a verified Privy session.
- Host and player identities are derived server side from the verified session.
- Client supplied player IDs are not trusted.
- Client timestamps cannot manipulate scoring.
- Room authority is checked before host actions.
- Replayed submissions are idempotent.
- The unsafe batch scoring entry point was removed.
- Security tests cover impersonation, room authority, timing manipulation, and replay behavior.

## Architecture

### GenLayer Intelligent Contract

Current contract source:

```text
contracts/verdict_rush_v5.py
```

The Intelligent Contract handles:

- Game creation
- Natural language judging criteria
- Validator consensus ranking
- Game configuration
- Consensus verdict storage
- Authorized relayer enforcement
- Secure submission behavior

### Hybrid Multiplayer Room Layer

Room state is managed through authenticated server APIs and Redis:

```text
frontend/app/api/v2/room/route.ts
frontend/app/api/v2/state/route.ts
frontend/lib/v5-room-model.ts
frontend/lib/v5-room-store.ts
frontend/lib/redis.ts
```

This layer handles:

- Public and private room creation
- Player registration
- Host authority
- Room start time and deadlines
- Answer submission
- Server authoritative scoring
- Final room leaderboard
- Concurrency locking and replay protection

### Authentication and Gasless Relay

```text
frontend/app/api/v2/relay/route.ts
```

Privy access tokens are verified server side. The authenticated Privy user ID is used as the internal player identity.

The GenLayer relayer private key remains server only and is used to publish games without requiring a wallet transaction or MetaMask popup from the host.

## Deployment

### Network

GenLayer Studio Network / Studionet

### Production Contract

```text
0xe001Be5A43081F620083f1bA6278254B238E7cc0
```

The application was also deployed and tested on Bradbury. Production was moved back to Studionet because slower transaction confirmation affected the live multiplayer experience.

### Production Application

https://verdict-rush-genlayer.vercel.app/v2

## Verification

The final production flow was successfully tested with four real accounts:

- Gasless game publishing
- Four player room participation
- Answer submission
- Final scoring
- Leaderboard generation
- Back to Home navigation

Automated verification:

```text
5 security tests passed
57 Verdict Rush project tests passed
Production build passed
TypeScript passed
```

## Technology

- GenLayer Intelligent Contracts
- Python
- GenLayer JS
- Next.js 16.2.11
- React 19
- TypeScript
- Privy
- Upstash Redis
- Vercel
- Viem

## Local Setup

### Requirements

- Node.js 20 or newer
- Python 3.12 or newer
- GenLayer development tools
- Privy application credentials
- Upstash Redis credentials
- Funded GenLayer relayer account

### Install Dependencies

From the project root:

```powershell
npm.cmd install
```

### Environment Variables

Create:

```text
frontend/.env.local
```

Required variables:

```text
NEXT_PUBLIC_PRIVY_APP_ID=<privy-app-id>
PRIVY_APP_ID=<privy-app-id>
PRIVY_APP_SECRET=<privy-app-secret>

GENLAYER_RELAYER_PRIVATE_KEY=<server-only-private-key>

NEXT_PUBLIC_VERDICT_RUSH_V4_CONTRACT_ADDRESS=0xe001Be5A43081F620083f1bA6278254B238E7cc0
VERDICT_RUSH_V4_CONTRACT_ADDRESS=0xe001Be5A43081F620083f1bA6278254B238E7cc0

ROOM_ACCESS_SECRET=<minimum-32-character-secret>

KV_REST_API_URL=<redis-rest-url>
KV_REST_API_TOKEN=<redis-rest-token>
```

The V4 environment variable names are retained for frontend compatibility while the current contract implementation is stored in `verdict_rush_v5.py`.

Never commit `.env.local`, Privy secrets, Redis tokens, or the relayer private key.

### Run Locally

```powershell
npm.cmd --prefix .\frontend run dev
```

Open:

```text
http://localhost:3000/v2
```

### Production Build

```powershell
npm.cmd --prefix .\frontend run build
```

### Security Tests

```powershell
python -m pytest .\tests\direct\test_verdict_rush_v4_security.py -q
```

### Verdict Rush Test Suite

The old Football Bets integration example is unrelated to Verdict Rush and requires an older testing API.

```powershell
python -m pytest -q --ignore=.\tests\integration
```

## Project Structure

```text
contracts/
  verdict_rush_v5.py

frontend/
  app/
    api/v2/
      relay/route.ts
      room/route.ts
      state/route.ts
      tx-status/route.ts
    v2/
      page.tsx
      auth-wall.tsx
      privy-provider.tsx
  lib/
    redis.ts
    v5-room-model.ts
    v5-room-store.ts

tests/
  direct/
    test_verdict_rush_v4_security.py
```

## Repository

https://github.com/Shahin021/verdict-rush-genlayer

## License

MIT