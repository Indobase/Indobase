/**
 * Deterministic Continue-with-email chrome for guest sessions.
 * Same /auth/start + /auth/verify as the agent — UI completes the gate if the model stalls.
 */

const AUTH_CHROME_CSS = `
#ib-auth-root { all: initial; font-family: "Segoe UI", ui-sans-serif, system-ui, sans-serif; }
#ib-auth-root * { box-sizing: border-box; }
#ib-auth-modal[hidden], #ib-auth-backdrop[hidden] { display: none !important; }
#ib-auth-backdrop {
  position: fixed; inset: 0; z-index: 2147483001;
  background: rgba(6, 12, 22, .62);
}
#ib-auth-modal {
  position: fixed; z-index: 2147483002;
  left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(420px, calc(100vw - 2rem));
  background: #121a2b; color: #e8eef8;
  border: 1px solid rgba(255,255,255,.1); border-radius: 14px;
  padding: 1.25rem 1.15rem 1.1rem;
  box-shadow: 0 20px 50px rgba(0,0,0,.45);
}
#ib-auth-modal h2 {
  margin: 0 0 .35rem; font-size: 1.15rem; letter-spacing: -.02em; font-weight: 650;
}
#ib-auth-modal p.lead {
  margin: 0 0 1rem; color: #9aa8c0; font-size: .86rem; line-height: 1.45;
}
#ib-auth-modal label {
  display: block; font-size: .72rem; color: #9aa8c0; margin: 0 0 .3rem;
}
#ib-auth-modal input[type="text"],
#ib-auth-modal input[type="email"] {
  width: 100%; margin-bottom: .75rem; padding: .55rem .65rem;
  border-radius: 8px; border: 1px solid rgba(255,255,255,.12);
  background: #0a101c; color: #e8eef8; font-size: .9rem;
}
#ib-auth-modal .row-check {
  display: flex; gap: .5rem; align-items: flex-start;
  margin: .15rem 0 1rem; font-size: .78rem; color: #c5d0e2; line-height: 1.4;
}
#ib-auth-modal .row-check input { margin-top: .15rem; }
#ib-auth-modal a { color: #7eb7e8; }
#ib-auth-modal .actions { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .25rem; }
#ib-auth-modal button {
  appearance: none; border: 0; cursor: pointer; border-radius: 8px;
  padding: .45rem .75rem; font-size: .8rem; font-weight: 650;
}
#ib-auth-modal button.primary { background: #3B8FD6; color: #041018; }
#ib-auth-modal button.secondary {
  background: transparent; color: #e8eef8; border: 1px solid rgba(255,255,255,.14);
}
#ib-auth-modal button:disabled { opacity: .55; cursor: not-allowed; }
#ib-auth-err {
  display: none; margin: 0 0 .75rem; padding: .5rem .65rem;
  border-radius: 8px; background: rgba(220, 80, 80, .15);
  color: #f0b4b4; font-size: .8rem; line-height: 1.4;
}
#ib-auth-err[data-show="1"] { display: block; }
#ib-auth-ok {
  display: none; margin: 0 0 .75rem; padding: .5rem .65rem;
  border-radius: 8px; background: rgba(80, 180, 120, .12);
  color: #9eddb8; font-size: .8rem; line-height: 1.4;
}
#ib-auth-ok[data-show="1"] { display: block; }
`

/**
 * Inject guest auth chrome into proxied CFOS HTML (before </body>).
 */
