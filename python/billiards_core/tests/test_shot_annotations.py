import copy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from billiards_core.shot_annotations import link_shot_annotations, validate_shot_annotations
from billiards_core.m1_pipeline import summarize_m1_pipeline

ROOT = Path(__file__).resolve().parents[3]


def sample(name):
    return json.loads((ROOT / "data" / "samples" / name).read_text(encoding="utf-8"))


def test_annotation_schema_and_explicit_link_are_read_only():
    playlist = sample("rack-playlist-001.json")
    annotations = sample("shot-annotations-001.json")
    schema = json.loads((ROOT / "packages/contracts/schemas/shot-annotations.schema.json").read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema).validate(annotations)
    before = copy.deepcopy((playlist, annotations))
    validate_shot_annotations(annotations)
    r = link_shot_annotations(playlist, annotations)
    assert r["linked_shot_count"] == 2
    assert r["shots"][0]["expert_text"] == annotations["annotations"][0]["expert_text"]
    assert all(note["actual_observation"] is None for note in r["shots"])
    assert (playlist, annotations) == before
    assert json.dumps(r, allow_nan=False)


def test_missing_outcome_remains_null_not_guessed_from_text_or_xy():
    playlist = sample("rack-playlist-001.json")
    annotations = sample("shot-annotations-001.json")
    annotations["annotations"].pop()
    r = link_shot_annotations(playlist, annotations)
    assert r["linked_shot_count"] == 1
    assert r["shots"][1]["expert_text"] is None
    assert r["shots"][1]["actual_observation"] is None


@pytest.mark.parametrize("mutate", [
    lambda a: a["annotations"][1].update(shot_id="unknown"),
    lambda a: a["annotations"][1].update(shot_id=a["annotations"][0]["shot_id"]),
    lambda a: a["annotations"][0].update(relative_timestamp_ns=True),
    lambda a: a["annotations"][0].update(relative_timestamp_ns=9_000_000_000),
    lambda a: a["annotations"][0].update(text_source="audio-transcribed"),
    lambda a: a.update(match_id="wrong"),
    lambda a: a["annotations"][0].update(actual_observation={"raw_text": "hit", "source": "automatic"}),
])
def test_invalid_or_unlinked_annotations_rejected(mutate):
    a = sample("shot-annotations-001.json")
    mutate(a)
    with pytest.raises(ValueError):
        link_shot_annotations(sample("rack-playlist-001.json"), a)


def test_optional_actual_note_still_declared_manual_not_verified():
    a = sample("shot-annotations-001.json")
    a["annotations"][0]["actual_observation"] = {
        "raw_text": "Manual observer note only", "source": "manual-note",
    }
    r = link_shot_annotations(sample("rack-playlist-001.json"), a)
    assert r["shots"][0]["actual_observation"]["source"] == "manual-note"


def test_pipeline_combines_quality_motion_text_and_uncalibrated_preview():
    playlist = sample("rack-playlist-001.json")
    notes = sample("shot-annotations-001.json")
    calibration = sample("calibration-preview-001.json")
    original = copy.deepcopy((playlist, notes, calibration))
    report = summarize_m1_pipeline(playlist, notes, calibration)
    assert len(report["shots"]) == 2
    assert report["shots"][0]["quality"]["frame_count"] == 6
    assert report["shots"][1]["motion"]["unknown_interval_count"] == 5
    assert report["calibration"]["physical_calibration_verified"] is False
    assert report["real_world_validation_complete"] is False
    assert report == summarize_m1_pipeline(playlist, notes, calibration)
    assert (playlist, notes, calibration) == original
    assert json.dumps(report, allow_nan=False)
    calibration["table_id"] = "wrong"
    with pytest.raises(ValueError, match="table_id"):
        summarize_m1_pipeline(playlist, notes, calibration)
