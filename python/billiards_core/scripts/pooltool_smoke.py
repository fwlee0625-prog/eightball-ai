"""M2.2 official Pooltool headless smoke test; run in an isolated venv.

Uses the documented System.example() and simulate() APIs. Does not
connect project coordinates or claim calibrated Chinese eight-ball physics.
"""
from __future__ import annotations

import json
import sys
import time


def main() -> int:
    try:
        import pooltool as pt
    except ImportError as exc:
        print(json.dumps({"status": "BLOCKED", "reason": str(exc)}, ensure_ascii=False))
        return 2

    started = time.perf_counter()
    try:
        shot = pt.System.example()
        result = pt.simulate(shot, inplace=False)
        if not result.simulated:
            raise RuntimeError("Pooltool did not mark the result simulated")
        events = len(result.events)
        if events < 1:
            raise RuntimeError("Pooltool produced no events")
        report = {
            "status": "PASS",
            "pooltool_version": pt.__version__,
            "python_version": sys.version.split()[0],
            "simulated_time_s": result.t,
            "event_count": events,
            "wall_time_ms": round((time.perf_counter() - started) * 1000, 3),
            "source_unchanged": not shot.simulated,
        }
        if not report["source_unchanged"]:
            raise RuntimeError("non-inplace simulation unexpectedly modified source")
        print(json.dumps(report, ensure_ascii=False, sort_keys=True))
        return 0
    except Exception as exc:
        print(json.dumps({"status": "FAIL", "error": repr(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
