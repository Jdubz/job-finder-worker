"""Tests for AI response parsing utilities."""

import pytest

from job_finder.ai.response_parser import (
    extract_json_from_response,
    parse_json_response,
)


class TestExtractJsonFromResponse:
    """Test JSON extraction from various AI response formats."""

    def test_empty_response(self):
        """Test handling of empty responses."""
        assert extract_json_from_response("") == ""
        assert extract_json_from_response(None) == ""

    def test_plain_json_object(self):
        """Test extraction of plain JSON without markdown."""
        response = '{"key": "value"}'
        assert extract_json_from_response(response) == '{"key": "value"}'

    def test_plain_json_array(self):
        """Test extraction of plain JSON array without markdown."""
        response = '[{"item": 1}, {"item": 2}]'
        assert extract_json_from_response(response) == '[{"item": 1}, {"item": 2}]'

    def test_json_code_block(self):
        """Test extraction from ```json ... ``` blocks."""
        response = '```json\n{"key": "value"}\n```'
        assert extract_json_from_response(response) == '{"key": "value"}'

    def test_json_code_block_with_array(self):
        """Test extraction of array from ```json ... ``` blocks."""
        response = '```json\n[1, 2, 3]\n```'
        assert extract_json_from_response(response) == '[1, 2, 3]'

    def test_generic_code_block_with_object(self):
        """Test extraction from generic ``` blocks containing JSON object."""
        response = '```\n{"key": "value"}\n```'
        assert extract_json_from_response(response) == '{"key": "value"}'

    def test_generic_code_block_with_array(self):
        """Test extraction from generic ``` blocks containing JSON array."""
        response = '```\n[{"item": 1}, {"item": 2}]\n```'
        assert extract_json_from_response(response) == '[{"item": 1}, {"item": 2}]'

    def test_code_block_object_before_array(self):
        """Test that object is extracted when it appears before array."""
        response = '```\n{"items": [1, 2, 3]}\n```'
        result = extract_json_from_response(response)
        assert result == '{"items": [1, 2, 3]}'

    def test_code_block_array_before_object(self):
        """Test that array is extracted when it appears before object."""
        response = '```\n[{"key": "value"}]\n```'
        result = extract_json_from_response(response)
        assert result == '[{"key": "value"}]'

    def test_code_block_not_at_start(self):
        """Test extraction when code block doesn't start at beginning."""
        response = 'Here is the JSON:\n```\n{"key": "value"}\n```'
        assert extract_json_from_response(response) == '{"key": "value"}'

    def test_json_with_surrounding_text(self):
        """Test JSON with text before and after code block."""
        response = 'Analysis complete.\n```json\n{"score": 85}\n```\nEnd of response.'
        assert extract_json_from_response(response) == '{"score": 85}'

    def test_whitespace_handling(self):
        """Test that whitespace is properly handled."""
        response = '  ```json\n  {"key": "value"}  \n```  '
        result = extract_json_from_response(response)
        assert result == '{"key": "value"}'

    def test_nested_json(self):
        """Test extraction of nested JSON structures."""
        response = '```json\n{"outer": {"inner": {"deep": "value"}}}\n```'
        assert extract_json_from_response(response) == '{"outer": {"inner": {"deep": "value"}}}'

    def test_missing_closing_delimiter(self):
        """Test handling of missing closing code block delimiter."""
        response = '```json\n{"key": "value"}'
        # Should return the cleaned content as-is since no proper closing
        result = extract_json_from_response(response)
        assert "key" in result


class TestParseJsonResponse:
    """Test JSON parsing with error handling."""

    def test_parse_valid_json_object(self):
        """Test parsing of valid JSON object."""
        response = '{"key": "value", "number": 42}'
        result = parse_json_response(response)
        assert result == {"key": "value", "number": 42}

    def test_parse_valid_json_array(self):
        """Test parsing of valid JSON array."""
        response = '[{"item": 1}, {"item": 2}]'
        result = parse_json_response(response)
        assert result == [{"item": 1}, {"item": 2}]

    def test_parse_json_from_code_block(self):
        """Test parsing JSON from markdown code block."""
        response = '```json\n{"match_score": 85, "skills": ["python", "sql"]}\n```'
        result = parse_json_response(response)
        assert result == {"match_score": 85, "skills": ["python", "sql"]}

    def test_parse_empty_response(self):
        """Test that empty response returns default."""
        assert parse_json_response("") is None
        assert parse_json_response("", default={}) == {}

    def test_parse_none_response(self):
        """Test that None response returns default."""
        assert parse_json_response(None) is None
        assert parse_json_response(None, default={"fallback": True}) == {"fallback": True}

    def test_parse_invalid_json(self):
        """Test that invalid JSON returns default."""
        response = "This is not JSON at all"
        assert parse_json_response(response) is None
        assert parse_json_response(response, default={}) == {}

    def test_parse_malformed_json(self):
        """Test that malformed JSON returns default."""
        response = '{"key": "value", missing_quote: true}'
        assert parse_json_response(response) is None

    def test_default_value_preserved(self):
        """Test that custom default values are returned on failure."""
        default = {"error": "parse_failed", "score": 0}
        result = parse_json_response("invalid", default=default)
        assert result == default

    def test_complex_nested_structure(self):
        """Test parsing complex nested JSON structures."""
        response = '''```json
        {
            "analysis": {
                "match_score": 75,
                "matched_skills": ["python", "django", "postgresql"],
                "missing_skills": ["kubernetes"],
                "reasons": {
                    "strengths": ["5 years experience", "relevant tech stack"],
                    "concerns": ["no k8s experience"]
                }
            }
        }
        ```'''
        result = parse_json_response(response)
        assert result is not None
        assert result["analysis"]["match_score"] == 75
        assert "python" in result["analysis"]["matched_skills"]


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_unicode_content(self):
        """Test handling of unicode characters in JSON."""
        response = '{"company": "Müller & Co.", "location": "北京"}'
        result = parse_json_response(response)
        assert result == {"company": "Müller & Co.", "location": "北京"}

    def test_escaped_characters(self):
        """Test handling of escaped characters."""
        response = '{"description": "Line 1\\nLine 2\\tTabbed"}'
        result = parse_json_response(response)
        assert result == {"description": "Line 1\nLine 2\tTabbed"}

    def test_large_numbers(self):
        """Test handling of large numbers."""
        response = '{"salary": 150000, "employees": 50000}'
        result = parse_json_response(response)
        assert result == {"salary": 150000, "employees": 50000}

    def test_boolean_and_null_values(self):
        """Test handling of boolean and null JSON values."""
        response = '{"active": true, "verified": false, "notes": null}'
        result = parse_json_response(response)
        assert result == {"active": True, "verified": False, "notes": None}

    def test_empty_object(self):
        """Test parsing of empty JSON object."""
        response = '{}'
        result = parse_json_response(response)
        assert result == {}

    def test_empty_array(self):
        """Test parsing of empty JSON array."""
        response = '[]'
        result = parse_json_response(response)
        assert result == []
