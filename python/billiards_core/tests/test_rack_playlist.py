import copy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from billiards_core.rack_playlist import summarize_rack_playlist, validate_rack_playlist
from billiards_core.trajectory import TrajectoryValidationError


ROOT = Path(__file__).resolve().parents[3]


def load(name):
    return json.loads((ROOT / "data" / "samples" / name).read_text(encoding="utf-8"))


def test_playlist_sample_and_shared_schema():
    bundle = load("rack-playlist-001.json")
    playlist_schema = load_schema("rack-playlist.schema.json")
    trajectory_schema = load_schema("trajectory.schema.json")
    Draft202012Validator.check_schema(playlist_schema)
    registry = Registry().with_resource("trajectory.schema.json", Resource.from_contents(trajectory_schema))
    Draft202012Validator(playlist_schema, registry=registry).validate(bundle)
    snapshot = copy.deepcopy(bundle)
    validate_rack_playlist(bundle)
    summary = summarize_rack_playlist(bundle)
    assert summary["shot_count"] == 2
    assert [s["state_version"] for s in summary["shots"]] == [1, 2]
    assert [s["duration_ns"] for s in summary["shots"]] == [1_750_000_000] * 2
    assert summary == summarize_rack_playlist(bundle)
    assert bundle == snapshot
    assert json.dumps(summary, allow_nan=False)


def load_schema(name):
    return json.loads((ROOT / "packages" / "contracts" / "schemas" / name).read_text(encoding="utf-8"))


@pytest.mark.parametrize("mutation", [
    lambda v: v["shots"][1].update(shot_id=v["shots"][0]["shot_id"]),
    lambda v: v["shots"][1].update(state_version=1),
    lambda v: v["shots"][1].update(table_id="another"),
    lambda v: v["shots"][1]["table_geometry"].update(active_width_mm=1260),
    lambda v: v.update(sequence_origin="automatic"),
    lambda v: v["shots"].pop(),
    lambda v: v["shots"][1]["frames"][1].update(timestamp_ns=0),
])
def test_invalid_playlist_rejected(mutation):
    bundle = load("rack-playlist-001.json")
    mutation(bundle)
    with pytest.raises(TrajectoryValidationError):
        validate_rack_playlist(bundle)
