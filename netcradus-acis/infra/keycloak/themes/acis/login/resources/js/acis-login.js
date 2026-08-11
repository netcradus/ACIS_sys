/**
 * ACIS branded Keycloak login page — pure DOM/CSS enhancement layer.
 * Recreates the exact layout from the provided HTML template.
 */
(function () {
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
    try { window.localStorage.setItem(THEME_KEY, theme); } catch (e) { }
    var btn = document.querySelector('.acis-theme-toggle');
    if (btn) btn.innerHTML = ICONS[theme === 'light' ? 'sun' : 'moon'];
  }

  applyTheme(getStoredTheme() || getSystemTheme());

  function $(sel, root) { return (root || document).querySelector(sel); }

  var ICONS = {
    mail: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18v12H3z"/><path d="M3 6l9 7 9-7"/></svg>',
    lock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    eye: '<svg class="acis-eye-svg-wrap acis-eye-open" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg class="acis-eye-svg-wrap acis-eye-closed" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61M2 2l20 20"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/></svg>'
  };

  var STATS = [
    { label: 'Threats Blocked', value: '1,248', trend: '18.6% vs yesterday', up: true, color: 'teal', icon: '&#9678;' },
    { label: 'AI Confidence', value: '99.8%', trend: '2.4% vs yesterday', up: true, color: 'purple', icon: '&#129504;' },
    { label: 'Endpoints Protected', value: '4,328', trend: '156 vs yesterday', up: true, color: 'blue', icon: '&#128421;' },
    { label: 'Events Processed', value: '14.2M', trend: '28.1% vs yesterday', up: true, color: 'plain', icon: '&#128451;' },
    { label: 'Active Incidents', value: '03', trend: '25% vs yesterday', up: false, color: 'plain', icon: '&#128737;' },
    { label: 'System Health', value: '98%', trend: '1.6% vs yesterday', up: true, color: 'plain', icon: '&#128200;' }
  ];

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

    // 1. Create outer scene wrapper
    var scene = document.createElement('div');
    scene.className = 'scene';

    // 2. Inject Left decorative elements
    var topbar = document.createElement('div');
    topbar.className = 'topbar';
    scene.appendChild(topbar);

    var worldmap = document.createElement('div');
    worldmap.className = 'worldmap';
    scene.appendChild(worldmap);

    var headerTitleTop = document.createElement('div');
    headerTitleTop.className = 'header-title';
    headerTitleTop.innerHTML = 'CYBER DEFENSE<br>COMMAND CENTER';
    scene.appendChild(headerTitleTop);

    var headerTitleBottom = document.createElement('div');
    headerTitleBottom.className = 'header-title bottom';
    headerTitleBottom.innerHTML = 'CYBER DEFENSE<br>COMMAND CENTER';
    scene.appendChild(headerTitleBottom);

    var clockLock = document.createElement('div');
    clockLock.className = 'clock-lock';
    clockLock.innerHTML = 
      '<div class="time" id="acis-live-clock-container">22:15<br><span style="font-weight:500;color:#7d8bab;">14 OCT</span></div>' +
      '<div class="icon">&#9632;</div>' +
      '<div class="icon">&#128274;</div>';
    scene.appendChild(clockLock);

    var statusBox = document.createElement('div');
    statusBox.className = 'status-box';
    statusBox.innerHTML = 
      '<div class="status-row">' +
        '<div class="status-label">GLOBAL THREAT LEVEL: <b>STABLE</b></div>' +
        '<div class="bar-track"><div class="bar-fill cyan"></div></div>' +
      '</div>' +
      '<div class="status-row">' +
        '<div class="status-label">WORK INTEGRITY: <b>99.8%</b></div>' +
        '<div class="bar-track"><div class="bar-fill purple"></div></div>' +
      '</div>';
    scene.appendChild(statusBox);

    // 3. Left Hero Column Content
    var hero = document.createElement('div');
    hero.className = 'hero';

    var statsHtml = STATS.map(function (s) {
      var deltaClass = s.up ? 'up' : 'down';
      var deltaSymbol = s.up ? '↑' : '↓';
      return (
        '<div class="card ' + s.color + '">' +
          '<div class="card-icon">' + s.icon + '</div>' +
          '<div class="card-label">' + s.label + '</div>' +
          '<div class="card-value">' + s.value + '</div>' +
          '<div class="card-delta ' + deltaClass + '">' + deltaSymbol + ' ' + s.trend + '</div>' +
        '</div>'
      );
    }).join('');

    hero.innerHTML = 
      '<h1>Autonomous<br>Cyber Immune<br>System</h1>' +
      '<div class="underline"></div>' +
      '<div class="feature-list">' +
        '<div><span class="ficon">&#128269;</span>Real-Time <span>Detection.</span></div>' +
        '<div><span class="ficon">&#9881;</span>Intelligent <span>Response.</span></div>' +
        '<div><span class="ficon">&#128737;</span>Continuous <span>Protection.</span></div>' +
      '</div>' +
      '<div class="stats">' + statsHtml + '</div>';
    scene.appendChild(hero);

    // 4. Mini Map Card
    var miniMap = document.createElement('div');
    miniMap.className = 'mini-map';
    miniMap.innerHTML = 
      '<svg viewBox="0 0 280 150">' +
        '<rect width="280" height="150" fill="#0c1120"/>' +
        '<path d="M40 100 Q 100 40 160 60 T 240 40" stroke="#3b82f6" stroke-width="1" fill="none" opacity="0.6"/>' +
        '<path d="M50 110 Q 120 70 200 50" stroke="#ec4899" stroke-width="1" fill="none" opacity="0.7"/>' +
        '<circle cx="50" cy="110" r="4" fill="#22d3ee"/>' +
        '<circle cx="200" cy="50" r="4" fill="#ec4899"/>' +
        '<circle cx="160" cy="60" r="3" fill="#ec4899"/>' +
        '<circle cx="240" cy="40" r="3" fill="#22d3ee"/>' +
      '</svg>';
    scene.appendChild(miniMap);

    // 5. Active Nodes bar
    var activeNodes = document.createElement('div');
    activeNodes.className = 'active-nodes';
    activeNodes.innerHTML = 
      'ACTIVE NODES: <b>2,450</b>' +
      '<div class="nodes-bar"><div></div></div>';
    scene.appendChild(activeNodes);

    // 6. Right Side panel
    var right = document.createElement('div');
    right.className = 'right';

    var globeWrap = document.createElement('div');
    globeWrap.className = 'globe-wrap';
    right.appendChild(globeWrap);

    var rightCenter = document.createElement('div');
    rightCenter.style.cssText = 'position:relative; z-index:5; display:flex; flex-direction:column; align-items:center;';
    right.appendChild(rightCenter);

    // Brand header info
    var brand = document.createElement('div');
    brand.className = 'brand';
    brand.innerHTML = 
      '<div class="brand-row">' +
        '<svg class="shield" viewBox="0 0 24 24" fill="none">' +
          '<path d="M12 2 L21 5 V11 C21 16.5 17 20.5 12 22 C7 20.5 3 16.5 3 11 V5 Z" fill="url(#g)" stroke="#5b9dff" stroke-width="1"/>' +
          '<circle cx="12" cy="11" r="4" stroke="#fff" stroke-width="1.4" fill="none"/>' +
          '<line x1="15" y1="14" x2="18" y2="17" stroke="#fff" stroke-width="1.4"/>' +
          '<defs>' +
            '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
              '<stop offset="0" stop-color="#274a86"/>' +
              '<stop offset="1" stop-color="#0f1c33"/>' +
            '</linearGradient>' +
          '</defs>' +
        '</svg>' +
        '<div class="brand-name">ACIS<span class="tm">™</span></div>' +
      '</div>' +
      '<div class="brand-sub">AUTONOMOUS CYBER IMMUNE <span class="accent">SYSTEM</span></div>' +
      '<div class="powered">' +
        '<div class="powered-label">POWERED BY</div>' +
        '<div class="powered-badge">NET<b>CRADUS</b>™</div>' +
      '</div>';
    rightCenter.appendChild(brand);

    // Put container in place of Keycloak card, then put Keycloak card in .right panel
    var cardParent = loginCard.parentNode;
    cardParent.insertBefore(scene, loginCard);

    // Apply exact template card class
    loginCard.className = 'login-card';
    rightCenter.appendChild(loginCard);
    scene.appendChild(right);

    // Inject theme toggle button
    document.body.appendChild(buildThemeToggle());

    // Live clock ticker function
    function updateClock() {
      var d = new Date();
      var hh = String(d.getHours()).padStart(2, '0');
      var mm = String(d.getMinutes()).padStart(2, '0');
      var months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      var day = String(d.getDate()).padStart(2, '0');
      var month = months[d.getMonth()];
      var clockEl = document.getElementById('acis-live-clock-container');
      if (clockEl) {
        clockEl.innerHTML = hh + ':' + mm + '<br><span style="font-weight:500;color:#7d8bab;">' + day + ' ' + month + '</span>';
      }
    }
    updateClock();
    setInterval(updateClock, 1000);

    // Wrap elements inside Keycloak Form to fit the user's template structure
    var isLoginForm = !!$('#kc-form-login');

    if (isLoginForm) {
      // Create login header inside card
      var title = $('#kc-page-title');
      if (title) {
        title.style.display = 'none';
      }
      var loginHead = document.createElement('div');
      loginHead.className = 'login-head';
      loginHead.innerHTML = '<h2>Welcome Back!</h2><p>Sign in to your ACIS Dashboard</p>';
      loginCard.insertBefore(loginHead, loginCard.firstChild);
    }

    var usernameInput = $('#username');
    var passwordInput = $('#password');

    if (isLoginForm) {
      if (usernameInput && !usernameInput.placeholder) usernameInput.placeholder = 'Enter your email address';
      if (passwordInput && !passwordInput.placeholder) passwordInput.placeholder = 'Enter your password';
    }

    // Wrap Username/Email Input inside a custom .input-wrap container
    if (usernameInput) {
      var userWrap = document.createElement('div');
      userWrap.className = 'input-wrap';
      usernameInput.parentNode.insertBefore(userWrap, usernameInput);
      
      var mailSpan = document.createElement('span');
      mailSpan.style.display = 'inline-flex';
      mailSpan.innerHTML = ICONS.mail;
      userWrap.appendChild(mailSpan);
      userWrap.appendChild(usernameInput);

      usernameInput.addEventListener('focus', function () { userWrap.classList.add('focused'); });
      usernameInput.addEventListener('blur', function () { userWrap.classList.remove('focused'); });
      usernameInput.dataset.acisIconInjected = 'true';
    }

    // Add .input-wrap and lock icon to Password's input group container
    var passwordGroup = $('.pf-v5-c-input-group, .pf-c-input-group');
    if (passwordInput && passwordGroup) {
      passwordGroup.className = 'input-wrap';
      
      var lockSpan = document.createElement('span');
      lockSpan.style.display = 'inline-flex';
      lockSpan.innerHTML = ICONS.lock;
      passwordGroup.insertBefore(lockSpan, passwordGroup.firstChild);

      passwordInput.addEventListener('focus', function () { passwordGroup.classList.add('focused'); });
      passwordInput.addEventListener('blur', function () { passwordGroup.classList.remove('focused'); });
      passwordInput.dataset.acisIconInjected = 'true';
    }

    // Replace the default eye icons with custom Lucide-based SVG icons
    var eyeBtn = $('.pf-v5-c-input-group .pf-v5-c-button.pf-m-control, .pf-c-input-group .pf-c-button.pf-m-control, .input-wrap .pf-v5-c-button.pf-m-control, .input-wrap .pf-c-button.pf-m-control');
    if (eyeBtn && passwordInput) {
      if (!eyeBtn.dataset.acisEyeInjected) {
        eyeBtn.innerHTML = ''; // clear native contents
        
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
      var submitBtn = $('#kc-form-buttons input[type="submit"]') || $('#kc-form-buttons button[type="submit"]');
      if (submitBtn) {
        submitBtn.className = 'login-btn';
        submitBtn.value = 'Login →';
      }

      var formEl = $('#kc-form-login');
      if (formEl) {
        var loc = window.location;
        var signupUrl = loc.port === '8443'
          ? loc.protocol + '//' + loc.hostname + '/signup'
          : loc.protocol + '//' + loc.hostname + ':3000/signup';

        var signup = document.createElement('div');
        signup.className = 'signup';
        signup.innerHTML = 'New to ACIS? <a href="' + signupUrl + '">Create New Account</a>';
        formEl.parentNode.insertBefore(signup, formEl.nextSibling);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
