// ══════════════════════════════════════════
// ui.js — DOM rendering & UI helpers
// Imports: state only.
// No firebase, no ai, no sessions imports —
// keeps this module at the bottom of the
// dependency chain so nothing is circular.
// ══════════════════════════════════════════

import { state } from './state.js';

// ── ESCAPE HTML ───────────────────────────
export function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

// ── CLEAR CHAT AREA ───────────────────────
// Never use chatArea.innerHTML = '' — it destroys #welcome-screen permanently.
export function clearChatArea() {
  const chatArea = document.getElementById('chat-area');
  Array.from(chatArea.children).forEach(function(child) {
    if (child.id !== 'welcome-screen') child.remove();
  });
}

// ── WELCOME SCREEN ────────────────────────
export function showWelcomeScreen() {
  const ws       = document.getElementById('welcome-screen');
  if (!ws) return;
  const chatArea = document.getElementById('chat-area');
  if (!chatArea.contains(ws)) chatArea.appendChild(ws);
  ws.style.display = 'flex';
}

export function hideWelcomeScreen() {
  const ws = document.getElementById('welcome-screen');
  if (ws) ws.style.display = 'none';
}

// ── RAG SOURCE CHIPS ─────────────────────
// Renders a collapsible "📚 Sources" block under an AI message.
// ragSections: array of { act, section, title, text, score }
function buildSourcesHtml(ragSections) {
  if (!ragSections || ragSections.length === 0) return '';

  const chips = ragSections.map(s => {
    const label   = `${s.act} §${s.section}`;
    const tooltip = escapeHtml(`${s.title} (relevance: ${Math.round((s.score || 0) * 100)}%)`);
    return `<span class="rag-chip" title="${tooltip}">${escapeHtml(label)}</span>`;
  }).join('');

  // Unique id so toggle works even with multiple messages
  const uid = 'rag-' + Math.random().toString(36).slice(2, 8);

  return `
    <div class="rag-sources" id="${uid}">
      <button class="rag-toggle" aria-expanded="false" aria-controls="${uid}-detail"
              onclick="this.setAttribute('aria-expanded', this.getAttribute('aria-expanded')==='true'?'false':'true');
                       document.getElementById('${uid}-detail').classList.toggle('rag-detail-open')">
        📚 <span class="rag-toggle-label">Sources retrieved</span>
        <span class="rag-chips-preview">${chips}</span>
        <span class="rag-caret" aria-hidden="true">›</span>
      </button>
      <div class="rag-detail" id="${uid}-detail" role="region" aria-label="Retrieved law sections">
        ${ragSections.map(s => `
          <div class="rag-section-item">
            <div class="rag-section-header">
              <span class="rag-section-act">${escapeHtml(s.act)}</span>
              <span class="rag-section-num">§${escapeHtml(String(s.section))}</span>
              <span class="rag-section-title">${escapeHtml(s.title)}</span>
            </div>
            <div class="rag-section-text">${escapeHtml(s.text ? s.text.substring(0, 280) + (s.text.length > 280 ? '…' : '') : '')}</div>
          </div>`).join('')}
        <div class="rag-disclaimer">⚠ Verify all citations against SCC Online, Manupatra, or bare acts before use in proceedings.</div>
      </div>
    </div>`;
}

