// ══════════════════════════════════════════
// ui.js — All DOM rendering & UI helpers
// Handles: messages, typing indicator,
// role switching, modal, keyboard,
// mobile sidebar, welcome screen, toast,
// arg counter, escape helper
// ══════════════════════════════════════════

import { state } from './state.js';

// ── SECURITY HELPER ──────────────────────
export function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}


// ── MESSAGE RENDERER ─────────────────────
export function addMessageToChat(role, text, feedback) {
  const chatArea = document.getElementById('chat-area');
  const msgDiv   = document.createElement('div');
  const roleLabels = { opposing: 'Opposing counsel', judge: 'Judge', supporting: 'Supporting counsel' };

  if (role === 'user') {
    msgDiv.className = 'msg msg-user';
    msgDiv.innerHTML = `
      <div>
        <div class="msg-bubble user-bubble">${escapeHtml(text)}</div>
      </div>
      <div class="msg-avatar user-av">${state.userInitial || 'U'}</div>
    `;
  } else {
    let feedbackHtml = '';
    if (feedback && (feedback.good || feedback.gap || feedback.tip)) {
      feedbackHtml = `
        <div class="feedback-block">
          <div class="feedback-title">⚡ Argument analysis</div>
          ${feedback.good ? `<div class="feedback-row"><div class="dot dot-good"></div><div class="feedback-text">✓ ${escapeHtml(feedback.good)}</div></div>` : ''}
          ${feedback.gap  ? `<div class="feedback-row"><div class="dot dot-gap"></div><div class="feedback-text">✗ ${escapeHtml(feedback.gap)}</div></div>` : ''}
          ${feedback.tip  ? `<div class="feedback-row"><div class="dot dot-tip"></div><div class="feedback-text">→ ${escapeHtml(feedback.tip)}</div></div>` : ''}
        </div>
      `;
    }
    msgDiv.className = 'msg msg-ai';
    msgDiv.innerHTML = `
      <div class="msg-avatar ai-av">⚖</div>
      <div>
        <div class="msg-label">${roleLabels[state.currentRole]}</div>
        <div class="msg-bubble">${escapeHtml(text)}${feedbackHtml}</div>
      </div>
    `;
  }

  chatArea.appendChild(msgDiv);
  chatArea.scrollTop = chatArea.scrollHeight;
}


// ── TYPING INDICATOR ─────────────────────
export function showTypingIndicator() {
  const chatArea  = document.getElementById('chat-area');
  const indicator = document.createElement('div');
  indicator.id        = 'typing-indicator';
  indicator.className = 'msg msg-ai';
  indicator.innerHTML = `
    <div class="msg-avatar ai-av">⚖</div>
    <div class="msg-bubble">
      <div class="typing-dots"><span></span><span></span><span></span></div>
    </div>
  `;
  chatArea.appendChild(indicator);
  chatArea.scrollTop = chatArea.scrollHeight;
}

export function hideTypingIndicator() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}


// ── ROLE SWITCHER ────────────────────────
export function switchRole(role) {
  state.currentRole = role;
  document.getElementById('btn-judge').className     = 'role-btn';
  document.getElementById('btn-opposing').className  = 'role-btn';
  document.getElementById('btn-supporting').className = 'role-btn';
  document.getElementById('btn-' + role).className   = 'role-btn role-active-' + role;
  const labels = { judge: 'Judge', opposing: 'opposing counsel', supporting: 'supporting counsel' };
  document.querySelector('.hint-role').textContent   = labels[role];
}
window.switchRole = switchRole;


// ── MODAL ────────────────────────────────
export function openModal()  { document.getElementById('modal').classList.remove('hidden'); }
export function closeModal() { document.getElementById('modal').classList.add('hidden'); }
window.openModal  = openModal;
window.closeModal = closeModal;

document.getElementById('modal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

window.selectRole = function(role) {
  document.getElementById('opt-judge').className     = 'role-option';
  document.getElementById('opt-opposing').className  = 'role-option';
  document.getElementById('opt-supporting').className = 'role-option';
  document.getElementById('opt-' + role).className   = 'role-option role-sel-' + role;
  state.currentRole = role;
};


// ── KEYBOARD + TEXTAREA AUTO-RESIZE ──────
// (sendMessage is imported in script.js to avoid circular deps)
export function initKeyboard(sendMessage) {
  document.getElementById('msg-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  document.getElementById('msg-input').addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 140) + 'px';
  });
}


// ── MOBILE SIDEBAR ───────────────────────
window.toggleSidebar = function() {
  document.querySelector('.sidebar').classList.toggle('mobile-open');
  document.getElementById('mobile-overlay').classList.toggle('active');
};

window.closeSidebar = function() {
  document.querySelector('.sidebar').classList.remove('mobile-open');
  document.getElementById('mobile-overlay').classList.remove('active');
};


// ── WELCOME SCREEN ───────────────────────
export function showWelcomeScreen() {
  const ws = document.getElementById('welcome-screen');
  if (ws) ws.style.display = 'flex';
}

export function hideWelcomeScreen() {
  const ws = document.getElementById('welcome-screen');
  if (ws) ws.style.display = 'none';
}


// ── ARGUMENT COUNTER ─────────────────────
export function updateArgCounter() {
  const counter = document.getElementById('arg-counter');
  const countEl = document.getElementById('arg-count');
  if (!counter || !countEl) return;
  const count = state.messages.filter(m => m.role === 'user').length;
  if (count === 0) {
    counter.classList.add('hidden');
  } else {
    counter.classList.remove('hidden');
    countEl.textContent = count;
  }
}


// ── TOAST ────────────────────────────────
export function showToast(message) {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();

  const toast       = document.createElement('div');
  toast.id          = 'toast';
  toast.textContent = message;
  toast.style.cssText = `
    position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
    background:var(--surface);border:1px solid var(--border2);
    border-radius:8px;padding:10px 20px;font-size:13px;color:var(--text);
    z-index:500;box-shadow:0 4px 20px rgba(0,0,0,0.3);
    animation:fadeIn 0.2s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}


// ── DIFFICULTY ───────────────────────────
window.changeDifficulty = function(value) {
  state.currentDifficulty = value;
  const difficultyMessages = {
    beginner:     '🟢 Beginner mode — AI will be patient and guide you.',
    intermediate: '🟡 Intermediate mode — Standard courtroom pressure.',
    expert:       '🔴 Expert mode — AI will be relentless. Good luck.'
  };
  showToast(difficultyMessages[value]);
};