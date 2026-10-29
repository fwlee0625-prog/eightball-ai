"""Reproducible synthetic M1 integration preview, not a final real-world acceptance."""

from collections.abc import Mapping
from .calibration_profile import fit_affine_preview
from .rack_playlist import summarize_rack_playlist
from .shot_annotations import link_shot_annotations
from .trajectory_motion import analyze_trajectory_motion
from .trajectory_quality import analyze_trajectory_quality


def summarize_m1_pipeline(
    playlist: Mapping[str, Any], annotation_bundle: Mapping[str, Any], calibration: Mapping[str, Any]
) -> dict[str, Any]:
    rack = summarize_rack_playlist(playlist)
    commentary = link_shot_annotations(playlist, annotation_bundle)
    geometry = fit_affine_preview(calibration)
    if geometry["table_id"] != rack["table_id"]:
        raise ValueError("calibration table_id does not match rack playlist")
    notes = {item["shot_id"]: item for item in commentary["shots"]}
    shots = []
    for record in playlist["shots"]:
        shots.append({
            "shot_id": record["shot_id"],
            "trajectory_id": record["trajectory_id"],
            "quality": analyze_trajectory_quality(record),
            "motion": analyze_trajectory_motion(record),
            "annotation": notes[record["shot_id"]],
        })
    return {
        "report_version": "0.1.0",
        "status": "synthetic_or_unverified_preview",
        "rack": rack,
        "calibration": geometry,
        "commentary": commentary,
        "shots": shots,
        "real_world_validation_complete": False,
        "limitations": [
            "Only contract validity and deterministic synthetic integration are checked.",
            "No real camera calibration, expert interpretation, physics accuracy or 200FPS benchmark is claimed.",
            "Movement candidates do not prove cue impacts; annotations do not prove actual outcomes.",
        ],
    }
