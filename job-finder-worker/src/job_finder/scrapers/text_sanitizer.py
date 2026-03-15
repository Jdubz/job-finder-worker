"""Text sanitization utilities for cleaning scraped content."""

import html
import re
import unicodedata
from typing import Optional


def sanitize_text(text: Optional[str], max_length: Optional[int] = None) -> str:
    """
    Comprehensive text sanitization for scraped content.

    Handles:
    - HTML entity decoding (e.g., &amp; -> &, &#8217; -> ')
    - HTML tag removal
    - Unicode normalization
    - Smart quotes and special characters
    - Excessive whitespace
    - Invisible characters

    Args:
        text: Raw text to sanitize
        max_length: Optional maximum length to truncate to

    Returns:
        Clean, normalized text
    """
    if not text:
        return ""

    # 1. Decode HTML entities (handles all entities, not just common ones)
    text = html.unescape(text)

    # 2. Remove HTML tags
    text = re.sub(r"<[^>]+>", "", text)

    # 3. Normalize Unicode characters (NFC = Canonical Decomposition + Canonical Composition)
    text = unicodedata.normalize("NFC", text)

    # 4. Replace smart quotes and special punctuation with ASCII equivalents
    replacements = {
        # Smart quotes
        "\u2018": "'",  # Left single quotation mark
        "\u2019": "'",  # Right single quotation mark
        "\u201c": '"',  # Left double quotation mark
        "\u201d": '"',  # Right double quotation mark
        # Dashes
        "\u2013": "-",  # En dash
        "\u2014": "-",  # Em dash
        "\u2015": "-",  # Horizontal bar
        # Ellipsis
        "\u2026": "...",  # Horizontal ellipsis
        # Bullets
        "\u2022": "*",  # Bullet
        "\u2023": "*",  # Triangular bullet
        # Spaces
        "\xa0": " ",  # Non-breaking space
        "\u200b": "",  # Zero-width space
        "\u200c": "",  # Zero-width non-joiner
        "\u200d": "",  # Zero-width joiner
        "\ufeff": "",  # Zero-width no-break space (BOM)
        # Other common symbols
        "\u00a9": "(c)",  # Copyright symbol
        "\u00ae": "(R)",  # Registered trademark
        "\u2122": "(TM)",  # Trademark symbol
    }

    for old, new in replacements.items():
        text = text.replace(old, new)

    # 5. Remove any remaining control characters except newlines and tabs
    text = "".join(char for char in text if unicodedata.category(char)[0] != "C" or char in "\n\t")

    # 6. Normalize whitespace
    # Replace multiple spaces with single space
    text = re.sub(r"[ \t]+", " ", text)
    # Replace multiple newlines with double newline (preserve paragraph breaks)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Remove spaces at line boundaries
    text = re.sub(r" *\n *", "\n", text)

    # 7. Trim whitespace
    text = text.strip()

    # 8. Truncate if requested
    if max_length and len(text) > max_length:
        text = text[:max_length].rsplit(" ", 1)[0] + "..."

    return text


def sanitize_html_description(html_text: str) -> str:
    """
    Sanitize HTML job descriptions while preserving readable structure.

    Converts HTML to plain text while:
    - Preserving paragraph breaks from block-level elements
    - Converting lists to bullet points
    - Handling deeply nested divs, spans, tables
    - Removing style/script content entirely

    Args:
        html_text: HTML content (or plain text — safe to call on either)

    Returns:
        Clean plain text with preserved structure
    """
    if not html_text:
        return ""

    text = html_text

    # Remove script and style blocks entirely (content + tags)
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", text, flags=re.IGNORECASE | re.DOTALL)

    # Remove HTML comments
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)

    # Convert <br> to newline
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)

    # Block-level elements that start new paragraphs (closing tag = double newline)
    # These create visual separation in the browser
    text = re.sub(
        r"</(?:p|div|section|article|header|footer|main|aside|blockquote)>",
        "\n\n",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"<(?:p|div|section|article|header|footer|main|aside|blockquote)[^>]*>",
        "\n",
        text,
        flags=re.IGNORECASE,
    )

    # Headers: double newline before, single after
    text = re.sub(r"<h[1-6][^>]*>", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</h[1-6]>", "\n", text, flags=re.IGNORECASE)

    # List items to bullets
    text = re.sub(r"<li[^>]*>", "\n* ", text, flags=re.IGNORECASE)
    text = re.sub(r"</li>", "", text, flags=re.IGNORECASE)

    # List containers: just add spacing
    text = re.sub(r"</?(?:ul|ol|dl)[^>]*>", "\n", text, flags=re.IGNORECASE)

    # Definition lists
    text = re.sub(r"<dt[^>]*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<dd[^>]*>", "\n  ", text, flags=re.IGNORECASE)
    text = re.sub(r"</(?:dt|dd)>", "", text, flags=re.IGNORECASE)

    # Table structure: rows get newlines, cells get spacing
    text = re.sub(r"</?table[^>]*>", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</?(?:thead|tbody|tfoot)[^>]*>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"<tr[^>]*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</tr>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"</?(?:td|th)[^>]*>", " ", text, flags=re.IGNORECASE)

    # <hr> to visual separator
    text = re.sub(r"<hr[^>]*/?>", "\n---\n", text, flags=re.IGNORECASE)

    # Inline elements: just remove tags, keep content
    # (strong, em, b, i, u, a, span, etc. — handled by sanitize_text's tag removal)

    # Now apply standard sanitization (strips remaining tags, entities, whitespace)
    return sanitize_text(text)


def sanitize_title(title: str) -> str:
    """
    Sanitize job title.

    Args:
        title: Raw job title

    Returns:
        Clean job title
    """
    if not title:
        return ""

    # Sanitize text
    title = sanitize_text(title)

    # Remove extra punctuation at the end
    title = re.sub(r"[,;:\-\s]+$", "", title)

    return title.strip()


def sanitize_company_name(company: str) -> str:
    """
    Sanitize company name.

    Args:
        company: Raw company name

    Returns:
        Clean company name
    """
    if not company:
        return ""

    # Sanitize text
    company = sanitize_text(company)

    # Remove common suffixes if they're duplicated
    # e.g., "Acme Inc. Inc." -> "Acme Inc."
    suffixes = ["Inc.", "LLC", "Ltd.", "Corp.", "Corporation", "Company", "Co."]
    for suffix in suffixes:
        # Match the suffix appearing twice with optional space between
        pattern = rf"(\b{re.escape(suffix)})\s+\1\b"
        company = re.sub(pattern, r"\1", company, flags=re.IGNORECASE)

    return company.strip()
