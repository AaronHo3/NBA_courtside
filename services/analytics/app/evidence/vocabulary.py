"""Action vocabulary v1 (VIDEO_PIPELINE §8): observable actions and their observable outcomes.

Interpretation ("why") and judgment ("good/bad") are deliberately not in this table; they live in
separate annotation kinds and report claims (DEC-11)."""

from __future__ import annotations

from dataclasses import dataclass

VOCAB_VERSION = 1


class VocabularyError(ValueError):
    pass


@dataclass(frozen=True)
class Action:
    key: str
    definition: str
    outcomes: tuple[str, ...]


_SHOT = ("made", "missed", "blocked", "fouled")

ACTIONS: tuple[Action, ...] = (
    Action("catch_and_shoot_3", "Receives a pass and shoots a 3 without a dribble", _SHOT),
    Action("pull_up_shot", "Shoots after one or more dribbles", _SHOT),
    Action(
        "drive",
        "Attacks the basket off the dribble past the first defender's hip",
        ("finish_made", "finish_missed", "kick_out", "turnover", "foul_drawn"),
    ),
    Action(
        "screen_set",
        "Sets a stationary screen on a defender",
        ("defender_contact", "slipped", "switched", "not_observable"),
    ),
    Action(
        "cut",
        "Off-ball movement toward the basket or an open area to receive",
        ("received", "not_received"),
    ),
    Action(
        "closeout",
        "Defender runs at a shooter after a pass",
        ("contest_hand_up", "late", "blown_by", "no_shot"),
    ),
    Action(
        "help_rotation", "Defender leaves assignment to help", ("stop", "late", "not_observable")
    ),
    Action("box_out", "Makes contact to prevent an opponent's rebound", ("secured_team", "lost")),
    Action(
        "post_up",
        "Establishes position with back to basket",
        ("score", "miss", "pass_out", "turnover"),
    ),
    Action(
        "pass_creation",
        "Pass that leads directly to a shot attempt",
        ("assist", "shot_missed", "secondary"),
    ),
    Action("turnover_live", "Loses the ball to the defense", ("steal", "deflection")),
    Action("unknown", "Action could not be determined", ()),
    Action("not_observable", "The relevant player or action is out of frame / obstructed", ()),
)
ACTION_INDEX = {a.key: a for a in ACTIONS}


def validate(action: str, outcome: str | None) -> None:
    spec = ACTION_INDEX.get(action)
    if spec is None:
        raise VocabularyError(
            f"unknown action {action!r}; vocabulary v{VOCAB_VERSION} has {sorted(ACTION_INDEX)}"
        )
    if outcome is None:
        return
    if outcome not in spec.outcomes:
        allowed = ", ".join(spec.outcomes) if spec.outcomes else "no outcome"
        raise VocabularyError(
            f"outcome {outcome!r} is not valid for action {action!r} (allowed: {allowed})"
        )


def catalog() -> list[dict]:
    return [
        {"action": a.key, "definition": a.definition, "outcomes": list(a.outcomes)} for a in ACTIONS
    ]
