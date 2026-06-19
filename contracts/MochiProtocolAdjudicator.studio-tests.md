# MochiProtocolAdjudicator - GenLayer Studio Test Cases

Contract file:

`contracts/MochiProtocolAdjudicator.py`

Scope:

- Contract tests only.
- No Unity code.
- No frontend code.
- No wallet UI.
- No leaderboard UI.

## Deploy

1. Open GenLayer Studio.
2. Create or import an Intelligent Contract.
3. Paste or upload `MochiProtocolAdjudicator.py`.
4. Deploy with no constructor arguments.

## Common Result Assertions

Every write-method result must have:

```json
{
  "accepted": "bool",
  "score": "integer 0-100",
  "category": "fixed string",
  "reason": "short string"
}
```

For all tests:

- `accepted` must be a boolean.
- `score` must be between `0` and `100`.
- `category` must match the method category exactly.
- `reason` must be present and short.
- `title` must be present and short.
- For weekly run tests only, `rankEligible` must be a boolean.
- The contract uses a second LLM validator pass to approve the leader judgment shape and story fit.

Natural-language `reason` and `title` can vary by model. Do not assert exact reason/title text.

## get_contract_info

Call:

```python
get_contract_info()
```

Expected:

- `name == "MochiProtocolAdjudicator"`
- `usesIntelligentJudgment == true`
- `features` includes `guardian_oath`, `final_decision`, `weekly_speedrun`, and `weekly_leaderboard`

## submit_guardian_oath

Category assertion:

```json
"category": "guardian_oath"
```

### Accepted Case 1

Call:

```python
submit_guardian_oath(
    "I will restore the Intelligent Layer and reconnect consensus."
)
```

Expected:

- `accepted == true`
- `category == "guardian_oath"`
- `0 <= score <= 100`
- `reason` is short

### Accepted Case 2

Call:

```python
submit_guardian_oath(
    "Mochi will protect the Core and repair the broken network."
)
```

Expected:

- `accepted == true`
- `category == "guardian_oath"`
- `0 <= score <= 100`
- `reason` is short

### Accepted Case 3

Call:

```python
submit_guardian_oath(
    "I enter the Broken Core to bring the validators back into agreement."
)
```

Expected:

- `accepted == true`
- `category == "guardian_oath"`
- `0 <= score <= 100`
- `reason` is short

### Rejected Case 1

Call:

```python
submit_guardian_oath("pizza time")
```

Expected:

- `accepted == false`
- `category == "guardian_oath"`
- `0 <= score <= 100`
- `reason` is short

### Rejected Case 2

Call:

```python
submit_guardian_oath("I want to destroy the Core forever.")
```

Expected:

- `accepted == false`
- `category == "guardian_oath"`
- `0 <= score <= 100`
- `reason` is short

### Rejected Case 3

Call:

```python
submit_guardian_oath("hello hello hello")
```

Expected:

- `accepted == false`
- `category == "guardian_oath"`
- `0 <= score <= 100`
- `reason` is short

## submit_final_decision

Category assertion:

```json
"category": "final_decision"
```

### Accepted Case

Call:

```python
submit_final_decision(
    {
        "dashUnlocked": True,
        "doubleJumpUnlocked": True,
        "scrapHoundDefeated": True,
        "reactorTitanDefeated": True,
        "coreRestored": True,
    },
    "The Core is restored and consensus is reconnected."
)
```

Expected:

- `accepted == true`
- `category == "final_decision"`
- `0 <= score <= 100`
- `reason` is short

### Rejected Case - Incomplete Progress

Call:

```python
submit_final_decision(
    {
        "dashUnlocked": True,
        "doubleJumpUnlocked": False,
        "scrapHoundDefeated": True,
        "reactorTitanDefeated": False,
        "coreRestored": True,
    },
    "The Core is restored."
)
```

Expected:

- `accepted == false`
- `category == "final_decision"`
- `0 <= score <= 100`
- `reason` is short

### Rejected Case - Hostile Message

Call:

```python
submit_final_decision(
    {
        "dashUnlocked": True,
        "doubleJumpUnlocked": True,
        "scrapHoundDefeated": True,
        "reactorTitanDefeated": True,
        "coreRestored": True,
    },
    "I refuse to restore anything."
)
```

Expected:

- `accepted == false`
- `category == "final_decision"`
- `0 <= score <= 100`
- `reason` is short

## submit_weekly_run

Category assertion:

```json
"category": "weekly_speedrun"
```

### Accepted Case

Call:

```python
submit_weekly_run(
    {
        "completionTimeSeconds": 462.18,
        "dashUnlocked": True,
        "doubleJumpUnlocked": True,
        "scrapHoundDefeated": True,
        "reactorTitanDefeated": True,
        "coreRestored": True,
        "weekId": "2026-W25",
        "playerName": "aspro",
        "runNote": "Clean run, restored the Core after defeating both bosses."
    }
)
```

Expected:

- `accepted == true`
- `rankEligible == true`
- `category == "weekly_speedrun"`
- `0 <= score <= 100`
- `reason` is short

### Rejected Case - Incomplete Progress

Call:

