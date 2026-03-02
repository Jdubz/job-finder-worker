"""Shared helpers for company info formatting and stop-list checks."""

from typing import Any, Dict


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
