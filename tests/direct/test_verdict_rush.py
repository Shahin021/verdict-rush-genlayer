"""Direct tests for the Verdict Rush Intelligent Contract."""

import json


def _answers() -> str:
    return json.dumps(
        [
            {
                "player_id": "shahin",
                "answer": "A solar-powered umbrella that stores rainwater.",
            },
            {
                "player_id": "nova",
                "answer": "A pocket-sized cloud that follows its owner.",
            },
        ]
    )


def _verdict() -> dict:
    return {
        "ranking": [
            {
                "player_id": "shahin",
                "relevance": 38,
                "creativity": 27,
                "rule_compliance": 19,
                "clarity": 9,
                "score": 93,
                "reason": "Highly relevant, original, and clearly explained.",
            },
            {
                "player_id": "nova",
                "relevance": 34,
                "creativity": 25,
                "rule_compliance": 18,
                "clarity": 8,
                "score": 85,
                "reason": "Creative and clear, but slightly less practical.",
            },
        ],
        "winner_id": "shahin",
        "round_summary": "Shahin won with the strongest overall concept.",
    }


def test_judge_round_batch_stores_verdict_and_scores(
    direct_vm,
    direct_deploy,
    direct_alice,
):
    contract = direct_deploy("contracts/verdict_rush.py")
    direct_vm.sender = direct_alice

    direct_vm.mock_llm(r".*", json.dumps(_verdict()))

    result_json = contract.judge_round_batch(
        "room-alpha",
        1,
        1,
        "Invent a useful product that should not exist.",
        _answers(),
    )

    result = json.loads(result_json)

    assert result["winner_id"] == "shahin"
    assert result["ranking"][0]["score"] == 93
    assert result["ranking"][1]["score"] == 85

    stored = json.loads(
        contract.get_batch_verdict("room-alpha", 1, 1)
    )

    assert stored["winner_id"] == "shahin"
    assert contract.get_player_score("room-alpha", "shahin") == 93
    assert contract.get_player_score("room-alpha", "nova") == 85
    assert contract.get_total_batches() == 1


def test_duplicate_batch_fails(
    direct_vm,
    direct_deploy,
    direct_alice,
):
    contract = direct_deploy("contracts/verdict_rush.py")
    direct_vm.sender = direct_alice

    direct_vm.mock_llm(r".*", json.dumps(_verdict()))

    contract.judge_round_batch(
        "room-alpha",
        1,
        1,
        "Invent a useful product that should not exist.",
        _answers(),
    )

    with direct_vm.expect_revert(
        "This batch has already been judged"
    ):
        contract.judge_round_batch(
            "room-alpha",
            1,
            1,
            "Invent a useful product that should not exist.",
            _answers(),
        )


def test_invalid_round_number_fails(
    direct_vm,
    direct_deploy,
    direct_alice,
):
    contract = direct_deploy("contracts/verdict_rush.py")
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert(
        "Round number must be between 1 and 3"
    ):
        contract.judge_round_batch(
            "room-alpha",
            4,
            1,
            "Invent a useful product.",
            _answers(),
        )


def test_duplicate_player_id_fails(
    direct_vm,
    direct_deploy,
    direct_alice,
):
    contract = direct_deploy("contracts/verdict_rush.py")
    direct_vm.sender = direct_alice

    duplicate_answers = json.dumps(
        [
            {
                "player_id": "shahin",
                "answer": "First answer.",
            },
            {
                "player_id": "shahin",
                "answer": "Second answer.",
            },
        ]
    )

    with direct_vm.expect_revert("Duplicate player ID"):
        contract.judge_round_batch(
            "room-alpha",
            1,
            1,
            "Invent a useful product.",
            duplicate_answers,
        )