```python
submit_weekly_run(
    {
        "completionTimeSeconds": 300.00,
        "dashUnlocked": True,
        "doubleJumpUnlocked": False,
        "scrapHoundDefeated": True,
        "reactorTitanDefeated": False,
        "coreRestored": True,
        "weekId": "2026-W25",
        "playerName": "runner",
        "runNote": "finished"
    }
)
```

Expected:

- `accepted == false`
- `rankEligible == false`
- `category == "weekly_speedrun"`
- `0 <= score <= 100`
- `reason` is short

### Rejected Case - Invalid Time

Call:

```python
submit_weekly_run(
    {
        "completionTimeSeconds": 0,
        "dashUnlocked": True,
        "doubleJumpUnlocked": True,
        "scrapHoundDefeated": True,
        "reactorTitanDefeated": True,
        "coreRestored": True,
        "weekId": "2026-W25",
        "playerName": "runner",
        "runNote": "Core restored."
    }
)
```

Expected:

- `accepted == false`
- `rankEligible == false`
- `category == "weekly_speedrun"`
- `0 <= score <= 100`
- `reason` is short

### Rejected Case - Irrelevant Note

Call:

```python
submit_weekly_run(
    {
        "completionTimeSeconds": 420.50,
        "dashUnlocked": True,
        "doubleJumpUnlocked": True,
        "scrapHoundDefeated": True,
        "reactorTitanDefeated": True,
        "coreRestored": True,
        "weekId": "2026-W25",
        "playerName": "runner",
        "runNote": "buy pizza and sleep"
    }
)
```

Expected:

- `accepted == false` or `rankEligible == false`
- `category == "weekly_speedrun"`
- `0 <= score <= 100`
- `reason` is short

## Leaderboard Storage And Sorting

Run these after deployment in this order.

### Accepted Run A

```python
submit_weekly_run(
    {
        "completionTimeSeconds": 462.18,
        "dashUnlocked": True,
        "doubleJumpUnlocked": True,
        "scrapHoundDefeated": True,
        "reactorTitanDefeated": True,
        "coreRestored": True,
        "weekId": "2026-W25",
        "playerName": "aspro",
        "runNote": "Clean run, restored the Core after defeating both bosses."
    }
)
```

Expected:

- `accepted == true`
- `rankEligible == true`

### Accepted Run B - Faster

```python
submit_weekly_run(
    {
        "completionTimeSeconds": 410.25,
        "dashUnlocked": True,
        "doubleJumpUnlocked": True,
        "scrapHoundDefeated": True,
        "reactorTitanDefeated": True,
        "coreRestored": True,
        "weekId": "2026-W25",
        "playerName": "aspro",
        "runNote": "Faster route, both bosses defeated and the Core restored."
    }
)
```

Expected:

- `accepted == true`
- `rankEligible == true`

### Rejected Run C - Should Not Rank

```python
submit_weekly_run(
    {
        "completionTimeSeconds": 399.00,
        "dashUnlocked": True,
        "doubleJumpUnlocked": False,
        "scrapHoundDefeated": True,
        "reactorTitanDefeated": False,
        "coreRestored": True,
        "weekId": "2026-W25",
        "playerName": "runner",
        "runNote": "finished"
    }
)
```

Expected:

- `accepted == false`
- `rankEligible == false`
- This run must not appear in the ranked leaderboard.

### Read Leaderboard

Call:

```python
get_weekly_leaderboard("2026-W25")
```

Expected:

- Every returned entry has `accepted == true`.
- Every returned entry has `rankEligible == true`.
- Rejected Run C is not present.
- Entries are sorted fastest first.
- If both accepted runs came from the same sender, the returned list can contain both accepted entries, with `410.25` before `462.18`.
- Returned leaderboard entries should use calldata-safe time fields: `completionTimeSeconds` as a string such as `"410.25"` and `completionTimeCentiseconds` as an integer such as `41025`.

### Read Player Best Run

Use the sender key visible in Studio if available. If Studio does not expose a sender, use:

```python
get_player_best_run("studio_sender", "2026-W25")
```

Expected:

- Returned entry is accepted.
- Returned entry is rank eligible.
- `completionTimeSeconds == "410.25"` and `completionTimeCentiseconds == 41025` after Accepted Run A and Accepted Run B are both submitted by the same sender.
- `weekId == "2026-W25"`.

### Read Player Record

Call:

```python
get_player_record("studio_sender")
```

Expected:

- `player == "studio_sender"` when no Studio sender address is available.
- `bestWeeklyRuns` contains the best accepted rank-eligible run for `2026-W25`.
- Rejected weekly runs do not appear in `bestWeeklyRuns`.

## Pass Criteria Summary

The Studio test pass is valid when:

- All guardian oath accepted examples return `accepted == true`.
- All guardian oath rejected examples return `accepted == false`.
- The final decision accepted example returns `accepted == true`.
- The final decision rejected examples return `accepted == false`.
- The valid weekly run returns `accepted == true` and `rankEligible == true`.
- Invalid weekly runs return `accepted == false` or `rankEligible == false`.
- `get_weekly_leaderboard("2026-W25")` returns only accepted rank-eligible entries.
- Leaderboard entries are sorted by fastest `completionTimeCentiseconds`, then higher `score` if times tie.
- `get_player_best_run(player, "2026-W25")` returns the fastest accepted rank-eligible run for that player/week.
