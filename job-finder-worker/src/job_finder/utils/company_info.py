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
    """Return True if item matches stop list criteria (single consolidated list)."""

    company_name = company_name or ""
    url_lower = (item_url or "").lower()

    excluded_companies = [c.lower() for c in stop_list.get("excludedCompanies", [])]
    excluded_domains = [d.lower() for d in stop_list.get("excludedDomains", [])]
    excluded_keywords = [k.lower() for k in stop_list.get("excludedKeywords", [])]

    if any(ex in company_name.lower() for ex in excluded_companies):
        return True

    if any(domain in url_lower for domain in excluded_domains):
        return True

    if any(keyword in url_lower for keyword in excluded_keywords):
        return True

    return False
