"""Shared helpers for company info formatting and stop-list checks."""

from typing import Any, Dict, List


def build_company_info_string(company_info: Dict[str, Any]) -> str:
    """Build formatted company info string."""
    company_about = company_info.get("about", "")
    company_culture = company_info.get("culture", "")
    company_mission = company_info.get("mission", "")

    company_info_parts = []
    if company_about:
        company_info_parts.append(f"About: {company_about}")
    if company_culture:
        company_info_parts.append(f"Culture: {company_culture}")
    if company_mission:
        company_info_parts.append(f"Mission: {company_mission}")

    return "\n\n".join(company_info_parts)


def should_skip_by_stop_list(
    item_url: str, company_name: str, stop_list: Dict[str, List[str]]
) -> bool:
    """Return True if item matches stop list criteria."""
    company_name = company_name or ""
    url_lower = (item_url or "").lower()

    for excluded in stop_list.get("excludedCompanies", []):
        if excluded.lower() in company_name.lower():
            return True

    for excluded_domain in stop_list.get("excludedDomains", []):
        if excluded_domain.lower() in url_lower:
            return True

    for keyword in stop_list.get("excludedKeywords", []):
        if keyword.lower() in url_lower:
            return True

    return False
