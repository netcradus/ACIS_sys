/**
 * ACIS branded Keycloak login page — pure DOM/CSS enhancement layer.
 *
 * Deliberately does NOT touch Keycloak's real <form>, its input elements, or
 * its submit control — it only wraps/repositions the EXISTING nodes and adds
 * new decorative siblings around them. If any expected element is missing
 * (a different screen re-uses this script, e.g. OTP/register), each step
 * fails gracefully and leaves that screen untouched — nothing here can break
 * actual authentication, CSRF, or Keycloak's own form submission.
 */
(function () {
  // -----------------------------------------------------------------------
  // Theme resolution — runs IMMEDIATELY (not gated behind DOMContentLoaded)
  // so `data-theme` is set on <html> before first paint, avoiding a flash
  // of the wrong theme. Same localStorage key the real ACIS app's own
  // theme store uses (frontend/src/store/themeStore.ts's `acis_theme_mode`)
  // for naming consistency, though this page is served from Keycloak's own
  // origin so the two never actually share storage. Unlike the app's
  // 3-state light/dark/system menu, this is a plain 2-state toggle — a
  // simpler, unambiguous control fits a dependency-free login screen
  // better than a dropdown; it still *defaults* to system preference the
  // first time a visitor arrives, exactly like the app does.
  var THEME_KEY = 'acis_theme_mode';

  function getStoredTheme() {
    try {
      var v = window.localStorage.getItem(THEME_KEY);
      return (v === 'light' || v === 'dark') ? v : null;
    } catch (e) {
      return null;
    }
  }

  function getSystemTheme() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch (e) {
      return 'dark';
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  function setTheme(theme) {
    applyTheme(theme);
    try { window.localStorage.setItem(THEME_KEY, theme); } catch (e) { /* private mode, etc. — theme still applies, just isn't remembered */ }
    var btn = document.querySelector('.acis-theme-toggle');
    if (btn) btn.innerHTML = ICONS[theme === 'light' ? 'sun' : 'moon'];
  }

  applyTheme(getStoredTheme() || getSystemTheme());

  function $(sel, root) { return (root || document).querySelector(sel); }

  // Minimal inline icon set, stroke-based, no external assets.
  var ICONS = {
    scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M3 17v2a2 2 0 0 0 2 2h2M21 7V5a2 2 0 0 0-2-2h-2M21 17v2a2 2 0 0 1-2 2h-2"/><circle cx="12" cy="12" r="3"/></svg>',
    brain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 2.8V13a3 3 0 0 0 2 2.8V17a3 3 0 0 0 3 3h1"/><path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 2.8V13a3 3 0 0 1-2 2.8V17a3 3 0 0 1-3 3h-1"/><path d="M12 4v16"/></svg>',
    monitor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    database: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
    shieldAlert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2l8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-4Z"/><path d="M12 8v4M12 16h.01"/></svg>',
    activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    arrowRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2l8 3.5v6c0 5.2-3.4 9-8 10.5-4.6-1.5-8-5.3-8-10.5v-6L12 2z"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61M2 2l20 20"/></svg>'
  };

  var STATS = [
    { label: 'Threats Blocked', value: '1,248', trend: '18.6% vs yesterday', up: true, icon: 'scan', color: 'cyan' },
    { label: 'AI Confidence', value: '99.8%', trend: '2.4% vs yesterday', up: true, icon: 'brain', color: 'purple' },
    { label: 'Endpoints Protected', value: '4,328', trend: '156 vs yesterday', up: true, icon: 'monitor', color: 'blue' },
    { label: 'Events Processed', value: '14.2M', trend: '28.1% vs yesterday', up: true, icon: 'database', color: 'purple' },
    { label: 'Active Incidents', value: '03', trend: '25% vs yesterday', up: false, icon: 'shieldAlert', color: 'purple' },
    { label: 'System Health', value: '98%', trend: '1.6% vs yesterday', up: true, icon: 'activity', color: 'purple' },
  ];

  function buildHero() {
    var hero = document.createElement('div');
    hero.className = 'acis-hero';

    var statsHtml = STATS.map(function (s) {
      return (
        '<div class="acis-stat-card">' +
        '<div class="acis-stat-icon acis-stat-icon--' + s.color + '">' + ICONS[s.icon] + '</div>' +
        '<div class="acis-stat-label">' + s.label + '</div>' +
        '<div class="acis-stat-value">' + s.value + '</div>' +
        '<div class="acis-stat-trend acis-stat-trend--' + (s.up ? 'up' : 'down') + '">' +
        (s.up ? '↑' : '↓') + ' <span>' + s.trend + '</span></div>' +
        '</div>'
      );
    }).join('');

    var mapSvgHtml = 
      '<svg class="acis-world-map-svg" viewBox="0 0 200 110" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<!-- Grid Background -->' +
        '<path d="M 0,20 L 200,20 M 0,40 L 200,40 M 0,60 L 200,60 M 0,80 L 200,80" stroke="rgba(255,255,255,0.03)" stroke-width="0.5"/>' +
        '<path d="M 40,0 L 40,110 M 80,0 L 80,110 M 120,0 L 120,110 M 160,0 L 160,110" stroke="rgba(255,255,255,0.03)" stroke-width="0.5"/>' +
        '<!-- North America -->' +
        '<path d="M 15 15 C 25 12, 35 15, 45 25 C 42 35, 38 42, 28 40 C 22 35, 12 30, 15 15 Z" fill="rgba(96, 165, 250, 0.05)" stroke="rgba(96, 165, 250, 0.15)" stroke-width="0.6"/>' +
        '<!-- South America -->' +
        '<path d="M 32 45 C 38 48, 40 55, 36 75 C 32 80, 28 85, 26 80 C 24 70, 28 55, 32 45 Z" fill="rgba(96, 165, 250, 0.05)" stroke="rgba(96, 165, 250, 0.15)" stroke-width="0.6"/>' +
        '<!-- Africa -->' +
        '<path d="M 80 42 C 95 38, 102 45, 105 58 C 100 70, 92 78, 85 75 C 78 68, 75 52, 80 42 Z" fill="rgba(96, 165, 250, 0.05)" stroke="rgba(96, 165, 250, 0.15)" stroke-width="0.6"/>' +
        '<!-- Eurasia -->' +
        '<path d="M 75 22 C 90 12, 115 15, 145 15 C 160 22, 155 35, 140 42 C 128 38, 110 45, 95 40 C 85 30, 78 28, 75 22 Z" fill="rgba(96, 165, 250, 0.05)" stroke="rgba(96, 165, 250, 0.15)" stroke-width="0.6"/>' +
        '<!-- Australia -->' +
        '<path d="M 148 65 C 158 62, 165 68, 160 75 C 150 78, 142 72, 148 65 Z" fill="rgba(96, 165, 250, 0.05)" stroke="rgba(96, 165, 250, 0.15)" stroke-width="0.6"/>' +
        '<!-- Cyber attack lines -->' +
        '<path d="M 28 28 Q 60 15 95 25" stroke="#60a5fa" stroke-width="0.8" fill="none" stroke-dasharray="2,2" class="acis-map-arc"/>' +
        '<path d="M 95 25 Q 120 45 152 70" stroke="#a78bfa" stroke-width="0.8" fill="none" stroke-dasharray="2,2" class="acis-map-arc"/>' +
        '<path d="M 36 60 Q 60 55 90 58" stroke="#3b82f6" stroke-width="0.8" fill="none" stroke-dasharray="2,2" class="acis-map-arc"/>' +
        '<!-- Cyber attack nodes -->' +
        '<circle cx="28" cy="28" r="1.5" fill="#60a5fa"/>' +
        '<circle cx="95" cy="25" r="1.5" fill="#a78bfa"/>' +
        '<circle cx="152" cy="70" r="1.5" fill="#3b82f6"/>' +
        '<circle cx="36" cy="60" r="1.5" fill="#60a5fa"/>' +
        '<circle cx="90" cy="58" r="1.5" fill="#3b82f6"/>' +
      '</svg>';

    var visualsHtml =
      '<div class="acis-hero-visuals">' +
        '<div class="acis-stat-grid">' + statsHtml + '</div>' +
        '<div class="acis-map-card">' +
          '<div class="acis-map-card-body">' + mapSvgHtml + '</div>' +
          '<div class="acis-map-card-footer">' +
            '<span>ACTIVE NODES: 2,450</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    hero.innerHTML =
      '<div class="acis-hero-bg"></div>' +
      
      '<!-- HUD Top Bar -->' +
      '<div class="acis-hud-top">' +
        '<div class="acis-hud-left">' +
          '<div class="acis-hud-box">' +
            '<div class="acis-hud-row"><span class="acis-hud-label">GLOBAL THREAT LEVEL:</span> <span class="acis-hud-status acis-green">STABLE</span></div>' +
            '<div class="acis-hud-row"><span class="acis-hud-label">WORK INTEGRITY:</span> <div class="acis-hud-bar-bg"><div class="acis-hud-bar-fill" style="width: 99.8%"></div></div> <span class="acis-green font-mono">99.8%</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="acis-hud-center">' +
          '<div class="acis-hud-title">CYBER DEFENSE</div>' +
          '<div class="acis-hud-subtitle">COMMAND CENTER</div>' +
        '</div>' +
        '<div class="acis-hud-right">' +
          '<div class="acis-hud-time-container">' +
            '<span class="acis-hud-time" id="acis-live-time">22:15:06</span>' +
            '<span class="acis-hud-date" id="acis-live-date">14 OCT</span>' +
          '</div>' +
          '<div class="acis-hud-sys-icons">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="acis-hero-content">' +
        '<h1 class="acis-hero-title">Autonomous<br/>Cyber Immune<br/>System</h1>' +
        '<div class="acis-hero-underline"></div>' +
        '<div class="acis-hero-lines">' +
          '<p>' + ICONS.search.replace('<svg ', '<svg class="acis-icon-cyan" ') + 'Real-Time <span class="acis-cyan">Detection.</span></p>' +
          '<p>' + ICONS.settings.replace('<svg ', '<svg class="acis-icon-purple" ') + 'Intelligent <span class="acis-purple">Response.</span></p>' +
          '<p>' + ICONS.shield.replace('<svg ', '<svg class="acis-icon-blue" ') + 'Continuous <span class="acis-blue">Protection.</span></p>' +
        '</div>' +
        visualsHtml +
      '</div>' +
      
      '<!-- Bottom Outlined Heading -->' +
      '<div class="acis-hero-bottom-outline">CYBER DEFENSE COMMAND CENTER</div>';

    return hero;
  }

  function buildCardBg() {
    var bg = document.createElement('div');
    bg.className = 'acis-card-bg';
    bg.innerHTML =
      '<div class="acis-starfield"></div>' +
      '<div class="acis-card-glow"></div>' +
      '<div class="acis-globe">' +
        '<svg class="acis-globe-svg" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">' +
          '<!-- Outer glowing circle -->' +
          '<circle cx="200" cy="200" r="180" stroke="var(--klogin-globe-stroke-1)" stroke-width="1.2" fill="url(#globe-glow)"/>' +
          '<!-- Meridians (vertical ellipses) -->' +
          '<ellipse cx="200" cy="200" rx="180" ry="180" stroke="var(--klogin-globe-stroke-1)" stroke-width="0.8"/>' +
          '<ellipse cx="200" cy="200" rx="140" ry="180" stroke="var(--klogin-globe-stroke-2)" stroke-width="0.8"/>' +
          '<ellipse cx="200" cy="200" rx="90" ry="180" stroke="var(--klogin-globe-stroke-3)" stroke-width="0.8"/>' +
          '<ellipse cx="200" cy="200" rx="40" ry="180" stroke="var(--klogin-globe-stroke-4)" stroke-width="0.8"/>' +
          '<line x1="200" y1="20" x2="200" y2="380" stroke="var(--klogin-globe-stroke-2)" stroke-width="0.8"/>' +
          '<!-- Parallels (horizontal ellipses) -->' +
          '<ellipse cx="200" cy="200" rx="180" ry="140" stroke="var(--klogin-globe-stroke-2)" stroke-width="0.8"/>' +
          '<ellipse cx="200" cy="200" rx="180" ry="90" stroke="var(--klogin-globe-stroke-3)" stroke-width="0.8"/>' +
          '<ellipse cx="200" cy="200" rx="180" ry="40" stroke="var(--klogin-globe-stroke-4)" stroke-width="0.8"/>' +
          '<line x1="20" y1="200" x2="380" y2="200" stroke="var(--klogin-globe-stroke-2)" stroke-width="0.8"/>' +
          '<!-- Tilted rings (orbital rings) -->' +
          '<ellipse cx="200" cy="200" rx="190" ry="60" stroke="var(--klogin-globe-stroke-5)" stroke-width="1.2" transform="rotate(-15 200 200)"/>' +
          '<ellipse cx="200" cy="200" rx="200" ry="80" stroke="var(--klogin-globe-stroke-6)" stroke-width="1.2" transform="rotate(25 200 200)"/>' +
          '<!-- Pulsating grid nodes -->' +
          '<circle cx="200" cy="110" r="3" fill="#60A5FA" class="acis-globe-pulse-node"/>' +
          '<circle cx="290" cy="200" r="3" fill="#A78BFA" class="acis-globe-pulse-node" style="animation-delay: 0.5s;"/>' +
          '<circle cx="110" cy="200" r="3" fill="#3B82F6" class="acis-globe-pulse-node" style="animation-delay: 1s;"/>' +
          '<circle cx="250" cy="290" r="2.5" fill="#60A5FA" class="acis-globe-pulse-node" style="animation-delay: 1.5s;"/>' +
          '<defs>' +
            '<radialGradient id="globe-glow" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">' +
              '<stop offset="0%" stop-color="var(--klogin-globe-radial)"/>' +
              '<stop offset="70%" stop-color="transparent"/>' +
              '<stop offset="100%" stop-color="transparent"/>' +
            '</radialGradient>' +
          '</defs>' +
        '</svg>' +
      '</div>';
    return bg;
  }

  function svgAcisShield() {
    return (
      '<svg class="acis-logo-shield" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M20 4 C20 4, 32 8, 32 18 C32 26, 26 32, 20 36 C14 32, 8 26, 8 18 C8 8, 20 4, 20 4 Z" fill="rgba(59, 130, 246, 0.15)" stroke="#3b82f6" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M20 8 L28 11.5 L28 18 C28 23.5, 24 28, 20 31.5 C16 28, 12 23.5, 12 18 L12 11.5 Z" fill="rgba(96, 165, 250, 0.2)" stroke="#60a5fa" stroke-width="1"/>' +
      '<line x1="20" y1="8" x2="20" y2="31.5" stroke="#60a5fa" stroke-width="1.5"/>' +
      '<path d="M16 16 H24" stroke="#60a5fa" stroke-width="1.5"/>' +
      '</svg>'
    );
  }

  function svgAcisWordmark() {
    return (
      '<svg class="acis-logo-wordmark" viewBox="0 0 160 40" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<text x="10" y="30" font-family="\'Inter\', sans-serif" font-size="32" font-weight="900" letter-spacing="0.05em">' +
      '<tspan fill="var(--klogin-wordmark-net)">ACI</tspan>' +
      '<tspan fill="#3b82f6">S</tspan>' +
      '</text>' +
      '<text x="106" y="14" font-family="\'Inter\', sans-serif" font-size="9" font-weight="700" fill="#3b82f6">TM</text>' +
      '</svg>'
    );
  }

  function injectIcon(input, iconKey) {
    if (!input || input.dataset.acisIconInjected) return;
    var iconSpan = document.createElement('span');
    iconSpan.className = 'acis-input-icon';
    iconSpan.innerHTML = ICONS[iconKey];
    input.parentNode.insertBefore(iconSpan, input);
    input.dataset.acisIconInjected = 'true';
    input.parentNode.style.position = 'relative';
  }

  function buildThemeToggle() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'acis-theme-toggle';
    var current = document.documentElement.getAttribute('data-theme') || 'dark';
    btn.innerHTML = ICONS[current === 'light' ? 'sun' : 'moon'];
    btn.setAttribute('aria-label', 'Toggle light/dark theme');
    btn.addEventListener('click', function () {
      var now = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      setTheme(now);
    });
    return btn;
  }

  function init() {
    if (document.body.dataset.acisThemeApplied) return;
    var loginCard = $('.card-pf');
    if (!loginCard) return;
    document.body.dataset.acisThemeApplied = 'true';

    var shell = document.createElement('div');
    shell.className = 'acis-shell';

    var cardCol = document.createElement('div');
    cardCol.className = 'acis-card-col';

    var header = $('#kc-header-wrapper');

    var cardParent = loginCard.parentNode;
    cardParent.insertBefore(shell, loginCard);
    shell.appendChild(buildHero());
    document.body.appendChild(buildThemeToggle());
    cardCol.appendChild(buildCardBg());
    if (header) {
      header.classList.add('acis-brand');
      cardCol.appendChild(header);
    }
    cardCol.appendChild(loginCard);
    shell.appendChild(cardCol);
    // Dynamic Live Clock in HUD
    function updateClock() {
      var d = new Date();
      var hh = String(d.getHours()).padStart(2, '0');
      var mm = String(d.getMinutes()).padStart(2, '0');
      var ss = String(d.getSeconds()).padStart(2, '0');
      var months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      var day = String(d.getDate()).padStart(2, '0');
      var month = months[d.getMonth()];
      
      var timeEl = document.getElementById('acis-live-time');
      var dateEl = document.getElementById('acis-live-date');
      if (timeEl) timeEl.textContent = hh + ':' + mm + ':' + ss;
      if (dateEl) dateEl.textContent = day + ' ' + month;
    }
    updateClock();
    setInterval(updateClock, 1000);
    if (header) {
      header.innerHTML =
        '<div class="acis-logo-row">' + svgAcisShield() + svgAcisWordmark() + '</div>' +
        '<span class="acis-tagline">AUTONOMOUS CYBER IMMUNE SYSTEM</span>' +
        '<div class="acis-powered-by-container">' +
          '<div class="acis-powered-by-line"></div>' +
          '<div class="acis-powered-by-label">Powered By</div>' +
          '<div class="acis-powered-by-line"></div>' +
        '</div>' +
        '<div class="acis-netcradus-badge"><span class="net">NET</span><span class="cradus">CRADUS</span><sup>TM</sup></div>';
    }

    var isLoginForm = !!$('#kc-form-login');

    if (isLoginForm) {
      var title = $('#kc-page-title');
      if (title) {
        title.textContent = 'Welcome Back!';
        var subtitle = document.createElement('p');
        subtitle.className = 'acis-subtitle';
        subtitle.textContent = 'Sign in to your ACIS Dashboard';
        title.parentNode.insertBefore(subtitle, title.nextSibling);
      }
    }

    var usernameInput = $('#username');
    var passwordInput = $('#password');
    if (isLoginForm) {
      if (usernameInput && !usernameInput.placeholder) usernameInput.placeholder = 'Enter your email address';
      if (passwordInput && !passwordInput.placeholder) passwordInput.placeholder = 'Enter your password';
    }
    injectIcon(usernameInput, 'mail');
    injectIcon(passwordInput, 'lock');

    // Replace the default eye icons with custom Lucide-based SVG icons
    var eyeBtn = $('.pf-v5-c-input-group .pf-v5-c-button.pf-m-control, .pf-c-input-group .pf-c-button.pf-m-control');
    if (eyeBtn && passwordInput) {
      if (!eyeBtn.dataset.acisEyeInjected) {
        var eyeSpan = document.createElement('span');
        eyeSpan.className = 'acis-eye-svg-wrap acis-eye-open';
        eyeSpan.innerHTML = ICONS.eye;
        
        var eyeOffSpan = document.createElement('span');
        eyeOffSpan.className = 'acis-eye-svg-wrap acis-eye-closed';
        eyeOffSpan.innerHTML = ICONS.eyeOff;
        
        eyeBtn.appendChild(eyeSpan);
        eyeBtn.appendChild(eyeOffSpan);
        eyeBtn.dataset.acisEyeInjected = 'true';
      }
      
      var checkEyeState = function () {
        var isVisible = passwordInput.type === 'text';
        var openIcon = $('.acis-eye-open', eyeBtn);
        var closedIcon = $('.acis-eye-closed', eyeBtn);
        if (openIcon && closedIcon) {
          if (isVisible) {
            openIcon.style.display = 'none';
            closedIcon.style.display = 'block';
          } else {
            openIcon.style.display = 'block';
            closedIcon.style.display = 'none';
          }
        }
      };
      
      eyeBtn.addEventListener('click', function () {
        setTimeout(checkEyeState, 50);
      });
      passwordInput.addEventListener('input', checkEyeState);
      checkEyeState();
    }

    if (isLoginForm) {
      var submit = $('#kc-form-buttons input[type="submit"]') || $('#kc-form-buttons button[type="submit"]');
      if (submit && !submit.dataset.acisArrow) {
        var arrow = document.createElement('span');
        arrow.className = 'acis-btn-arrow';
        arrow.innerHTML = ICONS.arrowRight;
        submit.parentNode.style.position = 'relative';
        submit.parentNode.appendChild(arrow);
        submit.dataset.acisArrow = 'true';
      }

      var formEl = $('#kc-form-login');
      if (formEl) {
        var loc = window.location;
        var signupUrl = loc.port === '8443'
          ? loc.protocol + '//' + loc.hostname + '/signup'
          : loc.protocol + '//' + loc.hostname + ':3000/signup';

        var signup = document.createElement('div');
        signup.className = 'acis-signup-link';
        signup.innerHTML = '<span>New to ACIS?</span> <a href="' + signupUrl + '">Create New Account</a>';
        formEl.parentNode.insertBefore(signup, formEl.nextSibling);
      }

      var sparkle = document.createElement('span');
      sparkle.className = 'acis-sparkle acis-sparkle--card';
      sparkle.innerHTML = ICONS.sparkle;
      loginCard.appendChild(sparkle);
    }

    var footer = document.createElement('div');
    footer.className = 'acis-footer';
    footer.innerHTML = '<p>&copy; 2026 Netcradus Pvt Ltd</p><p>Version 1.0.0</p>';
    cardCol.appendChild(footer);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
