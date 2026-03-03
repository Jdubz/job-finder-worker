"""Tests for Workday engineering facet auto-detection."""

import pytest

from job_finder.scrapers.ats_prober import (
    _is_engineering_category,
    extract_workday_engineering_facets,
)


# ---------------------------------------------------------------------------
# _is_engineering_category
# ---------------------------------------------------------------------------


class TestIsEngineeringCategory:
    """Phrase and word-boundary matching for facet value descriptors."""

    @pytest.mark.parametrize(
        "name",
        [
            "Software Engineering",
            "Information Technology",
            "Digital Technology",
            "Product Development",
            "Data Science",
            "Machine Learning",
            "DevOps",
            "Site Reliability",
            "Quality Assurance",
            "Platform Engineering",
            "Cloud Engineering",
            "Security Engineering",
        ],
    )
    def test_positive_phrase_matches(self, name: str) -> None:
        assert _is_engineering_category(name) is True

    @pytest.mark.parametrize(
        "name",
        [
            "Engineering",
            "Technology",
            "Tech",
            "Data",
            "Software",
            "Cybersecurity",
            "Infrastructure",
        ],
    )
    def test_positive_word_boundary_matches(self, name: str) -> None:
        assert _is_engineering_category(name) is True

    def test_it_uppercase_matches(self) -> None:
        assert _is_engineering_category("IT") is True

    def test_it_in_hospitality_does_not_match(self) -> None:
        assert _is_engineering_category("Hospitality") is False

    def test_tech_matches_but_biotech_does_not(self) -> None:
        assert _is_engineering_category("Tech") is True
        assert _is_engineering_category("Biotech") is False

    @pytest.mark.parametrize(
        "name",
        [
            "Marketing",
            "Sales",
            "Finance",
            "Human Resources",
            "Legal",
            "Operations",
            "Customer Success",
            "Administration",
            "Accounting",
        ],
    )
    def test_non_engineering_categories(self, name: str) -> None:
        assert _is_engineering_category(name) is False


# ---------------------------------------------------------------------------
# extract_workday_engineering_facets
# ---------------------------------------------------------------------------


class TestExtractWorkdayEngineeringFacets:
    """Full facet extraction from Workday CXS /jobs responses."""

    def test_standard_job_family_group(self) -> None:
        """jobFamilyGroup with mixed categories returns only engineering IDs."""
        data = {
            "jobPostings": [],
            "total": 500,
            "facets": [
                {
                    "facetParameter": "jobFamilyGroup",
                    "descriptor": "Job Category",
                    "values": [
                        {"descriptor": "Software Engineering", "id": "eng1", "count": 89},
                        {"descriptor": "Marketing", "id": "mkt1", "count": 200},
                        {"descriptor": "Data Science", "id": "ds1", "count": 45},
                        {"descriptor": "Sales", "id": "sales1", "count": 150},
                        {"descriptor": "Infrastructure", "id": "infra1", "count": 30},
                    ],
                }
            ],
        }
        result = extract_workday_engineering_facets(data)
        assert result is not None
        assert "jobFamilyGroup" in result
        ids = result["jobFamilyGroup"]
        assert "eng1" in ids
        assert "ds1" in ids
        assert "infra1" in ids
        assert "mkt1" not in ids
        assert "sales1" not in ids

    def test_single_letter_key_with_job_function_descriptor(self) -> None:
        """Red Hat-style: single-letter key 'd' with descriptor 'Job Function'."""
        data = {
            "jobPostings": [],
            "facets": [
                {
                    "facetParameter": "d",
                    "descriptor": "Job Function",
                    "values": [
                        {"descriptor": "Software Engineering", "id": "se1", "count": 100},
                        {"descriptor": "Marketing", "id": "mkt1", "count": 50},
                    ],
                }
            ],
        }
        result = extract_workday_engineering_facets(data)
        assert result is not None
        assert "d" in result
        assert result["d"] == ["se1"]

    def test_job_family_variant(self) -> None:
        """Logicalis-style: jobFamily parameter."""
        data = {
            "jobPostings": [],
            "facets": [
                {
                    "facetParameter": "jobFamily",
                    "descriptor": "Job Family",
                    "values": [
                        {"descriptor": "Engineering", "id": "e1", "count": 40},
                        {"descriptor": "Finance", "id": "f1", "count": 20},
                        {"descriptor": "Technology", "id": "t1", "count": 30},
                    ],
                }
            ],
        }
        result = extract_workday_engineering_facets(data)
        assert result is not None
        assert "jobFamily" in result
        ids = result["jobFamily"]
        assert "e1" in ids
        assert "t1" in ids
        assert "f1" not in ids

    def test_no_facets_key_returns_none(self) -> None:
        """Response with no facets key at all."""
        data = {"jobPostings": [], "total": 100}
        assert extract_workday_engineering_facets(data) is None

    def test_empty_facets_returns_none(self) -> None:
        data = {"jobPostings": [], "facets": []}
        assert extract_workday_engineering_facets(data) is None

    def test_facets_with_no_engineering_categories_returns_none(self) -> None:
        """All facet values are non-engineering."""
        data = {
            "jobPostings": [],
            "facets": [
                {
                    "facetParameter": "jobFamilyGroup",
                    "descriptor": "Job Category",
                    "values": [
                        {"descriptor": "Marketing", "id": "m1", "count": 100},
                        {"descriptor": "Sales", "id": "s1", "count": 80},
                        {"descriptor": "Finance", "id": "f1", "count": 60},
                    ],
                }
            ],
        }
        assert extract_workday_engineering_facets(data) is None

    def test_known_param_preferred_over_fallback(self) -> None:
        """When both a known param and a fallback param have engineering values,
        the known param is returned."""
        data = {
            "jobPostings": [],
            "facets": [
                {
                    "facetParameter": "d",
                    "descriptor": "Job Function",
                    "values": [
                        {"descriptor": "Engineering", "id": "fallback1", "count": 10},
                    ],
                },
                {
                    "facetParameter": "jobFamilyGroup",
                    "descriptor": "Job Category",
                    "values": [
                        {"descriptor": "Software Engineering", "id": "preferred1", "count": 50},
                    ],
                },
            ],
        }
        result = extract_workday_engineering_facets(data)
        assert result is not None
        assert "jobFamilyGroup" in result
        assert result["jobFamilyGroup"] == ["preferred1"]

    def test_facets_not_a_list_returns_none(self) -> None:
        data = {"jobPostings": [], "facets": "invalid"}
        assert extract_workday_engineering_facets(data) is None

    def test_values_missing_descriptor_skipped(self) -> None:
        """Values without a descriptor field are safely skipped."""
        data = {
            "jobPostings": [],
            "facets": [
                {
                    "facetParameter": "jobFamilyGroup",
                    "descriptor": "Job Category",
                    "values": [
                        {"id": "no_desc", "count": 10},
                        {"descriptor": "Engineering", "id": "eng1", "count": 50},
                    ],
                }
            ],
        }
        result = extract_workday_engineering_facets(data)
        assert result is not None
        assert result["jobFamilyGroup"] == ["eng1"]
