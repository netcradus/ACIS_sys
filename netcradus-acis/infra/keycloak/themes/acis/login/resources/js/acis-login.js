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
        (s.up ? ICONS.up : ICONS.down) + '<span>' + s.trend + '</span></div>' +
        '</div>'
      );
    }).join('');

    hero.innerHTML =
      '<div class="acis-hero-bg"></div>' +
      '<div class="acis-hero-content">' +
      '<h1 class="acis-hero-title">Autonomous<br/>Cyber Immune<br/>System</h1>' +
      '<div class="acis-hero-underline"></div>' +
      '<div class="acis-hero-lines">' +
      '<p>' + ICONS.search.replace('<svg ', '<svg class="acis-icon-cyan" ') + 'Real-Time <span class="acis-cyan">Detection.</span></p>' +
      '<p>' + ICONS.settings.replace('<svg ', '<svg class="acis-icon-purple" ') + 'Intelligent <span class="acis-purple">Response.</span></p>' +
      '<p>' + ICONS.shield.replace('<svg ', '<svg class="acis-icon-blue" ') + 'Continuous <span class="acis-blue">Protection.</span></p>' +
      '</div>' +
      '<div class="acis-stat-grid">' + statsHtml + '</div>' +
      '</div>';

    return hero;
  }

  // Dark-mode-only backdrop for the card column — starfield + a CSS-drawn
  // wireframe globe accent (concentric tilted rings around a soft sphere
  // glow), no image asset needed. Sits behind the logo/badge/card stack.
  // Hidden in light mode (see acis-login.css) in favor of a clean flat
  // background — a glowing starfield doesn't read well against a light
  // surface, so light mode intentionally skips it rather than forcing it.
  function buildCardBg() {
    var bg = document.createElement('div');
    bg.className = 'acis-card-bg';
    bg.innerHTML =
      '<div class="acis-starfield"></div>' +
      '<div class="acis-card-glow"></div>' +
      '<div class="acis-globe">' +
      '<div class="acis-globe-sphere"></div>' +
      '<div class="acis-globe-ring acis-globe-ring--lat1"></div>' +
      '<div class="acis-globe-ring acis-globe-ring--lat2"></div>' +
      '<div class="acis-globe-ring acis-globe-ring--lat3"></div>' +
      '<div class="acis-globe-ring acis-globe-ring--merid"></div>' +
      '<div class="acis-globe-dot acis-globe-dot--1"></div>' +
      '<div class="acis-globe-dot acis-globe-dot--2"></div>' +
      '<div class="acis-globe-dot acis-globe-dot--3"></div>' +
      '</div>';
    return bg;
  }

  function svgAcisShield() {
    return (
      '<svg class="acis-logo-shield" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M20 3l13 5.5V19c0 8.7-5.6 15-13 17.5C12.6 34 7 27.7 7 19V8.5L20 3Z" fill="rgba(59,130,246,0.08)" stroke="var(--klogin-accent-light)" stroke-width="1.6"/>' +
      '<path d="M13.5 19.5l4 4 9-9" stroke="var(--klogin-accent-light)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>'
    );
  }

  function svgAcisWordmark() {
    // Fill colors reference the same CSS custom properties acis-login.css
    // defines, valid since this SVG is inline in the document (not a
    // standalone external asset), so CSS variable inheritance applies —
    // this is also how the wordmark's "NET"-equivalent stroke automatically
    // flips from white to near-black between dark/light mode with no JS.
    return (
      '<svg class="acis-logo-wordmark" viewBox="0 0 150 46" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M15 40L28 6H37L24 40H15Z" fill="var(--klogin-wordmark-net)"/>' +
      '<path d="M25 15L35 40H44L31 6L25 15Z" fill="var(--klogin-accent-light)"/>' +
      '<text x="50" y="34" fill="var(--klogin-wordmark-net)" font-weight="800" font-size="30" font-family="Inter, system-ui, sans-serif" letter-spacing="-0.02em">CIS</text>' +
      '<text x="108" y="16" fill="var(--klogin-accent-light)" font-weight="700" font-size="7" font-family="Inter, system-ui, sans-serif">TM</text>' +
      '</svg>'
    );
  }

  function wrapInputWithIcon(input, iconKey) {
    if (!input || input.dataset.acisWrapped) return;
    var wrap = document.createElement('div');
    wrap.className = 'acis-input-wrap';
    input.parentNode.insertBefore(wrap, input);
    var iconSpan = document.createElement('span');
    iconSpan.className = 'acis-input-icon';
    iconSpan.innerHTML = ICONS[iconKey];
    wrap.appendChild(iconSpan);
    wrap.appendChild(input);
    input.dataset.acisWrapped = 'true';
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
    // `.card-pf` is the real whole-card container (header + title + form).
    // NOTE: `#kc-login` is NOT the card — in the classic Keycloak theme
    // that ID belongs to the submit *button* itself, so it must never be
    // used as the "card" reference or only the button gets relocated.
    var loginCard = $('.card-pf');
    if (!loginCard) return; // Not the login form screen (e.g. an error page) — leave it alone.

    var shell = document.createElement('div');
    shell.className = 'acis-shell';

    var cardCol = document.createElement('div');
    cardCol.className = 'acis-card-col';

    // The branded header sits as a sibling BEFORE `.card-pf`, not inside
    // it — move it into the card column too, ahead of the card, so both
    // end up stacked correctly inside the same column.
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

    // Re-brand the header (was plain realm display name text).
    if (header) {
      header.innerHTML =
        '<div class="acis-logo-row">' + svgAcisShield() + svgAcisWordmark() + '</div>' +
        '<span class="acis-tagline">AUTONOMOUS CYBER IMMUNE <span class="acis-tagline-accent">SYSTEM</span></span>' +
        '<div class="acis-powered-by-label">Powered By</div>' +
        '<div class="acis-netcradus-badge"><span class="net">NET</span><span class="cradus">CRADUS</span><sup>TM</sup></div>';
    }

    // Several Keycloak screens share this exact card/header markup — forgot
    // password (#kc-reset-password-form), OTP setup, update-password,
    // error pages, etc. — not just the real login form (#kc-form-login,
    // unique to login.ftl). The "Welcome Back!" retitle, the login-specific
    // placeholders, the submit arrow, and the decorative social buttons are
    // only correct on the actual login screen; everywhere else Keycloak's
    // own real title/message ("Forgot your password?", etc.) must stay
    // untouched, or e.g. the password-reset page would misleadingly show a
    // "Continue with Microsoft/Google" option that makes no sense there.
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

    // Icons inside the existing, untouched input fields — safe on every
    // screen that happens to have these fields (e.g. forgot-password also
    // has #username), since it's purely cosmetic wrapping.
    var usernameInput = $('#username');
    var passwordInput = $('#password');
    if (isLoginForm) {
      if (usernameInput && !usernameInput.placeholder) usernameInput.placeholder = 'Enter your email address';
      if (passwordInput && !passwordInput.placeholder) passwordInput.placeholder = 'Enter your password';
    }
    wrapInputWithIcon(usernameInput, 'mail');
    wrapInputWithIcon(passwordInput, 'lock');

    if (isLoginForm) {
      // Submit button gets an arrow icon appended (label text untouched).
      var submit = $('#kc-form-buttons input[type="submit"]') || $('#kc-form-buttons button[type="submit"]');
      if (submit && !submit.dataset.acisArrow) {
        var arrow = document.createElement('span');
        arrow.className = 'acis-btn-arrow';
        arrow.innerHTML = ICONS.arrowRight;
        submit.parentNode.style.position = 'relative';
        submit.parentNode.appendChild(arrow);
        submit.dataset.acisArrow = 'true';
      }

      // "Create New Account" — deliberately NOT Keycloak's native
      // registration link. Self-service signup here means provisioning a
      // brand-new tenant (company-admin + tenant_id), which Keycloak's own
      // registration form has no concept of — it only creates a bare user.
      // That logic lives in the real ACIS app (new /signup page + backend
      // endpoint), so this link sends the visitor there instead.
      var formEl = $('#kc-form-login');
      if (formEl) {
        // Must be an absolute URL: this script runs on a page served BY
        // Keycloak itself, so a relative "/signup" resolves against
        // Keycloak's own origin, not the frontend app's. Keycloak always
        // runs on :8443 with the app on the same host's default HTTPS port
        // in production (infra/caddy/Caddyfile), and on :8180 with the app
        // on :3000 in local dev (infra/docker-compose.yml, vite.config.ts).
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

    // Footer.
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
