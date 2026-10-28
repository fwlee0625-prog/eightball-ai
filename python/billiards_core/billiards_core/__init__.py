"""Core domain helpers for Eightball AI."""

from .state import ObservationValidationError, TableGeometry, build_table_state

__all__ = [
    "ObservationValidationError",
    "TableGeometry",
    "build_table_state",
]
