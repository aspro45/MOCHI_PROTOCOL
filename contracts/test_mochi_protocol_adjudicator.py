import importlib.util
import sys
import types
import unittest
from pathlib import Path


class FakeTreeMap(dict):
    @classmethod
    def __class_getitem__(cls, _item):
        return cls


class FakeDynArray(list):
    @classmethod
    def __class_getitem__(cls, _item):
        return cls


class FakeReturn:
    def __init__(self, calldata):
        self.calldata = calldata


class FakePublic:
    def write(self, fn):
        return fn

    def view(self, fn):
        return fn


class FakeMessage:
    sender_address = "studio_sender"


def _prompt_tail(prompt, marker):
    index = prompt.find(marker)
    if index < 0:
        return ""
    return prompt[index + len(marker) :].strip().lower()


def _relevant_story_text(text):
    terms = (
        "restore",
        "restored",
        "repair",
        "reconnect",
        "consensus",
        "core",
        "intelligent layer",
        "validator",
        "validators",
        "mochi",
        "broken network",
        "protect",
        "completion",
        "defeating",
        "boss",
        "bosses",
        "route",
        "run",
    )
    return any(term in text for term in terms)


def _hostile_or_irrelevant(text):
    hostile_terms = ("destroy", "refuse", "hostile", "forever")
    nonsense_terms = ("pizza", "sleep", "hello hello")
    return any(term in text for term in hostile_terms + nonsense_terms)


def _mock_llm_response(prompt, response_format=None):
    if response_format != "json":
        raise AssertionError("Contract should request structured JSON output.")

    if "You are a GenLayer validator for Mochi Protocol." in prompt:
        return {
            "valid": True,
            "reason": "Leader judgment follows the criteria.",
        }

    if "Guardian oath:" in prompt:
        text = _prompt_tail(prompt, "Guardian oath:")
        accepted = _relevant_story_text(text) and not _hostile_or_irrelevant(text)
        return {
            "accepted": accepted,
            "score": 88 if accepted else 12,
            "reason": "Fits Mochi mission." if accepted else "Does not fit the mission.",
            "title": "Core Guardian" if accepted else "Rejected Oath",
        }

    if "Final message:" in prompt:
        text = _prompt_tail(prompt, "Final message:")
        accepted = _relevant_story_text(text) and not _hostile_or_irrelevant(text)
        return {
            "accepted": accepted,
            "score": 92 if accepted else 10,
            "reason": "Valid restoration ending." if accepted else "Ending rejects restoration.",
            "title": "Consensus Restored" if accepted else "Invalid Ending",
        }

    if "Run note:" in prompt:
        text = _prompt_tail(prompt, "Run note:")
        accepted = _relevant_story_text(text) and not _hostile_or_irrelevant(text)
        return {
            "accepted": accepted,
            "score": 90 if accepted else 9,
            "reason": "Run note matches completion." if accepted else "Run note is unrelated.",
            "rankEligible": accepted,
            "title": "Ranked Core Run" if accepted else "Unranked Run",
        }

    raise AssertionError("Unexpected LLM prompt.")


class FakeNondet:
    def exec_prompt(self, prompt, response_format=None):
        return _mock_llm_response(prompt, response_format)


class FakeVM:
    Return = FakeReturn

    def run_nondet_unsafe(self, leader_fn, validator_fn):
        result = leader_fn()
        wrapped = FakeReturn(result)
        if not validator_fn(wrapped):
            raise AssertionError(f"Invalid nondeterministic result shape: {result!r}")
        return result


class FakeGl:
    Contract = object
    public = FakePublic()
    vm = FakeVM()
    nondet = FakeNondet()
    message = FakeMessage()


def _install_fake_genlayer():
    fake_module = types.ModuleType("genlayer")
    fake_module.gl = FakeGl()
    fake_module.TreeMap = FakeTreeMap
    fake_module.DynArray = FakeDynArray
    fake_module.u32 = int
    fake_module.allow_storage = lambda cls: cls
    sys.modules["genlayer"] = fake_module
    return fake_module.gl


FAKE_GL = _install_fake_genlayer()


