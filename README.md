# Sample GenLayer project
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/license/mit/)
[![Discord](https://img.shields.io/badge/Discord-Join%20us-5865F2?logo=discord&logoColor=white)](https://discord.gg/8Jm4v89VAu)
[![Telegram](https://img.shields.io/badge/Telegram--T.svg?style=social&logo=telegram)](https://t.me/genlayer)
[![Twitter](https://img.shields.io/twitter/url/https/twitter.com/yeagerai.svg?style=social&label=Follow%20%40GenLayer)](https://x.com/GenLayer)
[![GitHub star chart](https://img.shields.io/github/stars/yeagerai/genlayer-project-boilerplate?style=social)](https://star-history.com/#yeagerai/genlayer-js)

## About
This project includes the boilerplate code for a GenLayer use case implementation, specifically a football bets game.

## What's included
- An example intelligent contract (Football Bets) with web access and LLM integration
- **Direct mode tests** — fast, in-memory unit tests with web/LLM mocking (~ms per test)
- **Integration tests** — full end-to-end tests against GenLayer Studio
- **Contract linting** — static analysis to catch common contract issues before deployment
- **CI pipeline** — GitHub Actions workflow for linting and direct tests
- A production-ready Next.js 15 frontend with TypeScript, TanStack Query, and Radix UI
- Configuration file template and deployment scripts

## Requirements
- Python >= 3.12
- [GenLayer CLI](https://github.com/genlayerlabs/genlayer-cli) globally installed: `npm install -g genlayer`
- GenLayer Studio (for integration tests and deployment): Install from [Docs](https://docs.genlayer.com/developers/intelligent-contracts/tooling-setup#using-the-genlayer-studio) or use the hosted [GenLayer Studio](https://studio.genlayer.com/)

## Project Structure

```
contracts/              # Python intelligent contracts
tests/
  direct/               # Fast in-memory tests (no Studio required)
    test_create_bet.py   # Bet creation logic
    test_resolve_bet.py  # Bet resolution with web/LLM mocks
    test_views.py        # Read-only view methods
  integration/           # Full tests against GenLayer Studio
    test_football_bets.py
    fixtures.py          # Expected state fixtures
frontend/               # Next.js 15 app (TypeScript, TanStack Query, Radix UI)
deploy/                 # TypeScript deployment scripts
gltest.config.yaml      # Test runner network configuration
pyproject.toml          # Python/pytest configuration
.github/workflows/      # CI pipeline
```

## Quick Start

### 1. Set up Python environment

```shell
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Lint your contracts

Run the GenVM linter to catch issues before deployment:

```shell
genvm-lint check contracts/football_bets.py
```

The linter catches:
- Forbidden imports and non-deterministic calls
- Invalid storage types (must use `TreeMap`, `DynArray`, `u256`, etc.)
- Missing decorators and return type annotations
- Non-deterministic operations outside equivalence principle blocks
- And [20+ other rules](https://github.com/genlayerlabs/genvm-linter)

### 3. Run direct mode tests

Direct mode tests run contracts in-memory without needing GenLayer Studio. They use mocks for web requests and LLM calls, giving you fast feedback (~milliseconds per test):

```shell
pytest tests/direct/ -v
```

Direct mode features used in these tests:
- `direct_deploy("contracts/file.py")` — deploy contract in memory
- `direct_vm.sender = address` — set transaction sender
- `direct_vm.mock_web(pattern, response)` — mock HTTP/render calls
- `direct_vm.mock_llm(pattern, response)` — mock LLM responses
- `direct_vm.expect_revert("message")` — assert expected failures
- `direct_vm.clear_mocks()` — reset mocks between calls

### 4. Deploy the contract

1. Choose your network: `genlayer network`
2. Deploy: `genlayer deploy` (runs the script in `/deploy/deployScript.ts`)

### 5. Run integration tests

Integration tests deploy the contract to GenLayer Studio and test with real consensus:

```shell
gltest tests/integration/ -v -s
```

These require GenLayer Studio running (local or hosted).

### 6. Set up the frontend

1. Copy `frontend/.env.example` to `frontend/.env`
2. Add your deployed contract address as `NEXT_PUBLIC_CONTRACT_ADDRESS`
3. Run:

```shell
cd frontend
npm install
npm run dev
```

The app will be available at http://localhost:3000/.

## How the Football Bets Contract Works

1. **Creating Bets**: Users bet on a football match by providing the game date, teams, and predicted winner.
2. **Resolving Bets**: After the match, the contract fetches results from BBC Sport, uses an LLM to extract the score, and validates via the equivalence principle.
3. **Points**: Correct predictions earn points. Users can query their points or the leaderboard.

## Testing Strategy

| Test Type | Command | Speed | Requires Studio |
|-----------|---------|-------|-----------------|
| **Lint** | `genvm-lint check contracts/*.py` | ~250ms | No |
| **Direct** | `pytest tests/direct/ -v` | ~ms/test | No |
| **Integration** | `gltest tests/integration/ -v -s` | ~min/test | Yes |

**Recommended workflow:**
1. Lint after every contract change
2. Run direct tests frequently during development
3. Run integration tests before deployment to verify consensus behavior

For AI coding agents (Claude Code, Cursor, etc.), the linter and direct tests provide the fast feedback loop needed for iterative development without requiring a running Studio instance.

## Community
- **[Discord](https://discord.gg/8Jm4v89VAu)**: Discussions, support, and announcements
- **[Telegram](https://t.me/genlayer)**: Informal chats and quick updates

## Documentation
For detailed information, see our [documentation](https://docs.genlayer.com/).

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.


## Verdict Rush V2 — Game Builder

V2 turns Verdict Rush from one fixed writing game into a configurable
"Predict the Consensus" platform.

### V2 flow

1. A host chooses a display name and creates a game.
2. The host selects 3–12 subjective questions, four options per question,
   the judging criterion and the timer (10–60 seconds).
3. The GenLayer Intelligent Contract ranks all four options for every
   question through Optimistic Democracy.
4. Players answer quickly without needing a wallet.
5. The host or relayer submits each player's complete answer set in one
   final batch transaction.
6. The contract calculates deterministic rank points, speed bonuses and
   the final leaderboard from the consensus verdict.

### Identity model

Wallet, Discord, email and guest identities are kept separate from the
public display name. Only the display name is shown in the room and
leaderboard. The current V2 prototype includes the identity-selection
and display-name layer; production Discord/email OAuth requires provider
credentials during deployment.

### V2 files

- `contracts/verdict_rush_v2.py`
- `frontend/app/v2/page.tsx`

### V2 environment variable

```env
NEXT_PUBLIC_VERDICT_RUSH_V2_CONTRACT_ADDRESS=<deployed-v2-address>
```


## Verdict Rush V3 — Real Rooms and Gasless Play

V3 completes the multiplayer flow:

- A host creates 3–12 subjective four-option questions and a 10–60 second timer.
- A dedicated server-side GenLayer relayer publishes the game, so the host does not sign a wallet transaction.
- The contract creates a persistent room with a shareable room URL.
- Up to 25 authenticated or guest players join the same room.
- The host starts the room and every client follows the shared on-chain room state.
- Each player submits one final answer set through the relayer.
- The Intelligent Contract calculates rank points and speed bonuses, then stores a live room leaderboard.

### V3 environment variables

```env
NEXT_PUBLIC_VERDICT_RUSH_V3_CONTRACT_ADDRESS=<deployed-v3-address>
VERDICT_RUSH_V3_CONTRACT_ADDRESS=<deployed-v3-address>
GENLAYER_RELAYER_PRIVATE_KEY=<fresh-dedicated-relayer-private-key>
```

`GENLAYER_RELAYER_PRIVATE_KEY` must belong to a fresh dedicated development wallet. Never use a personal wallet or commit this value to Git.

### V3 files

- `contracts/verdict_rush_v3.py`
- `frontend/app/api/v2/relay/route.ts`
- `frontend/app/v2/page.tsx`

