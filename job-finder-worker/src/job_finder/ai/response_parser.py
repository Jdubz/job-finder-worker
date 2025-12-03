"""Utilities for parsing AI responses.

Provides functions to extract and parse JSON from AI responses that may
contain markdown code blocks or other formatting.
"""

import json
import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def extract_json_from_response(response: str) -> str:
    """Extract JSON content from an AI response that may contain markdown.

    Handles common AI response patterns:
    - ```json ... ``` code blocks
    - ``` ... ``` generic code blocks
    - Plain JSON without formatting

    Args:
        response: Raw AI response string

    Returns:
        Cleaned string containing just the JSON content
    """
    if not response:
        return ""

    cleaned = response.strip()

    # Handle ```json ... ``` blocks
    if "```json" in cleaned:
        start = cleaned.find("```json") + 7
        end = cleaned.find("```", start)
        if end > start:
            return cleaned[start:end].strip()

    # Handle generic ``` ... ``` blocks by finding JSON object
    if cleaned.startswith("```"):
        json_start = cleaned.find("{")
        json_end = cleaned.rfind("}")
        if json_start != -1 and json_end > json_start:
            return cleaned[json_start : json_end + 1]

    # Handle ``` blocks that don't start at the beginning
    if "```" in cleaned:
        start = cleaned.find("```") + 3
        end = cleaned.find("```", start)
        if end > start:
            return cleaned[start:end].strip()

    return cleaned


def parse_json_response(
    response: str,
    default: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Parse JSON from an AI response, handling markdown formatting.

    Combines extraction and parsing with error handling.

    Args:
        response: Raw AI response string
        default: Default value to return on parse failure (default: None)

    Returns:
        Parsed JSON dict, or default value on failure
    """
    if not response:
        return default

    try:
        json_str = extract_json_from_response(response)
        return json.loads(json_str)
    except json.JSONDecodeError as e:
        logger.warning("Failed to parse AI response as JSON: %s", e)
        logger.debug("Response was: %s", response[:500] if response else "")
        return default
    except Exception as e:
        logger.warning("Unexpected error parsing AI response: %s", e)
        return default
