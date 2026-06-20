# Mochi Protocol

Playable Unity WebGL robot cat Metroidvania with an optional GenLayer Intelligent Contract layer.

Mochi is a tiny robot cat guardian inside a fractured Intelligent Layer. The validators stopped agreeing, the Core broke apart, and Mochi enters the Broken Core to restore consensus. Gameplay stays local and fast. GenLayer is used only where judgment matters: story submissions, final restoration decisions, and weekly speedrun eligibility.

## Live Evidence

| Item | Link |
|---|---|
| Website | Vercel deployment connected to this repository |
| Unity WebGL Build | Hosted externally on Cloudflare R2 because the `.data` file is too large for GitHub/Vercel limits |
| Network | GenLayer Bradbury testnet, chain id `4221` |
| Intelligent Contract | `MochiProtocolAdjudicator` at `0x27607E65Ec5B0Db9a87bAfCc816E1C112ff48A41` |
| Deploy Evidence | https://explorer-bradbury.genlayer.com/tx/0xb65357735bee1ca393dbe7553c9cd01d8f63cd1cee2b16addca2e7e9311add7e |
| Contract Source | `contracts/MochiProtocolAdjudicator.py` |
| Contract Tests | `contracts/test_mochi_protocol_adjudicator.py` |

## Why This Needs GenLayer

This project is not using a normal storage-only contract. The core onchain action is judgment:

- Does a Guardian Oath actually fit Mochi's mission?
- Does a Final Decision match the completed story state?
- Does a weekly speedrun submission look valid and rank eligible?

Those checks need natural-language interpretation, story-context reasoning, and structured decision output. A normal deterministic smart contract can store a score, but it cannot decide whether a message is relevant, hostile, nonsense, or mission-aligned. GenLayer validators can use LLM judgment and return a structured result that the app can display.

Every adjudication returns fixed JSON fields:

```json
{
  "accepted": true,
  "score": 88,
  "category": "weekly_speedrun",
  "reason": "Run note matches the completed restoration.",
  "title": "Core Restored",
  "rankEligible": true
}
```

## What Stays Local

Core gameplay is deliberately not onchain:

- movement
- jump, dash, double jump
- doors and keys
- checkpoints and save stations
- enemies and bosses
- traps and moving platforms
- health, energy, damage, and combat
- room layout and manual map art

The wallet is optional. The player can finish the demo without connecting a wallet.

## Architecture

```text
Unity WebGL game
  -> Unity JavaScript bridge
  -> Next.js website wrapper
  -> RainbowKit / wagmi browser wallet
  -> GenLayerJS
  -> MochiProtocolAdjudicator on Bradbury
```

Unity does not manage wallet secrets. All signing happens in the browser wallet popup.

## Contract API

| Method | Kind | Purpose |
|---|---|---|
| `submit_guardian_oath(oath_message)` | write | Judges whether a short oath fits Mochi's restoration mission. |
| `submit_final_decision(progress_data, final_message)` | write | Checks completed progress flags plus final restoration message. |
| `submit_weekly_run(run_data)` | write | Judges whether a weekly run is valid and rank eligible. Updates the player's best run for the week. |
| `get_weekly_leaderboard(week_id)` | view | Returns accepted, rank-eligible entries sorted by fastest time, then score. |
| `get_player_best_run(player, week_id)` | view | Returns the player's best accepted run for the week. |
| `get_player_record(player)` | view | Returns stored oath, final decision, and best run data for a player. |

See `contracts/README.md` and `docs/GENLAYER_EVIDENCE.md` for details.

## Repository Structure

```text
app/                         Next.js app and Unity WebGL wrapper
lib/                         GenLayerJS client, wallet bridge, Unity callbacks
contracts/                   GenLayer Intelligent Contract and tests
docs/                        Evidence package and architecture notes
deploy/                      Safe deployment notes for Bradbury
public/                      Website static assets, favicon, and Unity fallback folder
```

Unity source, game assets, and production art are intentionally not stored in this public repo.

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Build the website:

```bash
npm run build
```

Run the contract tests:

```bash
npm run contract:test
```

## Environment

```text
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=replace-with-walletconnect-project-id
NEXT_PUBLIC_UNITY_BUILD_BASE=https://pub-8eeae0f71eed47c698ccbf03daeb9f6d.r2.dev/Build
NEXT_PUBLIC_UNITY_STREAMING_ASSETS_BASE=https://pub-8eeae0f71eed47c698ccbf03daeb9f6d.r2.dev/StreamingAssets
NEXT_PUBLIC_UNITY_BUILD_NAME=MochiProtocol
NEXT_PUBLIC_MOCHI_DEMO_VIDEO_URL=
NEXT_PUBLIC_GENLAYER_CHAIN=bradbury
NEXT_PUBLIC_GENLAYER_RPC_URL=https://rpc-bradbury.genlayer.com
NEXT_PUBLIC_GENLAYER_CHAIN_ID=4221
NEXT_PUBLIC_MOCHI_ADJUDICATOR_ADDRESS=0x27607E65Ec5B0Db9a87bAfCc816E1C112ff48A41
NEXT_PUBLIC_GENLAYER_RECEIPT_STATUS=ACCEPTED
```

## Demo Video

The GenLayer section has a 16:9 video slot. Leave `NEXT_PUBLIC_MOCHI_DEMO_VIDEO_URL` empty to show the placeholder. When the video is ready, put the `.mp4` or `.webm` file in `public/site/` and set:

```text
NEXT_PUBLIC_MOCHI_DEMO_VIDEO_URL=/site/mochi-demo.mp4
```

For Vercel, use the same environment variable or commit the public video file if it is small enough for GitHub.

## Security Notes

- No private keys are committed.
- No server-side signing is used.
- Wallet signing happens only in the user's browser wallet.
- Unity build files are hosted outside GitHub to avoid committing large binary assets.
- Public repo contains code, contract, and web wrapper only.
- The game remains playable if wallet, RPC, or onchain submission fails.

## Deployment Notes

- Deploy the Next.js site to Vercel.
- Upload Unity WebGL files to R2 under `Build/`:
  - `MochiProtocol.loader.js`
  - `MochiProtocol.data`
  - `MochiProtocol.framework.js`
  - `MochiProtocol.wasm`
- Enable R2 public access and CORS for `GET` and `HEAD`.
- Set `NEXT_PUBLIC_UNITY_BUILD_BASE` in Vercel to the public R2 `Build` URL.
- Set `NEXT_PUBLIC_MOCHI_ADJUDICATOR_ADDRESS` to the live Bradbury contract address.
