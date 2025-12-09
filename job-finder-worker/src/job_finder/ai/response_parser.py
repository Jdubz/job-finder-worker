"""Utilities for parsing AI responses.

Provides functions to extract and parse JSON from AI responses that may
contain markdown code blocks or other formatting.
"""

import json
import logging
from typing import Any, Dict, List, Optional, Union

logger = logging.getLogger(__name__)


def extract_json_from_response(response: Optional[str]) -> str:
    """Extract JSON content from an AI response that may contain markdown.

    Handles common AI response patterns:
    - ```json ... ``` code blocks
    - ``` ... ``` generic code blocks
    - Envelope objects that wrap the real result (e.g., {type:'result', result:'```json ...```'})
    - Plain JSON without formatting

    Args:
        response: Raw AI response string

    Returns:
        Cleaned string containing just the JSON content
    """
    if not response:
        return ""

    cleaned = response.strip()

    # Handle envelope objects that wrap the actual result payload
    if cleaned.startswith("{") and '"result"' in cleaned:
        try:
            outer = json.loads(cleaned)
            inner = outer.get("result")
            if isinstance(inner, str) and inner.strip():
                return extract_json_from_response(inner)
        except Exception:
            # Fall back to normal parsing
            pass

    # Handle ```json ... ``` blocks
    if "```json" in cleaned:
        start = cleaned.find("```json") + 7
        end = cleaned.find("```", start)
        if end != -1 and end > start:
            return cleaned[start:end].strip()

    # Handle generic ``` ... ``` blocks by finding JSON object or array
    if cleaned.startswith("```"):
        obj_start = cleaned.find("{")
        arr_start = cleaned.find("[")
        if obj_start != -1 and (arr_start == -1 or obj_start < arr_start):
            # It's a JSON object
            end = cleaned.rfind("}")
            if end > obj_start:
                return cleaned[obj_start : end + 1]
        elif arr_start != -1:
            # It's a JSON array
            end = cleaned.rfind("]")
            if end > arr_start:
                return cleaned[arr_start : end + 1]

    # Handle ``` blocks that don't start at the beginning
    if "```" in cleaned:
        start = cleaned.find("```") + 3
        end = cleaned.find("```", start)
        if end != -1 and end > start:
            return cleaned[start:end].strip()

    return cleaned


def parse_json_response(
    response: Optional[str],
    default: Optional[Union[Dict[str, Any], List[Any]]] = None,
) -> Optional[Union[Dict[str, Any], List[Any]]]:
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
