export const sharedCss = `
  @page { margin: 0.5in 0.6in; size: Letter; }

  :root {
    --accent: #2563eb;
    --accent-light: #3b82f6;
    --accent-bg: #eff6ff;
    --accent-border: #bfdbfe;
    --text: #1e293b;
    --text-secondary: #475569;
    --muted: #64748b;
    --muted-light: #94a3b8;
    --bg-avatar: #dbeafe;
    --rule: #2563eb;
    --rule-light: #e2e8f0;
    --timeline: #cbd5e1;
  }

  * { box-sizing: border-box; }

  body {
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    color: var(--text);
    margin: 0;
    font-size: 10.5px;
    line-height: 1.5;
    position: relative;
  }

  a { color: var(--accent); text-decoration: none; }

  .page {
    width: 100%;
    max-width: 7.3in;
    margin: 0 auto;
    position: relative;
  }

  /* Decorative corner accents */
  .page::before {
    content: "";
    position: absolute;
    top: -8px;
    right: -8px;
    width: 60px;
    height: 60px;
    background: linear-gradient(135deg, transparent 50%, var(--accent-bg) 50%);
    opacity: 0.7;
  }

  .page::after {
    content: "";
    position: absolute;
    bottom: -8px;
    left: -8px;
    width: 40px;
    height: 40px;
    border: 2px solid var(--accent-border);
    border-radius: 50%;
    opacity: 0.5;
  }

  /* Header */
  header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 20px;
    align-items: center;
    margin-bottom: 8px;
    padding-bottom: 8px;
  }

  .logo-box {
    width: 62px;
    height: 62px;
    border-radius: 12px;
    background: #fff;
    display: grid;
    place-items: center;
    padding: 6px;
    border: 2px solid var(--accent-border);
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.1);
  }
  .logo-box img { width: 100%; height: 100%; object-fit: contain; }

  .header-center { text-align: center; }

  .name {
    font-size: 34px;
    font-weight: 700;
    color: var(--text);
    margin: 0;
    letter-spacing: -0.5px;
  }

  .title {
    font-size: 14px;
    color: var(--accent);
    font-weight: 500;
    margin: 2px 0 12px 0;
    letter-spacing: 0.3px;
  }

  .avatar {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--accent-bg) 0%, var(--bg-avatar) 100%);
    color: var(--accent);
    font-weight: 700;
    font-size: 26px;
    display: grid;
    place-items: center;
    letter-spacing: -0.5px;
    border: 3px solid var(--accent-border);
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);
  }

  .avatar-photo {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    object-fit: cover;
    border: 3px solid var(--accent-border);
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);
  }

  /* Contact row with icons */
  .contact {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: var(--text-secondary);
  }

  .contact-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .contact-item svg {
    width: 12px;
    height: 12px;
    fill: var(--accent);
    flex-shrink: 0;
  }

  .contact-item a { color: var(--accent); font-weight: 500; }
  .contact-item span { color: var(--text-secondary); }

  .header-rule {
    border: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--accent) 0%, var(--accent-light) 50%, var(--accent) 100%);
    margin: 10px 0 16px 0;
    border-radius: 2px;
  }

  /* Sections */
  section { margin-bottom: 16px; }

  .section-title {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 1.8px;
    text-transform: uppercase;
    color: var(--accent);
    margin: 0 0 8px 0;
    padding-bottom: 4px;
    border-bottom: 2px solid var(--rule-light);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .section-title::before {
    content: "";
    width: 4px;
    height: 16px;
    background: var(--accent);
    border-radius: 2px;
  }

  .summary {
    font-size: 10.5px;
    line-height: 1.65;
    color: var(--text);
    padding-left: 12px;
    border-left: 2px solid var(--accent-border);
    margin: 8px 0;
  }

  /* Experience with timeline */
  .experience-list {
    position: relative;
    padding-left: 20px;
  }

  .experience-list::before {
    content: "";
    position: absolute;
    left: 5px;
    top: 8px;
    bottom: 8px;
    width: 2px;
    background: linear-gradient(180deg, var(--accent) 0%, var(--timeline) 100%);
    border-radius: 1px;
  }

  .role {
    margin-bottom: 14px;
    position: relative;
  }

  .role::before {
    content: "";
    position: absolute;
    left: -20px;
    top: 6px;
    width: 12px;
    height: 12px;
    background: var(--accent);
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow: 0 0 0 2px var(--accent-border);
  }

  .role-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 16px;
    margin-bottom: 1px;
  }

  .role-title {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--text);
  }

  .dates {
    font-size: 10px;
    color: var(--muted);
    white-space: nowrap;
    flex-shrink: 0;
    font-weight: 500;
  }

  .company {
    font-size: 10.5px;
    color: var(--text-secondary);
    margin-bottom: 4px;
  }
  .company strong {
    font-weight: 600;
    color: var(--accent);
  }

  .bullets {
    margin: 5px 0 5px 14px;
    padding: 0;
    color: var(--text);
    font-size: 10px;
    line-height: 1.5;
  }
  .bullets li {
    margin: 0 0 3px 0;
    padding-left: 0;
  }
  .bullets li::marker {
    color: var(--accent);
  }

  .tech {
    font-size: 9.5px;
    color: var(--muted);
    font-style: italic;
    margin-top: 3px;
    padding-left: 2px;
  }

  /* Skills as tags/pills */
  .skills-section {
    margin-top: 6px;
  }

  .skills-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 20px;
  }

  .skill-category {
    margin-bottom: 2px;
  }

  .skill-label {
    font-weight: 700;
    font-size: 10.5px;
    color: var(--text);
    display: block;
    margin-bottom: 5px;
  }

  .skill-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .skill-tag {
    display: inline-block;
    padding: 2px 8px;
    font-size: 9px;
    color: var(--accent);
    background: var(--accent-bg);
    border: 1px solid var(--accent-border);
    border-radius: 12px;
    font-weight: 500;
  }

  /* Education */
  .edu {
    font-size: 10.5px;
    margin: 6px 0;
    padding-left: 12px;
    border-left: 2px solid var(--accent-border);
  }
  .edu strong { font-weight: 700; color: var(--text); }
  .edu-details { color: var(--text-secondary); }

  /* Footer */
  footer {
    margin-top: 20px;
    padding-top: 10px;
    border-top: 1px solid var(--rule-light);
    font-size: 8.5px;
    color: var(--muted-light);
    text-align: center;
  }
  footer a { color: var(--accent); font-weight: 500; }
`;

// SVG icons as data URIs for contact items
export const icons = {
  email: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>`,
  location: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
  website: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`,
  linkedin: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg>`,
  github: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z"/></svg>`,
  phone: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>`
};
