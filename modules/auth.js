// ══════════════════════════════════════════
// auth.js — Authentication
// Imports: state, firebase, sessions, ui
// ══════════════════════════════════════════

import { state }  from './state.js';
import { auth }   from './firebase.js';
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
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