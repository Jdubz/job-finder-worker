export const sharedCss = `
  @page { margin: 0.9in 0.8in; size: Letter; }

  :root {
    --accent: #1d4ed8;
    --text: #0f172a;
    --muted: #475569;
    --muted-2: #94a3b8;
    --bg-chip: rgba(29, 78, 216, 0.08);
    --bg-soft: #f8fbff;
    --rule: #d5dde9;
  }

  body {
    font-family: "Calibri", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    color: var(--text);
    margin: 0;
  }

  a { color: var(--accent); text-decoration: none; }
  .page { width: 6.4in; margin: 0 auto; }

  /* Header */
  header {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 16px;
    margin: 0 0 18px 0;
    align-items: center;
  }

  .brand { display: flex; gap: 12px; align-items: center; }

  .logo-box {
    width: 52px;
    height: 52px;
    border-radius: 12px;
    border: 1px solid var(--rule);
    background: #fff;
    display: grid;
    place-items: center;
    padding: 4px;
  }
  .logo-box img { width: 100%; height: 100%; object-fit: contain; }

  .avatar {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--bg-chip);
    color: var(--accent);
    font-weight: 700;
    font-size: 18px;
    display: grid;
    place-items: center;
    letter-spacing: -0.3px;
  }

  .avatar-photo {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid var(--rule);
    box-shadow: 0 3px 10px rgba(15, 23, 42, 0.08);
  }

  .name { font-size: 26px; font-weight: 700; color: var(--text); margin: 0 0 2px 0; }
  .title { font-size: 12.6px; color: var(--muted); margin: 0 0 10px 0; }

  .contact {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    font-size: 10.4px;
    color: var(--text);
    margin-bottom: 8px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    background: transparent;
    border-radius: 0;
    line-height: 1.2;
  }
  .chip a { color: var(--text); text-decoration: none; }

  .dot { color: var(--muted-2); margin: 0 4px; }
  .contact-rule { border: 0; border-top: 1px solid var(--rule); margin: 8px 0 0; }

  /* Sections */
  section { margin-bottom: 22px; }

  .section-title {
    font-size: 11.6px;
    font-weight: 700;
    letter-spacing: 0.42px;
    color: var(--accent);
    margin: 18px 0 10px;
    border-bottom: 1px solid var(--rule);
    padding-bottom: 5px;
  }

  .summary { font-size: 11.2px; line-height: 1.65; color: var(--text); }

  /* Experience */
  .role { margin-bottom: 18px; }

  .role-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: baseline;
  }

  .role-title { font-size: 12.6px; font-weight: 700; color: var(--text); }
  .company { font-size: 10.6px; color: var(--muted); font-style: italic; }
  .dates { font-size: 10.2px; color: #64748b; white-space: nowrap; }

  .bullets {
    margin: 7px 0 10px 16px;
    padding: 0;
    color: var(--text);
    font-size: 10.7px;
    line-height: 1.62;
  }
  .bullets li { margin: 0 0 6px 0; }

  .tech { font-size: 10px; color: var(--muted); margin-top: -2px; }

  /* Skills & Education */
  .skill { font-size: 10.6px; margin: 7px 0 6px; }
  .skill-label { font-weight: 700; font-size: 10.4px; color: var(--text); margin-bottom: 4px; }

  .pillrow { display: block; margin: 2px 0 0 0; }
  .pill {
    display: inline;
    padding: 0;
    border: none;
    border-radius: 0;
    font-size: 10px;
    color: var(--muted);
    background: transparent;
  }
  .pill + .pill::before { content: " • "; color: var(--muted-2); }

  .edu { font-size: 10.6px; margin: 6px 0; }
`;
