"""Tests for text sanitization utilities."""

from job_finder.scrapers.text_sanitizer import (
    sanitize_company_name,
    sanitize_html_description,
    sanitize_text,
    sanitize_title,
)


def test_sanitize_html_entities():
    """Test HTML entity decoding."""
    text = "We&rsquo;re hiring &amp; growing! Join us&#8212;apply today."
    result = sanitize_text(text)
    assert result == "We're hiring & growing! Join us-apply today."


def test_sanitize_smart_quotes():
    """Test smart quote normalization."""
    text = "\u201cGreat opportunity\u201d at \u2018Top Company\u2019"
    result = sanitize_text(text)
    assert result == "\"Great opportunity\" at 'Top Company'"


def test_sanitize_unicode_dashes():
    """Test em dash and en dash normalization."""
    text = "Full-time \u2014 Remote \u2013 $100k-$150k"
    result = sanitize_text(text)
    assert result == "Full-time - Remote - $100k-$150k"


def test_sanitize_html_description():
    """Test HTML description sanitization with structure preservation."""
    html = """
    <p>We're looking for a <strong>Senior Engineer</strong>!</p>
    <br/>
    <h2>Requirements:</h2>
    <ul>
        <li>5+ years experience</li>
        <li>Python &amp; JavaScript</li>
    </ul>
    """
    result = sanitize_html_description(html)

    # Should preserve structure
    assert "We're looking for a Senior Engineer!" in result
    assert "Requirements:" in result
    assert "* 5+ years experience" in result
    assert "* Python & JavaScript" in result
    # Should not have HTML tags
    assert "<p>" not in result
    assert "<li>" not in result


def test_sanitize_deeply_nested_divs():
    """Test that nested div soup produces readable output."""
    html = (
        '<div><div><div><p style="text-align:left"><b>Job Title</b></p></div></div></div>'
        '<div><div><p>We are looking for engineers.</p>'
        "<p>Requirements:</p>"
        "<ul><li>Python</li><li>AWS</li></ul>"
        "</div></div>"
    )
    result = sanitize_html_description(html)
    assert "Job Title" in result
    assert "We are looking for engineers." in result
    assert "* Python" in result
    assert "* AWS" in result
    assert "<div>" not in result
    assert "<p" not in result


def test_sanitize_inline_styles():
    """Test that style attributes are stripped."""
    html = '<p style="text-align:inherit"></p><p style="color:red">Important text</p>'
    result = sanitize_html_description(html)
    assert "Important text" in result
    assert "style=" not in result


def test_sanitize_span_tags():
    """Test that span tags are removed but content preserved."""
    html = "<span><span><span><b>Clearance Level</b></span></span></span>"
    result = sanitize_html_description(html)
    assert result == "Clearance Level"


def test_sanitize_script_and_style_blocks():
    """Test that script and style content is fully removed."""
    html = '<style>.foo { color: red; }</style><p>Hello</p><script>alert("x")</script>'
    result = sanitize_html_description(html)
    assert result == "Hello"
    assert "color" not in result
    assert "alert" not in result


def test_sanitize_html_entities_in_descriptions():
    """Test &nbsp; and other entities in descriptions."""
    html = "First&nbsp;section.&nbsp; Second section.&amp;More."
    result = sanitize_html_description(html)
    assert "First section." in result
    assert "Second section.&More." in result
    assert "&nbsp;" not in result


def test_sanitize_table_structure():
    """Test table-based layouts produce readable output."""
    html = "<table><tr><th>Role</th><td>Engineer</td></tr><tr><th>Level</th><td>Senior</td></tr></table>"
    result = sanitize_html_description(html)
    assert "Role" in result
    assert "Engineer" in result
    assert "Level" in result
    assert "Senior" in result
    assert "<table>" not in result


def test_sanitize_definition_lists():
    """Test dl/dt/dd structure."""
    html = "<dl><dt>Location</dt><dd>Remote</dd><dt>Salary</dt><dd>$150k</dd></dl>"
    result = sanitize_html_description(html)
    assert "Location" in result
    assert "Remote" in result
    assert "Salary" in result
    assert "$150k" in result


def test_sanitize_hr_tags():
    """Test horizontal rule conversion."""
    html = "<p>Section 1</p><hr/><p>Section 2</p>"
    result = sanitize_html_description(html)
    assert "Section 1" in result
    assert "---" in result
    assert "Section 2" in result


def test_sanitize_plain_text_passthrough():
    """Test that plain text without HTML passes through cleanly."""
    text = "This is plain text.\n\nWith paragraphs.\n\n* And bullets."
    result = sanitize_html_description(text)
    assert result == text


def test_sanitize_html_comments():
    """Test that HTML comments are removed."""
    html = "<p>Visible</p><!-- hidden comment --><p>Also visible</p>"
    result = sanitize_html_description(html)
    assert "Visible" in result
    assert "Also visible" in result
    assert "hidden" not in result


def test_sanitize_preserves_paragraph_breaks():
    """Test that block elements create proper paragraph separation."""
    html = "<div>Paragraph one.</div><div>Paragraph two.</div><div>Paragraph three.</div>"
    result = sanitize_html_description(html)
    lines = [l for l in result.split("\n") if l.strip()]
    assert len(lines) == 3
    assert "Paragraph one." in lines[0]
    assert "Paragraph two." in lines[1]
    assert "Paragraph three." in lines[2]


def test_sanitize_title():
    """Test job title sanitization."""
    # Test with trailing punctuation
    title = "Senior Software Engineer - "
    result = sanitize_title(title)
    assert result == "Senior Software Engineer"

    # Test with HTML entities
    title = "Full&ndash;Stack Developer"
    result = sanitize_title(title)
    assert result == "Full-Stack Developer"


def test_sanitize_company_name():
    """Test company name sanitization."""
    # Test with HTML entities
    company = "Tech&nbsp;Solutions LLC"
    result = sanitize_company_name(company)
    assert result == "Tech Solutions LLC"

    # Test with smart quotes
    company = "\u201cInnovative\u201d Tech Corp"
    result = sanitize_company_name(company)
    assert result == '"Innovative" Tech Corp'


def test_sanitize_invisible_characters():
    """Test removal of invisible characters."""
    # Zero-width spaces and non-breaking spaces
    text = "Hello\u200bWorld\xa0Company"
    result = sanitize_text(text)
    assert result == "HelloWorld Company"


def test_sanitize_excessive_whitespace():
    """Test whitespace normalization."""
    text = "Senior    Engineer\n\n\n\nRemote    Position"
    result = sanitize_text(text)
    assert result == "Senior Engineer\n\nRemote Position"


def test_sanitize_special_symbols():
    """Test special symbol conversion."""
    text = "\u2022 Feature 1\n\u2022 Feature 2"
    result = sanitize_text(text)
    assert "* Feature 1" in result
    assert "* Feature 2" in result


def test_sanitize_empty_text():
    """Test handling of empty/None text."""
    assert sanitize_text(None) == ""
    assert sanitize_text("") == ""
    assert sanitize_title("") == ""
    assert sanitize_company_name("") == ""
    assert sanitize_html_description("") == ""
    assert sanitize_html_description(None) == ""


def test_sanitize_max_length():
    """Test text truncation."""
    long_text = "This is a very long description that should be truncated " * 10
    result = sanitize_text(long_text, max_length=50)
    assert len(result) <= 53  # 50 + "..."
    assert result.endswith("...")
