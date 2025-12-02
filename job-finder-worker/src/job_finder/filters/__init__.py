"""Job filtering system."""

from job_finder.filters.models import FilterRejection, FilterResult
from job_finder.filters.title_filter import TitleFilter, TitleFilterResult

__all__ = [
    "TitleFilter",
    "TitleFilterResult",
    "FilterResult",
    "FilterRejection",
]
