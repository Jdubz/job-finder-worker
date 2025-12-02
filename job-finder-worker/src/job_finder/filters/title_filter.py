"""Simple title keyword filter - replaces complex StrikeFilterEngine.

Fast, deterministic pre-filtering based on job title keywords.
This filter runs BEFORE any AI processing to quickly reject obviously
irrelevant jobs.
"""

import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class TitleFilterResult:
    """Result of title filtering."""

    passed: bool
    reason: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "passed": self.passed,
            "reason": self.reason,
        }


class TitleFilter:
    """
    Fast title-based pre-filter using simple keyword matching.

    This filter checks job titles against two keyword lists:
    - required_keywords: Title must contain at least ONE of these
    - excluded_keywords: Title must NOT contain ANY of these

    The filter is case-insensitive and performs substring matching.
    """

    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the title filter.

        Args:
            config: TitleFilterConfig dictionary with requiredKeywords and excludedKeywords
        """
        # Normalize keywords to lowercase for case-insensitive matching
        self.required = [k.lower().strip() for k in config.get("requiredKeywords", []) if k]
        self.excluded = [k.lower().strip() for k in config.get("excludedKeywords", []) if k]

        logger.debug(
            f"TitleFilter initialized with {len(self.required)} required, "
            f"{len(self.excluded)} excluded keywords"
        )

    def filter(self, title: str) -> TitleFilterResult:
        """
        Check if a job title passes the keyword filters.

        The filter applies these rules in order:
        1. If any excluded keyword is found -> REJECT
        2. If required keywords exist and none match -> REJECT
        3. Otherwise -> PASS

        Args:
            title: Job title to check

        Returns:
            TitleFilterResult with passed status and optional rejection reason
        """
        if not title:
            return TitleFilterResult(
                passed=False,
                reason="Empty job title",
            )

        title_lower = title.lower()

        # Check excluded keywords first (fast reject)
        for keyword in self.excluded:
            if keyword in title_lower:
                return TitleFilterResult(
                    passed=False,
                    reason=f"Title contains excluded keyword: '{keyword}'",
                )

        # Check required keywords (must have at least one)
        if self.required:
            has_required = any(kw in title_lower for kw in self.required)
            if not has_required:
                return TitleFilterResult(
                    passed=False,
                    reason=f"Title missing required keywords (need one of: {', '.join(self.required[:5])}{'...' if len(self.required) > 5 else ''})",
                )

        return TitleFilterResult(passed=True)

    def filter_batch(self, titles: List[str]) -> List[TitleFilterResult]:
        """
        Filter multiple titles efficiently.

        Args:
            titles: List of job titles to check

        Returns:
            List of TitleFilterResult in same order as input
        """
        return [self.filter(title) for title in titles]


# Convenience function for one-off filtering
def filter_title(title: str, config: Dict[str, Any]) -> TitleFilterResult:
    """
    Quick title filter without instantiating TitleFilter.

    Args:
        title: Job title to check
        config: TitleFilterConfig dictionary

    Returns:
        TitleFilterResult
    """
    return TitleFilter(config).filter(title)