def _load_contract_module():
    contract_path = Path(__file__).with_name("MochiProtocolAdjudicator.py")
    spec = importlib.util.spec_from_file_location(
        "mochi_protocol_adjudicator_under_test", contract_path
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


CONTRACT_MODULE = _load_contract_module()


def _make_contract(sender="studio_sender"):
    FAKE_GL.message.sender_address = sender
    contract = CONTRACT_MODULE.MochiProtocolAdjudicator()
    contract.guardian_oaths = FakeTreeMap()
    contract.final_decisions = FakeTreeMap()
    contract.weekly_runs = FakeDynArray()
    contract.player_best_weekly_runs = FakeTreeMap()
    contract.player_passports = FakeTreeMap()
    return contract


COMPLETE_PROGRESS = {
    "dashUnlocked": True,
    "doubleJumpUnlocked": True,
    "scrapHoundDefeated": True,
    "reactorTitanDefeated": True,
    "coreRestored": True,
}


INCOMPLETE_PROGRESS = {
    "dashUnlocked": True,
    "doubleJumpUnlocked": False,
    "scrapHoundDefeated": True,
    "reactorTitanDefeated": False,
    "coreRestored": True,
}


def _run_data(**overrides):
    data = {
        "completionTimeSeconds": 462.18,
        "dashUnlocked": True,
        "doubleJumpUnlocked": True,
        "scrapHoundDefeated": True,
        "reactorTitanDefeated": True,
        "coreRestored": True,
        "weekId": "2026-W25",
        "playerName": "aspro",
        "runNote": "Clean run, restored the Core after defeating both bosses.",
    }
    data.update(overrides)
    return data


class MochiProtocolAdjudicatorTests(unittest.TestCase):
    def assert_common_result(self, result, category):
        self.assertIsInstance(result.get("accepted"), bool)
        self.assertIsInstance(result.get("score"), int)
        self.assertGreaterEqual(result["score"], 0)
        self.assertLessEqual(result["score"], 100)
        self.assertEqual(result.get("category"), category)
        self.assertIsInstance(result.get("reason"), str)
        self.assertGreater(len(result["reason"]), 0)
        self.assertLessEqual(
            len(result["reason"]), CONTRACT_MODULE.MAX_REASON_CHARS
        )

    def assert_titled_result(self, result, category):
        self.assert_common_result(result, category)
        self.assertIsInstance(result.get("title"), str)
        self.assertGreater(len(result["title"]), 0)
        self.assertLessEqual(len(result["title"]), CONTRACT_MODULE.MAX_TITLE_CHARS)

    def assert_weekly_result(self, result):
        self.assert_titled_result(result, "weekly_speedrun")
        self.assertIsInstance(result.get("rankEligible"), bool)

    def test_01_guardian_oath_accepted(self):
        contract = _make_contract()
        result = contract.submit_guardian_oath(
            "I will restore the Intelligent Layer and reconnect consensus."
        )
        self.assert_titled_result(result, "guardian_oath")
        self.assertTrue(result["accepted"])

    def test_00_contract_info(self):
        contract = _make_contract()
        result = contract.get_contract_info()
        self.assertEqual(result["name"], "MochiProtocolAdjudicator")
        self.assertTrue(result["usesIntelligentJudgment"])
        self.assertIn("guardian_oath", result["features"])
        self.assertIn("final_decision", result["features"])
        self.assertIn("weekly_speedrun", result["features"])
        self.assertIn("weekly_leaderboard", result["features"])
        self.assertIn("player_passport", result["features"])
        self.assertIn("passport_achievements", result["features"])

    def test_02_guardian_oath_rejected_nonsense(self):
        contract = _make_contract()
        result = contract.submit_guardian_oath("pizza time")
        self.assert_titled_result(result, "guardian_oath")
        self.assertFalse(result["accepted"])

    def test_03_guardian_oath_rejected_hostile(self):
        contract = _make_contract()
        result = contract.submit_guardian_oath("I want to destroy the Core forever.")
        self.assert_titled_result(result, "guardian_oath")
        self.assertFalse(result["accepted"])

    def test_04_final_decision_accepted(self):
        contract = _make_contract()
        result = contract.submit_final_decision(
            COMPLETE_PROGRESS,
            "The Core is restored and consensus is reconnected.",
        )
        self.assert_titled_result(result, "final_decision")
        self.assertTrue(result["accepted"])

    def test_05_final_decision_rejected_incomplete_progress(self):
        contract = _make_contract()
        result = contract.submit_final_decision(
            INCOMPLETE_PROGRESS,
            "The Core is restored.",
        )
        self.assert_titled_result(result, "final_decision")
        self.assertFalse(result["accepted"])

    def test_06_final_decision_rejected_hostile_message(self):
        contract = _make_contract()
        result = contract.submit_final_decision(
            COMPLETE_PROGRESS,
            "I refuse to restore anything.",
        )
        self.assert_titled_result(result, "final_decision")
        self.assertFalse(result["accepted"])

    def test_07_weekly_run_accepted(self):
        contract = _make_contract()
        result = contract.submit_weekly_run(_run_data())
        self.assert_weekly_result(result)
        self.assertTrue(result["accepted"])
        self.assertTrue(result["rankEligible"])

    def test_08_weekly_run_rejected_incomplete_progress(self):
        contract = _make_contract()
        result = contract.submit_weekly_run(
            _run_data(
                completionTimeSeconds=300,
                doubleJumpUnlocked=False,
                reactorTitanDefeated=False,
                playerName="runner",
                runNote="finished",
            )
        )
        self.assert_weekly_result(result)
        self.assertFalse(result["accepted"] and result["rankEligible"])

    def test_09_weekly_run_rejected_invalid_time(self):
        contract = _make_contract()
        result = contract.submit_weekly_run(
            _run_data(
                completionTimeSeconds=0,
                playerName="runner",
                runNote="Core restored.",
            )
        )
        self.assert_weekly_result(result)
        self.assertFalse(result["accepted"])

    def test_10_weekly_run_rejected_irrelevant_note(self):
        contract = _make_contract()
        result = contract.submit_weekly_run(
            _run_data(
                completionTimeSeconds=420.50,
                playerName="runner",
                runNote="buy pizza and sleep",
            )
        )
        self.assert_weekly_result(result)
        self.assertFalse(result["accepted"] and result["rankEligible"])

    def test_11_leaderboard_and_player_record(self):
        contract = _make_contract("0xA")

        FAKE_GL.message.sender_address = "0xA"
        first = contract.submit_weekly_run(
            _run_data(completionTimeSeconds=462.18, playerName="aspro")
        )
        self.assertTrue(first["accepted"])

        FAKE_GL.message.sender_address = "0xB"
        second = contract.submit_weekly_run(
            _run_data(
                completionTimeSeconds=410.25,
                playerName="runner_b",
                runNote="Faster route, both bosses defeated and the Core restored.",
            )
        )
        self.assertTrue(second["accepted"])

        FAKE_GL.message.sender_address = "0xC"
        third = contract.submit_weekly_run(
            _run_data(
                completionTimeSeconds=520.50,
                playerName="runner_c",
                runNote="Complete route with Dash, Double Jump, and Core restored.",
            )
        )
        self.assertTrue(third["accepted"])

        FAKE_GL.message.sender_address = "0xD"
        rejected = contract.submit_weekly_run(
            _run_data(
                completionTimeSeconds=399,
                doubleJumpUnlocked=False,
                reactorTitanDefeated=False,
                playerName="runner_d",
                runNote="finished",
            )
        )
        self.assertFalse(rejected["accepted"] and rejected["rankEligible"])

        leaderboard = contract.get_weekly_leaderboard("2026-W25")
        self.assertEqual([entry["completionTimeCentiseconds"] for entry in leaderboard], [
            41025,
            46218,
            52050,
        ])
        self.assertEqual([entry["completionTimeSeconds"] for entry in leaderboard], [
            "410.25",
            "462.18",
            "520.50",
        ])
        for entry in leaderboard:
            self.assertTrue(entry["accepted"])
            self.assertTrue(entry["rankEligible"])
            self.assert_common_result(entry, "weekly_speedrun")

        FAKE_GL.message.sender_address = "0xA"
        better = contract.submit_weekly_run(
            _run_data(
                completionTimeSeconds=430.0,
                playerName="aspro",
                runNote="Cleaner route, restored the Core after both bosses.",
            )
        )
        self.assertTrue(better["accepted"])

        leaderboard = contract.get_weekly_leaderboard("2026-W25")
        self.assertEqual([entry["player"] for entry in leaderboard], ["0xB", "0xA", "0xC"])
        self.assertEqual([entry["completionTimeCentiseconds"] for entry in leaderboard], [
            41025,
            43000,
            52050,
        ])
        self.assertEqual(len([entry for entry in leaderboard if entry["player"] == "0xA"]), 1)

        worse = contract.submit_weekly_run(
            _run_data(
                completionTimeSeconds=480.0,
                playerName="aspro",
                runNote="Completed again after restoring the Core.",
            )
        )
        self.assertTrue(worse["accepted"])

        leaderboard = contract.get_weekly_leaderboard("2026-W25")
        self.assertEqual([entry["completionTimeCentiseconds"] for entry in leaderboard], [
            41025,
            43000,
            52050,
        ])
        self.assertEqual(len([entry for entry in leaderboard if entry["player"] == "0xA"]), 1)

        best = contract.get_player_best_run("0xA", "2026-W25")
        self.assertEqual(best["completionTimeCentiseconds"], 43000)
        self.assertEqual(best["completionTimeSeconds"], "430.00")
        self.assertTrue(best["accepted"])
        self.assertTrue(best["rankEligible"])

        contract.submit_guardian_oath(
            "Mochi will protect the Core and repair the broken network."
        )
        contract.submit_final_decision(
            COMPLETE_PROGRESS,
            "The Core is restored and consensus is reconnected.",
        )
        record = contract.get_player_record("0xA")
        self.assertEqual(record["player"], "0xA")
        self.assertEqual(record["guardianOath"]["category"], "guardian_oath")
        self.assertEqual(record["finalDecision"]["category"], "final_decision")
        self.assertEqual(len(record["bestWeeklyRuns"]), 1)
        self.assertEqual(record["bestWeeklyRuns"][0]["completionTimeCentiseconds"], 43000)
        self.assertEqual(record["bestWeeklyRuns"][0]["completionTimeSeconds"], "430.00")
        self.assertEqual(record["passport"]["passportTitle"], "Consensus Runner")
        self.assertEqual(record["passport"]["totalAcceptedJudgments"], 3)

        passport = contract.get_public_player_passport("0xA")
        self.assertTrue(passport["exists"])
        self.assertEqual(passport["player"], "0xA")
        self.assertEqual(passport["displayName"], "aspro")
        self.assertEqual(passport["passportTitle"], "Consensus Runner")
        self.assertTrue(passport["guardianOathAccepted"])
        self.assertTrue(passport["finalDecisionAccepted"])
        self.assertTrue(passport["hasRankedRun"])
        self.assertEqual(passport["bestWeekId"], "2026-W25")
        self.assertEqual(passport["bestCompletionTimeCentiseconds"], 43000)
        self.assertEqual(passport["bestCompletionTimeSeconds"], "430.00")
        self.assertEqual(passport["guardianOath"]["category"], "guardian_oath")
        self.assertEqual(passport["finalDecision"]["category"], "final_decision")
        self.assertEqual(passport["bestWeeklyRun"]["category"], "weekly_speedrun")
        achievements = {entry["id"]: entry["unlocked"] for entry in passport["achievements"]}
        self.assertTrue(achievements["core_guardian"])
        self.assertTrue(achievements["boss_signal_restored"])
        self.assertTrue(achievements["consensus_runner"])

    def test_12_public_player_passport_empty(self):
        contract = _make_contract()
        passport = contract.get_public_player_passport("0xNOPE")
        self.assertFalse(passport["exists"])
        self.assertEqual(passport["player"], "0xNOPE")
        self.assertEqual(passport["passportTitle"], "No Passport Yet")
        self.assertEqual(passport["guardianOath"], {})
        self.assertEqual(passport["finalDecision"], {})
        self.assertEqual(passport["bestWeeklyRun"], {})
        self.assertFalse(any(entry["unlocked"] for entry in passport["achievements"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
