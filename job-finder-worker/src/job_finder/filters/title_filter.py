"""Simple title keyword filter - replaces complex StrikeFilterEngine.

Fast, deterministic pre-filtering based on job title keywords.
This filter runs BEFORE any AI processing to quickly reject obviously
irrelevant jobs.
"""

import logging
import re
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
        required_raw = [k.lower().strip() for k in config.get("requiredKeywords", []) if k]
        self.excluded = [k.lower().strip() for k in config.get("excludedKeywords", []) if k]

        # Expand synonyms into the required list
        synonyms = config.get("synonyms", {})
        for canonical, aliases in synonyms.items():
            canonical_lower = canonical.lower().strip()
            if canonical_lower in required_raw:
                for alias in aliases:
                    alias_lower = alias.lower().strip()
                    if alias_lower and alias_lower not in required_raw:
                        required_raw.append(alias_lower)

        self.required = required_raw

        # Compile word-boundary regex patterns for each keyword
        self._required_patterns: List[re.Pattern] = [
            re.compile(rf"\b{re.escape(kw)}\b", re.IGNORECASE) for kw in self.required
        ]
        self._excluded_patterns: List[re.Pattern] = [
            re.compile(rf"\b{re.escape(kw)}\b", re.IGNORECASE) for kw in self.excluded
        ]

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

        # Check excluded keywords first (fast reject) using word boundary regex
        for keyword, pattern in zip(self.excluded, self._excluded_patterns):
            if pattern.search(title_lower):
                return TitleFilterResult(
                    passed=False,
                    reason=f"Title contains excluded keyword: '{keyword}'",
                )

        # Check required keywords (must have at least one) using word boundary regex
        if self.required:
            has_required = any(p.search(title_lower) for p in self._required_patterns)
            if not has_required:
                return TitleFilterResult(
                    passed=False,
                    reason=f"Title missing required keywords (need one of: {', '.join(self.required[:5])}{'...' if len(self.required) > 5 else ''})",
                )

        return TitleFilterResult(passed=True)