// ── ADD MESSAGE TO CHAT ───────────────────
// ragSections is optional — only present on fresh AI responses, not on session reload
export function addMessageToChat(role, text, feedback, ragSections) {
  const chatArea   = document.getElementById('chat-area');
  const msgDiv     = document.createElement('div');
  const roleLabels = { opposing: 'Opposing counsel', judge: 'Judge', supporting: 'Supporting counsel' };

  if (role === 'user') {
    msgDiv.className = 'msg msg-user';
    msgDiv.setAttribute('role', 'article');
    msgDiv.setAttribute('aria-label', 'Your argument');
    msgDiv.innerHTML = `
      <div>
        <div class="msg-bubble user-bubble">${escapeHtml(text)}</div>
      </div>
      <div class="msg-avatar user-av" aria-hidden="true">${state.userInitial || 'U'}</div>
    `;
  } else {
    let feedbackHtml = '';
    if (feedback && (feedback.good || feedback.gap || feedback.tip)) {
      feedbackHtml = `
        <div class="feedback-block" role="complementary" aria-label="Argument analysis">
          <div class="feedback-title" aria-hidden="true">⚡ Argument analysis</div>
          ${feedback.good ? `<div class="feedback-row"><div class="dot dot-good" aria-hidden="true"></div><div class="feedback-text"><span class="sr-only">Strength: </span>✓ ${escapeHtml(feedback.good)}</div></div>` : ''}
          ${feedback.gap  ? `<div class="feedback-row"><div class="dot dot-gap"  aria-hidden="true"></div><div class="feedback-text"><span class="sr-only">Gap: </span>✗ ${escapeHtml(feedback.gap)}</div></div>`  : ''}
          ${feedback.tip  ? `<div class="feedback-row"><div class="dot dot-tip"  aria-hidden="true"></div><div class="feedback-text"><span class="sr-only">Tip: </span>→ ${escapeHtml(feedback.tip)}</div></div>`   : ''}
        </div>`;
    }

    const sourcesHtml = buildSourcesHtml(ragSections);
    const roleLabel   = roleLabels[state.currentRole] || 'AI';

    msgDiv.className = 'msg msg-ai';
    msgDiv.setAttribute('role', 'article');
    msgDiv.setAttribute('aria-label', roleLabel + ' response');
    msgDiv.innerHTML = `
      <div class="msg-avatar ai-av" aria-hidden="true">⚖</div>
      <div>
        <div class="msg-label" aria-hidden="true">${roleLabel}</div>
        <div class="msg-bubble">${escapeHtml(text)}${feedbackHtml}</div>
        ${sourcesHtml}
      </div>
    `;
  }

  chatArea.appendChild(msgDiv);
  chatArea.scrollTop = chatArea.scrollHeight;

  // Announce new AI messages to screen readers via live region
  if (role !== 'user') {
    const live = document.getElementById('chat-live-region');
    if (live) live.textContent = roleLabels[state.currentRole] + ' has responded.';
  }
}

// ── TYPING INDICATOR ─────────────────────
export function showTypingIndicator() {
  const chatArea  = document.getElementById('chat-area');
  const indicator = document.createElement('div');
  indicator.id        = 'typing-indicator';
  indicator.className = 'msg msg-ai';
  indicator.setAttribute('aria-label', 'AI is thinking');
  indicator.innerHTML = `
    <div class="msg-avatar ai-av" aria-hidden="true">⚖</div>
    <div class="msg-bubble">
      <div class="typing-dots" aria-hidden="true"><span></span><span></span><span></span></div>
    </div>
  `;
  chatArea.appendChild(indicator);
  chatArea.scrollTop = chatArea.scrollHeight;
}

export function hideTypingIndicator() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

