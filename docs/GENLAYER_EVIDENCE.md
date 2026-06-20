# GenLayer Evidence Package

This document explains the onchain part of Mochi Protocol in the same clear style used by strong GenLayer repos: live address, why GenLayer is required, contract API, tests, and security boundaries.

## Live Contract

| Field | Value |
|---|---|
| Contract | MochiProtocolAdjudicator |
| Network | GenLayer Bradbury |
| Chain ID | 4221 |
| Address | `0x8808bfBABcE825FeADC6C287F1e8Fb3f58731ed9` |
| Deploy TX | https://explorer-bradbury.genlayer.com/tx/0x4118a69760990668a349d5471380ae9af4528a8446d56e20fd276a06894d55f6 |
| Source | `contracts/MochiProtocolAdjudicator.py` |
| Tests | `contracts/test_mochi_protocol_adjudicator.py` |

## Intelligent Contract Behavior

MochiProtocolAdjudicator is not a storage-only contract. It asks GenLayer validators to judge natural language and return structured JSON.

The contract demonstrates:

- natural-language interpretation
- story-context judgment
- accepted or rejected result
- numeric score from 0 to 100
- short reason
- short title
- rank eligibility for leaderboard entries
- deterministic validation around nondeterministic LLM output

The contract never controls gameplay. It only adjudicates optional records after local gameplay has already happened.

## Onchain Flows

### 1. Guardian Oath

Input:

```text
I will restore the Intelligent Layer and reconnect consensus.
```

Judgment:

- Is the oath short and clear?
- Does it fit Mochi's mission?
- Is it related to the Core, consensus, validators, Mochi, or the broken network?
- Is it hostile or nonsense?

Output category: `guardian_oath`

### 2. Final Decision

Input:

```json
{
  "dashUnlocked": true,
  "doubleJumpUnlocked": true,
  "scrapHoundDefeated": true,
  "reactorTitanDefeated": true,
  "coreRestored": true
}
```

Final message:

```text
The Core is restored and consensus is reconnected.
```

Judgment:

- All required local completion flags must be true.
- The message must fit the restoration ending.
- Hostile or irrelevant messages are rejected.

Output category: `final_decision`

### 3. Weekly Speedrun

Input:

```json
{
  "completionTimeSeconds": 731,
  "completionTimeCentiseconds": 73192,
  "dashUnlocked": true,
  "doubleJumpUnlocked": true,
  "scrapHoundDefeated": true,
  "reactorTitanDefeated": true,
  "coreRestored": true,
  "weekId": "WEEK-01",
  "playerName": "aspro",
  "runNote": "Clean run. Core restored after both bosses."
}
```

Judgment:

- Completion time must be in a reasonable demo range.
- Required progress flags must be complete.
- Player display name must be safe and short.
- Run note must describe the run, restoration, or completion.
- Accepted entries can become rank eligible.

Output category: `weekly_speedrun`

Leaderboard behavior:

- accepted entries only
- rankEligible entries only
- one best run per player per week
- fastest completion time first
- tie-breaker: higher score

## Unity And Website Bridge

```text
Unity completion UI
  -> OnchainBridge.cs
  -> GenLayerBridge.jslib
  -> window.mochiOnchain.submitWeeklyRun(runJson)
  -> Next.js wrapper
  -> RainbowKit browser wallet
  -> GenLayerJS write transaction
  -> MochiProtocolAdjudicator
  -> JSON result back to Unity
```

Callbacks:

```text
OnWalletConnected(address)
OnWalletDisconnected()
OnOathResult(json)
OnFinalDecisionResult(json)
OnWeeklyRunResult(json)
OnLeaderboardResult(json)
OnOnchainError(error)
```

## What Makes Mochi Different

Mochi Protocol combines a real Unity 2D demo with a GenLayer adjudication layer:

- The game is playable without a wallet.
- The onchain layer is optional and meaningful.
- The contract judges player-authored story text and speedrun notes.
- The leaderboard stores accepted, rank-eligible runs instead of blindly accepting every submit.
- The public repo avoids shipping private Unity art while still exposing the web/onchain integration.

## Test Command

```bash
npm run contract:test
```

Expected result:

```text
Ran 12 tests
OK
```

## Safety Checklist

- No private keys in repo.
- No `.env.local` committed.
- No server wallet.
- No gameplay state depends on wallet success.
- No Unity assets required in the public repo.
- Large Unity WebGL files live on R2/CDN.
