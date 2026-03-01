/**
 * Unified resume CSS — ATS-compatible structure with visual polish.
 *
 * ATS-safe constraints:
 *   - Single-column flow (no CSS grid, no tables, no float columns)
 *   - Standard web-safe fonts (Calibri → Arial fallback)
 *   - No SVG icons, no background images, no text-in-shapes
 *   - All text selectable and in DOM order
 *
 * Visual flair (human-eye appeal):
 *   - Accent-colored section headings with bottom border
 *   - Subtle accent on role dates and skill category labels
 *   - Clean typographic hierarchy (18 / 13 / 11 pt)
 *   - Tasteful horizontal rules and spacing
 */
export const atsCss = `
  @page { margin: 0.6in 0.75in; size: Letter; }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Calibri', 'Arial', 'Helvetica Neue', sans-serif;
    color: #1a1a1a;
    font-size: 11px;
    line-height: 1.5;
  }

  a { color: #1a1a1a; text-decoration: none; }

  .page {
    max-width: 7in;
    margin: 0 auto;
  }

  /* ── Header ─────────────────────────────────────────────── */
  .header {
    text-align: center;
    margin-bottom: 4px;
  }

  .header-content {
    display: inline-flex;
    align-items: center;
    gap: 12px;
  }

  .header-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .header-logo {
    height: 28px;
    width: auto;
    flex-shrink: 0;
    opacity: 0.85;
  }

  .header-text {
    text-align: left;
  }

  .header:not(:has(.header-avatar)):not(:has(.header-logo)) .header-text {
    text-align: center;
  }

  .header .name {
    font-size: 22px;
    font-weight: 700;
    color: #111;
    letter-spacing: -0.3px;
    margin-bottom: 2px;
  }

  .header .title {
    font-size: 13px;
    font-weight: 500;
    color: #2563eb;
    margin-bottom: 6px;
  }

  .header-rule {
    border: none;
    border-top: 2px solid #2563eb;
    margin-bottom: 5px;
  }

  /* ── Contact row ────────────────────────────────────────── */
  .contact-row {
    text-align: center;
    font-size: 10px;
    color: #444;
    margin-bottom: 10px;
    line-height: 1.6;
  }

  .contact-row .sep {
    margin: 0 5px;
    color: #bbb;
  }

  .contact-row a {
    color: #2563eb;
  }

  /* ── Section headings ───────────────────────────────────── */
  .section-heading {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    color: #2563eb;
    border-bottom: 1.5px solid #2563eb;
    padding-bottom: 2px;
    margin-top: 10px;
    margin-bottom: 6px;
  }

  /* ── Summary ────────────────────────────────────────────── */
  .summary {
    font-size: 11px;
    line-height: 1.55;
    color: #222;
    margin-bottom: 2px;
  }

  /* ── Experience ─────────────────────────────────────────── */
  .exp-entry {
    margin-bottom: 8px;
  }

  .exp-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .exp-role {
    font-size: 11px;
    font-weight: 700;
    color: #111;
  }

  .exp-dates {
    font-size: 10px;
    color: #2563eb;
    white-space: nowrap;
    flex-shrink: 0;
    font-weight: 600;
  }

  .exp-company {
    font-size: 10.5px;
    color: #444;
    margin-bottom: 2px;
  }

  .exp-bullets {
    margin: 2px 0 0 16px;
    padding: 0;
    font-size: 10.5px;
    line-height: 1.45;
    color: #222;
  }

  .exp-bullets li {
    margin-bottom: 1px;
  }

  .exp-bullets li::marker {
    color: #2563eb;
  }

  .exp-tech {
    font-size: 9.5px;
    color: #666;
    font-style: italic;
    margin-top: 2px;
    margin-left: 16px;
  }

  /* ── Skills ─────────────────────────────────────────────── */
  .skills-list {
    margin-bottom: 2px;
  }

  .skill-row {
    font-size: 10.5px;
    margin-bottom: 2px;
    line-height: 1.45;
  }

  .skill-row .label {
    font-weight: 700;
    color: #222;
  }

  /* ── Projects ───────────────────────────────────────────── */
  .project-entry {
    margin-bottom: 6px;
  }

  .project-name {
    font-size: 11px;
    font-weight: 700;
    color: #111;
  }

  .project-link {
    font-size: 10px;
    color: #2563eb;
  }

  /* ── Education ──────────────────────────────────────────── */
  .edu-entry {
    margin-bottom: 4px;
  }

  .edu-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .edu-degree {
    font-size: 11px;
    font-weight: 700;
    color: #111;
  }

  .edu-date {
    font-size: 10px;
    color: #2563eb;
    font-weight: 600;
  }

  .edu-school {
    font-size: 10.5px;
    color: #444;
  }

  /* ── Cover letter ───────────────────────────────────────── */
  .letter {
    max-width: 7in;
    margin: 0 auto;
  }

  .letter-header {
    margin-bottom: 16px;
  }

  .letter-header .name {
    font-size: 22px;
    font-weight: 700;
    color: #111;
    letter-spacing: -0.3px;
  }

  .letter-header .title {
    font-size: 13px;
    font-weight: 500;
    color: #2563eb;
    margin-bottom: 4px;
  }

  .letter-contact {
    font-size: 10px;
    color: #444;
    margin-bottom: 8px;
  }

  .letter-date {
    font-size: 11px;
    margin-bottom: 14px;
    color: #444;
  }

  .letter-greeting {
    font-size: 12px;
    font-weight: 700;
    margin-bottom: 10px;
    color: #111;
  }

  .letter-body p {
    font-size: 11px;
    line-height: 1.65;
    margin-bottom: 10px;
    text-align: left;
    color: #222;
  }

  .letter-signature {
    margin-top: 20px;
  }

  .letter-signature .closing {
    font-size: 11px;
    margin-bottom: 4px;
    color: #444;
  }

  .letter-signature .signer {
    font-size: 11px;
    font-weight: 700;
    color: #111;
  }
`
