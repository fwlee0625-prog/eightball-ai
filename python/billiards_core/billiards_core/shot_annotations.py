"""Explicit association of already-transcribed expert text with shot IDs."""

from collections.abc import Mapping
from typing import Any

from .rack_playlist import validate_rack_playlist
from .trajectory import MAX_SAFE_INTEGER


def validate_shot_annotations(value: Any) -> None:
    if not isinstance(value, Mapping) or set(value) != {"schema_version", "match_id", "rack_id", "annotations"}:
        raise ValueError("annotations fields do not match contract")
    if value["schema_version"] != "0.1.0":
        raise ValueError("unsupported annotation schema_version")
    for field in ("match_id", "rack_id"):
        if not isinstance(value[field], str) or not value[field].strip():
            raise ValueError(f"{field} must be non-empty")
    notes = value["annotations"]
    if not isinstance(notes, list) or not 1 <= len(notes) <= 100:
        raise ValueError("annotations must contain 1 to 100 entries")
    seen: set[str] = set()
    for index, item in enumerate(notes):
        if not isinstance(item, Mapping) or set(item) != {
            "shot_id", "expert_text", "text_source", "relative_timestamp_ns",
            "actual_observation",
        }:
            raise ValueError(f"annotations[{index}] fields do not match contract")
        if not isinstance(item["shot_id"], str) or not item["shot_id"].strip() or item["shot_id"] in seen:
            raise ValueError("duplicate or empty shot_id in annotations")
        seen.add(item["shot_id"])
        if not isinstance(item["expert_text"], str) or not item["expert_text"].strip():
            raise ValueError("expert_text must be non-empty")
        if item["text_source"] != "provided-transcript":
            raise ValueError("text_source must be provided-transcript")
        ts = item["relative_timestamp_ns"]
        if ts is not None and (isinstance(ts, bool) or not isinstance(ts, int) or not 0 <= ts <= MAX_SAFE_INTEGER):
            raise ValueError("relative_timestamp_ns must be a safe nonnegative integer or null")
        outcome = item["actual_observation"]
        if outcome is not None:
            if not isinstance(outcome, Mapping) or set(outcome) != {"raw_text", "source"}:
                raise ValueError("actual_observation fields do not match contract")
            if outcome["source"] != "manual-note" or not isinstance(outcome["raw_text"], str) or not outcome["raw_text"].strip():
                raise ValueError("actual_observation must be an explicit manual note")


def link_shot_annotations(playlist: Mapping[str, Any], annotations: Mapping[str, Any]) -> dict[str, Any]:
    """Link only by explicit shot_id; no NLP, timing inference or outcome guessing."""
    validate_rack_playlist(playlist)
    validate_shot_annotations(annotations)
    if annotations["match_id"] != playlist["match_id"] or annotations["rack_id"] != playlist["rack_id"]:
        raise ValueError("annotation match_id/rack_id does not match playlist")
    shots = {shot["shot_id"]: shot for shot in playlist["shots"]}
    notes = {note["shot_id"]: note for note in annotations["annotations"]}
    if not set(notes).issubset(shots):
        raise ValueError("annotations reference a shot_id absent from the playlist")
    for shot_id, note in notes.items():
        ts = note["relative_timestamp_ns"]
        if ts is not None and ts > shots[shot_id]["frames"][-1]["timestamp_ns"]:
            raise ValueError("explicit relative_timestamp_ns exceeds selected shot duration")
    return {
        "report_version": "0.1.0",
        "match_id": playlist["match_id"],
        "rack_id": playlist["rack_id"],
        "linked_shot_count": len(notes),
        "shots": [{
            "shot_id": shot["shot_id"],
            "expert_text": notes[shot["shot_id"]]["expert_text"] if shot["shot_id"] in notes else None,
            "text_source": "provided-transcript" if shot["shot_id"] in notes else None,
            "relative_timestamp_ns": notes[shot["shot_id"]]["relative_timestamp_ns"] if shot["shot_id"] in notes else None,
            "actual_observation": dict(notes[shot["shot_id"]]["actual_observation"])
            if shot["shot_id"] in notes and notes[shot["shot_id"]]["actual_observation"] is not None else None,
        } for shot in playlist["shots"]],
        "limitations": [
            "Text was already transcribed and explicitly linked to shot_id; no audio processing or NLP inference.",
            "Expert description is advice, not an observed event or physically verified result.",
            "An optional manual actual_observation is a human note, not confirmed tracker evidence.",
            "Missing timestamps remain null; no cross-shot wall-clock alignment is inferred.",
        ],
    }
