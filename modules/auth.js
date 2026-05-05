// ══════════════════════════════════════════
// auth.js — Authentication
// Handles: login, signup, logout,
// auth state listener, user display
// ══════════════════════════════════════════

import { state }  from './state.js';
import { auth }   from './firebase.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { loadSessions } from './sessions.js';


// ── AUTH STATE LISTENER ──────────────────
// Runs on page load — shows app or login page
export function initAuth() {
  onAuthStateChanged(auth, function(user) {
    if (user) {
      state.currentUser = user;
      const displayName = user.displayName || 'User';
      const initials    = displayName.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
      state.userInitial = initials.substring(0, 1);

      document.getElementById('user-name').textContent     = displayName;
      document.getElementById('user-email').textContent    = user.email;
      document.getElementById('user-initials').textContent = initials;

      document.getElementById('login-page').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      loadSessions();
    } else {
      state.currentUser = null;
      document.getElementById('app').classList.add('hidden');
      document.getElementById('login-page').classList.remove('hidden');
    }
  });
}


// ── SIGN UP ──────────────────────────────
window.doSignup = async function() {
  const name      = document.getElementById('signup-name').value.trim();
  const email     = document.getElementById('signup-email').value.trim();
  const password  = document.getElementById('signup-password').value;
  const errorEl   = document.getElementById('signup-error');

  if (!name || !email || !password) { errorEl.textContent = 'Please fill in all fields.'; return; }
  if (password.length < 6)          { errorEl.textContent = 'Password must be at least 6 characters.'; return; }
  errorEl.textContent = '';

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCredential.user, { displayName: name });
    // onAuthStateChanged handles showing the app
  } catch (error) {
    if      (error.code === 'auth/email-already-in-use') errorEl.textContent = 'This email is already registered. Please sign in.';
    else if (error.code === 'auth/invalid-email')        errorEl.textContent = 'Invalid email address.';
    else                                                  errorEl.textContent = 'Error: ' + error.message;
  }
};


// ── SIGN IN ──────────────────────────────
window.doLogin = async function() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl  = document.getElementById('login-error');

  if (!email || !password) { errorEl.textContent = 'Please enter your email and password.'; return; }
  errorEl.textContent = '';

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    if      (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') errorEl.textContent = 'Incorrect email or password.';
    else if (error.code === 'auth/user-not-found')    errorEl.textContent = 'No account found. Please sign up first.';
    else                                               errorEl.textContent = 'Error: ' + error.message;
  }
};


// ── SIGN OUT ─────────────────────────────
window.doLogout = async function() {
  await signOut(auth);
  state.messages         = [];
  state.currentSessionId = null;
  document.getElementById('sessions-list').innerHTML = '';
  document.getElementById('chat-area').innerHTML     = '';
};


// ── LOGIN PAGE TOGGLE ────────────────────
window.showSignup = function() {
  document.getElementById('signin-form').classList.add('hidden');
  document.getElementById('signup-form').classList.remove('hidden');
};

window.showSignin = function() {
  document.getElementById('signup-form').classList.add('hidden');
  document.getElementById('signin-form').classList.remove('hidden');
};