// ── TOAST ────────────────────────────────
export function showToast(message) {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();
  const toast       = document.createElement('div');
  toast.id          = 'toast';
  toast.textContent = message;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.style.cssText = `
    position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
    background:var(--surface);border:1px solid var(--border2);
    border-radius:8px;padding:10px 20px;font-size:13px;color:var(--text);
    z-index:500;box-shadow:0 4px 20px rgba(0,0,0,0.3);animation:fadeIn 0.2s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 3000);
}

// ── ARG COUNTER ───────────────────────────
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
    counter.setAttribute('aria-label', count + ' arguments made');
  }
}

// ── ROLE SWITCHER ─────────────────────────
// silent=true skips the toast (used when loading a session)
export function switchRole(role, silent) {
  state.currentRole = role;
  document.getElementById('btn-judge').className      = 'role-btn';
  document.getElementById('btn-opposing').className   = 'role-btn';
  document.getElementById('btn-supporting').className = 'role-btn';
  document.getElementById('btn-' + role).className    = 'role-btn role-active-' + role;

  // Update aria-pressed on role buttons
  ['judge', 'opposing', 'supporting'].forEach(r => {
    document.getElementById('btn-' + r).setAttribute('aria-pressed', r === role ? 'true' : 'false');
  });

  const labels = { judge: 'Judge', opposing: 'opposing counsel', supporting: 'supporting counsel' };
  document.querySelector('.hint-role').textContent    = labels[role];
  if (!silent) {
    const toastLabels = { judge: '⚖ Now arguing before the Judge', opposing: '⚔ Now vs Opposing Counsel', supporting: '🤝 Now with Supporting Counsel' };
    showToast(toastLabels[role]);
  }
}
window.switchRole = function(role) { switchRole(role, false); };

// ── MODAL ─────────────────────────────────
export function openModal() {
  const modal = document.getElementById('modal');
  modal.classList.remove('hidden');
  modal.removeAttribute('aria-hidden');
  // Focus first input inside modal
  const firstInput = modal.querySelector('input, textarea, button');
  if (firstInput) firstInput.focus();
  // Trap focus inside modal while open
  modal.addEventListener('keydown', trapFocus);
}
export function closeModal() {
  const modal = document.getElementById('modal');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  modal.removeEventListener('keydown', trapFocus);
  // Return focus to New Session button
  const trigger = document.querySelector('.btn-new');
  if (trigger) trigger.focus();
}
window.openModal  = openModal;
window.closeModal = closeModal;
document.getElementById('modal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});
window.selectRole = function(role) {
  ['judge','opposing','supporting'].forEach(r => {
    const opt = document.getElementById('opt-' + r);
    opt.className = 'role-option';
    opt.setAttribute('aria-pressed', 'false');
  });
  const selected = document.getElementById('opt-' + role);
  selected.className = 'role-option role-sel-' + role;
  selected.setAttribute('aria-pressed', 'true');
  state.currentRole = role;
};

// ── FOCUS TRAP ────────────────────────────
// Keeps keyboard focus inside a modal while it is open.
function trapFocus(e) {
  if (e.key !== 'Tab') {
    if (e.key === 'Escape') closeModal();
    return;
  }
  const modal    = document.getElementById('modal');
  const focusable = Array.from(modal.querySelectorAll(
    'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
  )).filter(el => !el.closest('.hidden'));
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last  = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
  }
}

// ── KEYBOARD + TEXTAREA ───────────────────
// sendMessage is passed in from script.js to avoid circular dependency
export function initKeyboard(sendMessage) {
  document.getElementById('msg-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  document.getElementById('msg-input').addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 140) + 'px';
  });
}

// ── MOBILE SIDEBAR ────────────────────────
window.toggleSidebar = function() {
  const sidebar  = document.querySelector('.sidebar');
  const overlay  = document.getElementById('mobile-overlay');
  const isOpen   = sidebar.classList.toggle('mobile-open');
  overlay.classList.toggle('active');
  document.querySelector('.hamburger').setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  if (isOpen) {
    // Move focus to first focusable element in sidebar
    const firstFocus = sidebar.querySelector('button, a, input');
    if (firstFocus) firstFocus.focus();
  }
};
window.closeSidebar = function() {
  document.querySelector('.sidebar').classList.remove('mobile-open');
  document.getElementById('mobile-overlay').classList.remove('active');
  document.querySelector('.hamburger').setAttribute('aria-expanded', 'false');
};

// ── DIFFICULTY ────────────────────────────
window.changeDifficulty = function(value) {
  state.currentDifficulty = value;
  const msgs = {
    beginner:     '🟢 Beginner mode — AI will be patient and guide you.',
    intermediate: '🟡 Intermediate mode — Standard courtroom pressure.',
    expert:       '🔴 Expert mode — AI will be relentless. Good luck.'
  };
  showToast(msgs[value]);
};

// ── KEYBOARD ACTIVATION FOR DIV-BUTTONS ──
// role="button" divs need Enter/Space to activate, same as real buttons.
// Called once on DOMContentLoaded — harmless if elements don't yet exist.
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = document.activeElement;
  if (!el || el.getAttribute('role') !== 'button') return;
  e.preventDefault();
  el.click();
});