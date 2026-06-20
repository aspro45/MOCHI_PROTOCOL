# MochiProtocolAdjudicator

GenLayer Intelligent Contract for Mochi Protocol player-signed records.

## Purpose

The contract adjudicates three player record paths:

1. Guardian Oath
2. Final Decision
3. Weekly Speedrun

It uses GenLayer LLM judgment for natural-language decisions, stores accepted records, and builds a public Mochi Player Passport from those records. Gameplay stays local.

## Contract Address

Bradbury:

```text
0x27607E65Ec5B0Db9a87bAfCc816E1C112ff48A41
```

Deploy transaction:

```text
https://explorer-bradbury.genlayer.com/tx/0xb65357735bee1ca393dbe7553c9cd01d8f63cd1cee2b16addca2e7e9311add7e
```

## Methods

### submit_guardian_oath(oath_message)

Returns:

```json
{
  "accepted": true,
  "score": 88,
  "category": "guardian_oath",
  "reason": "Oath aligns with Mochi's mission.",
  "title": "Core Guardian"
}
```

### submit_final_decision(progress_data, final_message)

Requires all completion flags true:

```json
{
  "dashUnlocked": true,
  "doubleJumpUnlocked": true,
  "scrapHoundDefeated": true,
  "reactorTitanDefeated": true,
  "coreRestored": true
}
```

### submit_weekly_run(run_data)

Uses integer-safe timing. The frontend sends whole seconds plus centiseconds to avoid calldata float issues.

```json
{
  "completionTimeSeconds": 731,
  "completionTimeCentiseconds": 73192,
  "weekId": "WEEK-01",
  "playerName": "aspro",
  "runNote": "Clean run. Core restored after both bosses."
}
```

### get_weekly_leaderboard(week_id)

Returns accepted rank-eligible entries sorted by:

1. fastest completion time
2. highest score if tied

### get_player_best_run(player, week_id)

Returns the best accepted run for one player and week.

### get_player_record(player)

Returns the stored oath, final decision, and best weekly run for a player if available.

### get_public_player_passport(player)

Returns a public player identity record built from accepted submissions:

```json
{
  "player": "0x...",
  "exists": true,
  "displayName": "aspro",
  "passportTitle": "Consensus Runner",
  "guardianOathAccepted": true,
  "finalDecisionAccepted": true,
  "hasRankedRun": true,
  "totalAcceptedJudgments": 3,
  "bestWeekId": "WEEK-01",
  "bestCompletionTimeSeconds": "731.92",
  "achievements": [
    { "id": "core_guardian", "title": "Core Guardian", "unlocked": true },
    { "id": "boss_signal_restored", "title": "Boss Signal Restored", "unlocked": true },
    { "id": "consensus_runner", "title": "Consensus Runner", "unlocked": true }
  ]
}
```

## Validation Rules

The contract:

- clamps scores to 0..100
- keeps categories fixed
- limits message length
- limits reason/title length
- rejects invalid LLM JSON
- never compares full freeform LLM text
- avoids floating point calldata for leaderboard timing
- updates one best weekly run per player/week instead of ranking duplicate worse runs
- stores public passport achievement flags from accepted records

## Local Tests

```bash
python contracts/test_mochi_protocol_adjudicator.py
```

or from the repository root:

```bash
npm run contract:test
```

Current expected result:

```text
Ran 13 tests
OK
```
