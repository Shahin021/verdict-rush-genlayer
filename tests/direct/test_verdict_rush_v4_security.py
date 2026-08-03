"""Security tests for Verdict Rush V3."""

import json
from pathlib import Path


CONTRACT_PATH = "contracts/verdict_rush_v5.py"


def _address_hex(address) -> str:
    if hasattr(address, "as_hex"):
        return address.as_hex
    return "0x" + bytes(address).hex()


def _questions() -> str:
    return json.dumps(
        [
            {
                "question": "Question one?",
                "options": ["A1", "B1", "C1", "D1"],
            },
            {
                "question": "Question two?",
                "options": ["A2", "B2", "C2", "D2"],
            },
            {
                "question": "Question three?",
                "options": ["A3", "B3", "C3", "D3"],
            },
        ]
    )


def _verdict() -> dict:
    return {
        "questions": [
            {
                "question_index": 0,
                "ranking": [0, 1, 2, 3],
                "reason": "Ranking one.",
            },
            {
                "question_index": 1,
                "ranking": [0, 1, 2, 3],
                "reason": "Ranking two.",
            },
            {
                "question_index": 2,
                "ranking": [0, 1, 2, 3],
                "reason": "Ranking three.",
            },
        ],
        "game_summary": "Security test verdict.",
    }


def _deploy_game(direct_vm, direct_deploy, relayer):
    direct_vm.sender = relayer
    direct_vm.mock_llm(r".*", json.dumps(_verdict()))

    contract = direct_deploy(
        CONTRACT_PATH,
        _address_hex(relayer),
    )

    contract.create_game(
        "game-security",
        "Security Game",
        "Choose the strongest option.",
        16,
        _questions(),
    )

    return contract


def _answers(choice: int, time_ms: int | None = None) -> str:
    answers = []

    for _ in range(3):
        answer = {"choice": choice}

        if time_ms is not None:
            answer["time_ms"] = time_ms

        answers.append(answer)

    return json.dumps(answers)


def test_unauthorized_sender_cannot_impersonate_player(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
):
    contract = _deploy_game(
        direct_vm,
        direct_deploy,
        direct_alice,
    )

    contract.create_room(
        "ROOM1",
        "game-security",
        "host-user",
        "Host",
        False,
        "",
    )

    direct_vm.sender = direct_bob

    with direct_vm.expect_revert(
        "Only the authorized relayer can call this method"
    ):
        contract.join_room(
            "ROOM1",
            "host-user",
            "Fake Host",
            "",
        )


def test_only_recorded_host_can_start_room(
    direct_vm,
    direct_deploy,
    direct_alice,
):
    contract = _deploy_game(
        direct_vm,
        direct_deploy,
        direct_alice,
    )

    contract.create_room(
        "ROOM2",
        "game-security",
        "host-user",
        "Host",
        False,
        "",
    )
    contract.join_room(
        "ROOM2",
        "player-user",
        "Player",
        "",
    )

    with direct_vm.expect_revert(
        "Only the host can start this room"
    ):
        contract.start_room("ROOM2", "player-user")

    room = json.loads(
        contract.start_room("ROOM2", "host-user")
    )
    assert room["status"] == "started"


def test_client_time_cannot_change_score(
    direct_vm,
    direct_deploy,
    direct_alice,
):
    contract = _deploy_game(
        direct_vm,
        direct_deploy,
        direct_alice,
    )

    contract.create_room(
        "ROOM3",
        "game-security",
        "host-user",
        "Host",
        False,
        "",
    )
    contract.join_room(
        "ROOM3",
        "player-user",
        "Player",
        "",
    )
    contract.start_room("ROOM3", "host-user")

    fast = json.loads(
        contract.submit_player(
            "ROOM3",
            "host-user",
            "Host",
            _answers(0, 0),
        )
    )
    forged = json.loads(
        contract.submit_player(
            "ROOM3",
            "player-user",
            "Player",
            _answers(0, 999999999),
        )
    )

    assert fast["score"] == forged["score"] == 300
    assert all(item["speed_bonus"] == 0 for item in fast["answers"])
    assert all(item["speed_bonus"] == 0 for item in forged["answers"])


def test_replayed_submission_is_idempotent(
    direct_vm,
    direct_deploy,
    direct_alice,
):
    contract = _deploy_game(
        direct_vm,
        direct_deploy,
        direct_alice,
    )

    contract.create_room(
        "ROOM4",
        "game-security",
        "host-user",
        "Host",
        False,
        "",
    )
    contract.start_room("ROOM4", "host-user")

    first = contract.submit_player(
        "ROOM4",
        "host-user",
        "Host",
        _answers(0),
    )
    replay = contract.submit_player(
        "ROOM4",
        "host-user",
        "Host",
        _answers(3),
    )

    assert replay == first
    assert contract.get_total_room_submissions() == 1
    assert contract.get_player_score(
        "ROOM4",
        "host-user",
    ) == 300


def test_unsafe_batch_scoring_entrypoint_is_removed():
    source = Path(CONTRACT_PATH).read_text(encoding="utf-8")

    assert "def score_match_batch(" not in source
    assert "time_ms = answer.get" not in source

