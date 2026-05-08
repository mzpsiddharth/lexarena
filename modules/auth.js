// ══════════════════════════════════════════
// auth.js — Authentication
// Imports: state, firebase, sessions, ui
// ══════════════════════════════════════════

import { state }  from './state.js';
import { auth, db }   from './firebase.js';
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { loadSessions } from './sessions.js';
import { clearChatArea, showWelcomeScreen } from './ui.js';


export function initAuth() {
  onAuthStateChanged(auth, function(user) {
    if (user) {
      state.currentUser = user;
      const name     = user.displayName || 'User';
      const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
      state.userInitial = initials[0];

      document.getElementById('user-name').textContent     = name;
      document.getElementById('user-email').textContent    = user.email;
      document.getElementById('user-initials').textContent = initials;

      document.getElementById('login-page').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      loadSessions();
      showDisclaimerIfNeeded(user.uid);
    } else {
      state.currentUser = null;
      document.getElementById('app').classList.add('hidden');
      document.getElementById('login-page').classList.remove('hidden');
    }
  });
}


window.doSignup = async function() {
  const name     = document.getElementById('signup-name').value.trim();
  const email    = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const errorEl  = document.getElementById('signup-error');

  if (!name || !email || !password) { errorEl.textContent = 'Please fill in all fields.'; return; }
  if (password.length < 6)          { errorEl.textContent = 'Password must be at least 6 characters.'; return; }
  errorEl.textContent = '';

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
  } catch (e) {
    if      (e.code === 'auth/email-already-in-use') errorEl.textContent = 'This email is already registered. Please sign in.';
    else if (e.code === 'auth/invalid-email')        errorEl.textContent = 'Invalid email address.';
    else                                              errorEl.textContent = 'Error: ' + e.message;
  }
};


window.doLogin = async function() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl  = document.getElementById('login-error');

  if (!email || !password) { errorEl.textContent = 'Please enter your email and password.'; return; }
  errorEl.textContent = '';

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    if      (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password') errorEl.textContent = 'Incorrect email or password.';
    else if (e.code === 'auth/user-not-found')    errorEl.textContent = 'No account found. Please sign up first.';
    else                                           errorEl.textContent = 'Error: ' + e.message;
  }
};


window.doLogout = async function() {
  await signOut(auth);
  state.messages         = [];
  state.currentSessionId = null;
  state.caseSummary      = '';
  state.messagesSinceLastSummary = 0;

  document.getElementById('sessions-list').innerHTML = '';
  document.getElementById('session-title-display').textContent = 'Select a session';
  document.getElementById('arg-counter').classList.add('hidden');

  clearChatArea();
  showWelcomeScreen();
};


window.showSignup = function() {
  document.getElementById('signin-form').classList.add('hidden');
  document.getElementById('signup-form').classList.remove('hidden');
};
window.showSignin = function() {
  document.getElementById('signup-form').classList.add('hidden');
  document.getElementById('signin-form').classList.remove('hidden');
};


// ── DISCLAIMER ────────────────────────────
// Checks Firestore first (survives device/browser changes).
// Falls back to localStorage as a fast-path to avoid a Firestore
// read on every login for users who have already accepted.
async function showDisclaimerIfNeeded(uid) {
  // Fast path: localStorage says already accepted on this browser
  if (localStorage.getItem('lexarena_disclaimer_v1')) return;

  // Authoritative check: Firestore (works across devices)
  try {
    const prefDoc = await getDoc(doc(db, 'userPrefs', uid));
    if (prefDoc.exists() && prefDoc.data().disclaimerAccepted) {
      // Sync to localStorage so future logins skip the Firestore read
      localStorage.setItem('lexarena_disclaimer_v1', '1');
      return;
    }
  } catch (e) {
    // If Firestore read fails, fall through and show the disclaimer anyway
    console.warn('[LexArena] Could not check disclaimer status:', e);
  }

  showDisclaimerModal(uid);
}

function showDisclaimerModal(uid) {
  const overlay = document.createElement('div');
  overlay.className    = 'modal-overlay';
  overlay.style.zIndex = '500';
  overlay.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div style="font-size:32px;margin-bottom:12px;text-align:center">⚖️</div>
      <div class="modal-title" style="margin-bottom:8px;text-align:center">Before you begin</div>

      <div style="background:rgba(201,169,110,0.08);border:1px solid rgba(201,169,110,0.25);
        border-radius:10px;padding:16px;margin-bottom:20px">
        <div style="font-size:12px;color:var(--accent);font-weight:600;letter-spacing:1px;
          text-transform:uppercase;margin-bottom:10px">⚠ Important disclaimer</div>
        <div style="font-size:13px;color:var(--text2);line-height:1.8">
          LexArena is an <strong style="color:var(--text)">AI-powered practice tool</strong>,
          not a source of legal advice.<br><br>
          • AI-generated case citations and section references <strong style="color:var(--text)">may be inaccurate</strong>
            — always verify against official sources (bare acts, SCC Online, Manupatra).<br><br>
          • Arguments and feedback are for <strong style="color:var(--text)">practice and learning only</strong>
            — do not rely on them for actual legal proceedings.<br><br>
          • This platform is intended for <strong style="color:var(--text)">law students and junior advocates</strong>
            for educational purposes.
        </div>
      </div>

      <div style="font-size:12px;color:var(--text3);text-align:center;margin-bottom:16px;line-height:1.6">
        By continuing you acknowledge this is a practice tool and not a substitute for professional legal research.
      </div>

      <button class="btn-primary" id="disclaimer-accept-btn" style="width:100%">
        I understand — start practising →
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('disclaimer-accept-btn').addEventListener('click', async function() {
    this.disabled    = true;
    this.textContent = 'Saving...';

    // Persist to Firestore so this follows the user across devices
    try {
      await setDoc(doc(db, 'userPrefs', uid), {
        disclaimerAccepted:   true,
        disclaimerAcceptedAt: new Date()
      }, { merge: true });
    } catch (e) {
      // Non-fatal — localStorage backup still works
      console.warn('[LexArena] Could not save disclaimer to Firestore:', e);
    }

    // Always set localStorage regardless of Firestore result
    localStorage.setItem('lexarena_disclaimer_v1', '1');
    overlay.remove();
  });
}