export function injectAuthChrome(html: string): string {
  const markup = `<style id="ib-auth-chrome-css">${AUTH_CHROME_CSS}</style>
<div id="ib-auth-root">
  <div id="ib-auth-backdrop" hidden></div>
  <div id="ib-auth-modal" hidden role="dialog" aria-modal="true" aria-labelledby="ib-auth-title">
    <h2 id="ib-auth-title">Create your Indobase account</h2>
    <p class="lead" id="ib-auth-lead">Create your Indobase account to launch and keep building.</p>
    <div id="ib-auth-err" role="alert"></div>
    <div id="ib-auth-ok"></div>
    <div id="ib-auth-step-start">
      <label for="ib-auth-name">Name</label>
      <input id="ib-auth-name" type="text" autocomplete="name" maxlength="120" />
      <label for="ib-auth-email">Email</label>
      <input id="ib-auth-email" type="email" autocomplete="email" maxlength="254" />
      <label class="row-check">
        <input id="ib-auth-dpdp" type="checkbox" />
        <span>I agree to the <a href="https://indobase.in/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a> and <a href="https://indobase.in/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> (DPDP).</span>
      </label>
      <div class="actions">
        <button type="button" class="primary" id="ib-auth-send">Send code</button>
        <button type="button" class="secondary" id="ib-auth-close">Not now</button>
      </div>
    </div>
    <div id="ib-auth-step-verify" hidden>
      <label for="ib-auth-token">Verification code</label>
      <input id="ib-auth-token" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="12" />
      <div class="actions">
        <button type="button" class="primary" id="ib-auth-verify">Verify &amp; continue</button>
        <button type="button" class="secondary" id="ib-auth-resend">Resend code</button>
        <button type="button" class="secondary" id="ib-auth-back">Back</button>
      </div>
    </div>
  </div>
</div>
<script>
(function () {
  if (window.__INDOBASE_AUTH_CHROME__) return;
  window.__INDOBASE_AUTH_CHROME__ = true;

  var backdrop = document.getElementById('ib-auth-backdrop');
  var modal = document.getElementById('ib-auth-modal');
  var errEl = document.getElementById('ib-auth-err');
  var okEl = document.getElementById('ib-auth-ok');
  var stepStart = document.getElementById('ib-auth-step-start');
  var stepVerify = document.getElementById('ib-auth-step-verify');
  var nameEl = document.getElementById('ib-auth-name');
  var emailEl = document.getElementById('ib-auth-email');
  var dpdpEl = document.getElementById('ib-auth-dpdp');
  var tokenEl = document.getElementById('ib-auth-token');
  var sendBtn = document.getElementById('ib-auth-send');
  var verifyBtn = document.getElementById('ib-auth-verify');
  var resendBtn = document.getElementById('ib-auth-resend');
  var closeBtn = document.getElementById('ib-auth-close');
  var backBtn = document.getElementById('ib-auth-back');
  var guest = true;
  var cooldownUntil = 0;
  var authPaths = { start: '/auth/start', verify: '/auth/verify' };

  function setErr(msg) {
    if (!errEl) return;
    if (msg) {
      errEl.textContent = msg;
      errEl.setAttribute('data-show', '1');
    } else {
      errEl.textContent = '';
      errEl.removeAttribute('data-show');
    }
  }
  function setOk(msg) {
    if (!okEl) return;
    if (msg) {
      okEl.textContent = msg;
      okEl.setAttribute('data-show', '1');
    } else {
      okEl.textContent = '';
      okEl.removeAttribute('data-show');
    }
  }
  function openModal() {
    if (!guest) return;
    if (backdrop) backdrop.hidden = false;
    if (modal) modal.hidden = false;
    setErr('');
  }
  function closeModal() {
    if (backdrop) backdrop.hidden = true;
    if (modal) modal.hidden = true;
    setErr('');
    setOk('');
  }
  function showVerifyStep(on) {
    if (stepStart) stepStart.hidden = !!on;
    if (stepVerify) stepVerify.hidden = !on;
  }
  function applySession(detail) {
    guest = !!(detail && detail.GUEST);
    if (detail && detail.AUTH) {
      if (detail.AUTH.start) authPaths.start = detail.AUTH.start;
      if (detail.AUTH.verify) authPaths.verify = detail.AUTH.verify;
    }
    if (!guest) closeModal();
  }

  async function readJson(res) {
    try { return await res.json(); } catch (_) { return null; }
  }
  function friendlyFromBody(body, status, fallback) {
    if (!body) return fallback;
    if (body.code === 'rate_limited' || status === 429) {
      var retry = body.retryAfterSeconds;
      if (typeof retry === 'number' && retry > 0) {
        return 'Too many attempts. Please wait ' + Math.ceil(retry) + 's and try again.';
      }
      return body.message || 'Too many attempts. Please wait a moment and try again.';
    }
    if (typeof body.message === 'string' && body.message.trim()) return body.message.trim();
    if (status >= 500) return fallback;
    return fallback;
  }

  async function startOtp() {
    setErr('');
    setOk('');
    var name = (nameEl && nameEl.value || '').trim();
    var email = (emailEl && emailEl.value || '').trim().toLowerCase();
    var dpdp = !!(dpdpEl && dpdpEl.checked);
    if (!name || !email || email.indexOf('@') < 0) {
      setErr('Enter your name and a valid email.');
      return;
    }
    if (!dpdp) {
      setErr('Accept the Privacy Policy and Terms to continue.');
      return;
    }
    var now = Date.now();
    if (now < cooldownUntil) {
      var wait = Math.ceil((cooldownUntil - now) / 1000);
      setErr('Please wait ' + wait + 's before requesting another code.');
      return;
    }
    if (sendBtn) sendBtn.disabled = true;
    if (resendBtn) resendBtn.disabled = true;
    try {
      var res = await fetch(authPaths.start, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ name: name, email: email, dpdpConsent: true }),
      });
      var body = await readJson(res);
      if (!res.ok || (body && body.ok === false)) {
        setErr(friendlyFromBody(body, res.status, "Couldn't send the verification email. Please try again shortly."));
        return;
      }
      cooldownUntil = Date.now() + 60000;
      setOk('Code sent to ' + ((body && body.email) || email) + '. Check your inbox.');
      showVerifyStep(true);
      if (tokenEl) tokenEl.focus();
    } catch (_) {
      setErr("Couldn't reach Indobase. Check your connection and try again.");
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      if (resendBtn) resendBtn.disabled = false;
    }
  }

  async function verifyOtp() {
    setErr('');
    setOk('');
    var name = (nameEl && nameEl.value || '').trim();
    var email = (emailEl && emailEl.value || '').trim().toLowerCase();
    var token = (tokenEl && tokenEl.value || '').trim();
    if (!token) {
      setErr('Enter the verification code from your email.');
      return;
    }
    if (verifyBtn) verifyBtn.disabled = true;
    try {
      var res = await fetch(authPaths.verify, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ name: name, email: email, token: token }),
      });
      var body = await readJson(res);
      if (!res.ok || (body && body.ok === false)) {
        setErr(friendlyFromBody(body, res.status, 'Invalid or expired code. Request a new one and try again.'));
        return;
      }
      setOk('Signed in. Reloading your workspace…');
      guest = false;
      setTimeout(function () { window.location.reload(); }, 400);
    } catch (_) {
      setErr("Couldn't verify right now. Try again in a moment.");
    } finally {
      if (verifyBtn) verifyBtn.disabled = false;
    }
  }

  if (backdrop) backdrop.addEventListener('click', closeModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (backBtn) backBtn.addEventListener('click', function () { showVerifyStep(false); setErr(''); });
  if (sendBtn) sendBtn.addEventListener('click', startOtp);
  if (resendBtn) resendBtn.addEventListener('click', startOtp);
  if (verifyBtn) verifyBtn.addEventListener('click', verifyOtp);
  if (tokenEl) {
    tokenEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') verifyOtp();
    });
  }

  window.addEventListener('indobase:context', function (ev) {
    applySession(ev && ev.detail ? ev.detail : null);
  });
  window.addEventListener('indobase:open-auth', function () {
    openModal();
  });
  window.__INDOBASE_OPEN_AUTH__ = openModal;

  // Prefer session pulled by bootstrap; fall back to a direct check.
  if (window.__INDOBASE_SESSION_STAGE__ === 'member' || window.__INDOBASE_GUEST__ === false) {
    applySession({ GUEST: false, AUTH: window.__INDOBASE_AUTH__ || authPaths });
  } else if (window.__INDOBASE_GUEST__ === true || window.__INDOBASE_ONBOARDING__) {
    applySession({
      GUEST: true,
      AUTH: (window.__INDOBASE__ && window.__INDOBASE__.AUTH) || window.__INDOBASE_AUTH__ || authPaths,
    });
  }

  try {
    var qs = new URLSearchParams(window.location.search || '');
    if (qs.get('open_auth') === '1') openModal();
  } catch (_) {}
})();
</script>`

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${markup}</body>`)
  }
  return `${html}${markup}`
}
