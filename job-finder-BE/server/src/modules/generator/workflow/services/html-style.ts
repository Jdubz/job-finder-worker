export const sharedCss = `
  @page { margin: 0.6in 0.7in; size: Letter; }

  :root {
    --accent: #4a90d9;
    --accent-dark: #2563eb;
    --text: #1a1a2e;
    --text-secondary: #4a5568;
    --muted: #64748b;
    --muted-light: #94a3b8;
    --bg-avatar: #e8f0fe;
    --rule: #4a90d9;
    --rule-light: #e2e8f0;
  }

  * { box-sizing: border-box; }

  body {
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    color: var(--text);
    margin: 0;
    font-size: 10.5px;
    line-height: 1.5;
  }

  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }

  .page { width: 100%; max-width: 7in; margin: 0 auto; }

  /* Header - Centered layout with avatar on right */
  header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 16px;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 12px;
  }

  .logo-box {
    width: 58px;
    height: 58px;
    border-radius: 10px;
    background: #fff;
    display: grid;
    place-items: center;
    padding: 6px;
    border: 1px solid var(--rule-light);
  }
  .logo-box img { width: 100%; height: 100%; object-fit: contain; }

  .header-center {
    text-align: center;
  }

  .name {
    font-size: 32px;
    font-weight: 700;
    color: var(--text);
    margin: 0;
    letter-spacing: -0.5px;
  }

  .title {
    font-size: 14px;
    color: var(--text-secondary);
    margin: 4px 0 10px 0;
  }

  .avatar {
    width: 70px;
    height: 70px;
    border-radius: 50%;
    background: var(--bg-avatar);
    color: var(--accent);
    font-weight: 700;
    font-size: 24px;
    display: grid;
    place-items: center;
    letter-spacing: -0.5px;
  }

  .avatar-photo {
    width: 70px;
    height: 70px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid var(--rule-light);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  /* Contact row */
  .contact {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    justify-content: center;
    font-size: 10.5px;
    color: var(--text-secondary);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .chip a { color: var(--accent); }

  .dot { color: var(--muted-light); margin: 0 2px; font-weight: 300; }

  .header-rule {
    border: 0;
    border-top: 2.5px solid var(--rule);
    margin: 14px 0 0 0;
  }

  /* Sections */
  section { margin-bottom: 18px; }

  .section-title {
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: var(--accent);
    margin: 0 0 6px 0;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--rule-light);
  }

  .summary {
    font-size: 11px;
    line-height: 1.6;
    color: var(--text);
    margin-top: 8px;
  }

  /* Experience */
  .role { margin-bottom: 16px; }

  .role-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 16px;
    margin-bottom: 2px;
  }

  .role-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
  }

  .dates {
    font-size: 10.5px;
    color: var(--muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .company {
    font-size: 11px;
    color: var(--text-secondary);
    margin-bottom: 4px;
  }
  .company strong {
    font-weight: 600;
    color: var(--text);
  }

  .bullets {
    margin: 6px 0 6px 18px;
    padding: 0;
    color: var(--text);
    font-size: 10.5px;
    line-height: 1.55;
  }
  .bullets li {
    margin: 0 0 4px 0;
    padding-left: 2px;
  }

  .tech {
    font-size: 10px;
    color: var(--muted);
    font-style: italic;
    margin-top: 4px;
  }

  /* Skills - Two column layout */
  .skills-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 24px;
    margin-top: 8px;
  }

  .skill {
    font-size: 10.5px;
    margin: 0;
  }

  .skill-label {
    font-weight: 700;
    font-size: 10.5px;
    color: var(--text);
    display: block;
    margin-bottom: 2px;
  }

  .skill-items {
    color: var(--text-secondary);
    font-size: 10.5px;
    line-height: 1.45;
  }

  /* Education */
  .edu {
    font-size: 11px;
    margin: 6px 0;
  }
  .edu strong {
    font-weight: 700;
  }
  .edu-details {
    color: var(--text-secondary);
    font-style: italic;
  }

  /* Footer */
  footer {
    margin-top: 24px;
    padding-top: 12px;
    border-top: 1px solid var(--rule-light);
    font-size: 9px;
    color: var(--muted-light);
    text-align: center;
  }
  footer a { color: var(--accent); }
`;
