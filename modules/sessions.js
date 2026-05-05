// ══════════════════════════════════════════
// sessions.js — Session CRUD & sidebar
// Handles: load list, add to sidebar,
// load session, save message, create,
// delete, rename, quick start, file upload
// ══════════════════════════════════════════

import { state, SUMMARY_UPDATE_INTERVAL } from './state.js';
import { db }                             from './firebase.js';
import {
  collection, addDoc, getDocs, query,
  orderBy, doc, updateDoc, arrayUnion,
  where, getDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  addMessageToChat, updateArgCounter,
  hideWelcomeScreen, showWelcomeScreen,
  switchRole, escapeHtml
} from './ui.js';
import { getAIResponse, showWelcomeMessage, updateCaseSummary, sendImageToAI } from './ai.js';


// ── SAVE MESSAGE ─────────────────────────
export async function saveMessageToFirebase(role, text, feedback) {
  if (!state.currentSessionId) return;
  try {
    const sessionRef = doc(db, 'sessions', state.currentSessionId);
    await updateDoc(sessionRef, {
      messages: arrayUnion({ role, text, feedback: feedback || null })
    });
  } catch (error) {
    console.error('Error saving message:', error);
  }
}


// ── LOAD SESSIONS LIST ───────────────────
export async function loadSessions() {
  if (!state.currentUser) return;
  try {
    const list = document.getElementById('sessions-list');
    list.innerHTML = '<div style="padding:10px 16px;color:var(--text3);font-size:12px">Loading sessions...</div>';

    const q        = query(collection(db, 'sessions'), where('userId', '==', state.currentUser.uid), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    list.innerHTML = '';

    if (snapshot.empty) {
      list.innerHTML = '<div style="padding:10px 16px;color:var(--text3);font-size:12px">No sessions yet. Create one!</div>';
      showWelcomeScreen();
      return;
    }

    snapshot.forEach(docSnap => {
      const s = docSnap.data();
      addSessionToSidebar(s.name, s.role, docSnap.id, false);
    });
  } catch (error) {
    console.error('Error loading sessions:', error);
  }
}


// ── ADD SESSION TO SIDEBAR ───────────────
export function addSessionToSidebar(name, role, sessionId, isNew) {
  const list     = document.getElementById('sessions-list');
  const emptyMsg = list.querySelector('div');
  if (emptyMsg && (emptyMsg.textContent.includes('No sessions') || emptyMsg.textContent.includes('Loading'))) {
    list.innerHTML = '';
  }

  document.querySelectorAll('.session-item').forEach(item => item.classList.remove('active'));

  const badgeText  = { judge: '⚖ Judge', opposing: '⚔ Opposing', supporting: '🤝 Supporting' };
  const newSession = document.createElement('div');
  newSession.className         = 'session-item' + (isNew ? ' active' : '');
  newSession.dataset.sessionId = sessionId;
  newSession.innerHTML = `
    <div class="session-title">${escapeHtml(name)}</div>
    <div class="session-meta">
      <span class="badge badge-${role}">${badgeText[role]}</span>
      <span>${isNew ? 'Just now' : ''}</span>
    </div>
    <button class="session-del-btn" data-id="${sessionId}" title="Delete session">×</button>
  `;

  newSession.addEventListener('click', function(e) {
    if (e.target.classList.contains('session-del-btn')) {
      e.stopPropagation();
      deleteSession(e.target.dataset.id, newSession);
      return;
    }
    loadSession(sessionId, name, role, newSession);
  });

  if (isNew) list.insertBefore(newSession, list.firstChild);
  else       list.appendChild(newSession);
}


// ── LOAD SESSION ─────────────────────────
export async function loadSession(sessionId, name, role, element) {
  document.querySelectorAll('.session-item').forEach(item => item.classList.remove('active'));
  element.classList.add('active');

  state.currentSessionId         = sessionId;
  state.currentRole              = role;
  state.caseSummary              = '';
  state.messagesSinceLastSummary = 0;
  state.messages                 = [];

  document.getElementById('session-title-display').textContent = name;
  switchRole(role);
  document.getElementById('chat-area').innerHTML = '';
  hideWelcomeScreen();

  try {
    const sessionSnap = await getDoc(doc(db, 'sessions', sessionId));

    if (!sessionSnap.exists()) { showWelcomeMessage(saveMessageToFirebase); return; }

    const session      = sessionSnap.data();
    const savedMessages = session.messages || [];

    if (savedMessages.length === 0) {
      showWelcomeMessage(saveMessageToFirebase);
    } else {
      savedMessages.forEach(msg => {
        addMessageToChat(msg.role, msg.text, msg.feedback || null);
        state.messages.push(msg);
      });
      updateArgCounter();
      state.caseSummary              = session.caseSummary || '';
      state.messagesSinceLastSummary = 0;
    }
  } catch (error) {
    console.error('Error loading session:', error);
    showWelcomeMessage(saveMessageToFirebase);
  }
}


// ── CREATE SESSION ───────────────────────
window.createSession = async function() {
  if (!state.currentUser) return;

  const nameInput  = document.getElementById('new-session-name');
  const briefInput = document.getElementById('new-session-brief');
  const sessionName  = nameInput.value.trim();
  const sessionBrief = briefInput.value.trim();

  if (!sessionName) {
    nameInput.style.borderColor = 'var(--danger)';
    nameInput.placeholder = 'Please enter a session name';
    return;
  }
  nameInput.style.borderColor = '';

  try {
    const docRef = await addDoc(collection(db, 'sessions'), {
      name:      sessionName,
      role:      state.currentRole,
      brief:     sessionBrief,
      messages:  [],
      createdAt: new Date(),
      userId:    state.currentUser.uid,
      userName:  state.currentUser.displayName || 'Anonymous'
    });

    state.currentSessionId         = docRef.id;
    state.messages                 = [];
    state.caseSummary              = '';
    state.messagesSinceLastSummary = 0;

    addSessionToSidebar(sessionName, state.currentRole, docRef.id, true);
    document.getElementById('chat-area').innerHTML = '';
    updateArgCounter();
    document.getElementById('session-title-display').textContent = sessionName;
    nameInput.value  = '';
    briefInput.value = '';

    const { closeModal } = await import('./ui.js');
    closeModal();
    hideWelcomeScreen();

    if (sessionBrief) {
      state.messages.push({ role: 'user', text: 'Case brief: ' + sessionBrief + '\n\nPlease introduce yourself in your role and invite me to begin.' });
      getAIResponse('Case brief: ' + sessionBrief, saveMessageToFirebase);
    } else {
      showWelcomeMessage(saveMessageToFirebase);
    }
  } catch (error) {
    console.error('Error creating session:', error);
  }
};


// ── DELETE SESSION ───────────────────────
async function deleteSession(sessionId, sessionElement) {
  const confirmed = await new Promise(function(resolve) {
    const overlay = document.createElement('div');
    overlay.className    = 'modal-overlay';
    overlay.style.zIndex = '400';
    overlay.innerHTML = `
      <div class="modal" style="max-width:380px;text-align:center">
        <div style="font-size:32px;margin-bottom:12px">🗑</div>
        <div class="modal-title" style="margin-bottom:8px">Delete session?</div>
        <div style="font-size:13px;color:var(--text2);margin-bottom:24px;line-height:1.6">
          This will permanently delete this session and all its messages. This cannot be undone.
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn-primary" id="confirm-delete-btn" style="flex:1;background:var(--danger)">Delete</button>
          <button class="btn-cancel"  id="cancel-delete-btn"  style="flex:1">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#confirm-delete-btn').addEventListener('click', () => { overlay.remove(); resolve(true);  });
    overlay.querySelector('#cancel-delete-btn').addEventListener('click',  () => { overlay.remove(); resolve(false); });
    overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
  });

  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, 'sessions', sessionId));
    sessionElement.remove();

    if (state.currentSessionId === sessionId) {
      state.currentSessionId = null;
      state.messages         = [];
      document.getElementById('chat-area').innerHTML = '';
      document.getElementById('session-title-display').textContent = 'Select a session';
    }

    const list = document.getElementById('sessions-list');
    if (list.children.length === 0) {
      list.innerHTML = '<div style="padding:10px 16px;color:var(--text3);font-size:12px">No sessions yet. Create one!</div>';
    }
  } catch (error) {
    console.error('Error deleting session:', error);
  }
}


// ── RENAME SESSION ───────────────────────
window.makeEditable = function(el) {
  if (!state.currentSessionId) return;
  const originalText = el.textContent;
  el.contentEditable = true;
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  el.style.cssText += ';background:var(--surface2);border-radius:6px;padding:2px 8px;outline:1px solid var(--accent)';

  async function saveRename() {
    const newName = el.textContent.trim();
    el.contentEditable = false;
    el.style.background = '';
    el.style.borderRadius = '';
    el.style.padding = '';
    el.style.outline = '';
    if (!newName || newName === originalText) return;
    try {
      await updateDoc(doc(db, 'sessions', state.currentSessionId), { name: newName });
      document.querySelectorAll('.session-item').forEach(item => {
        if (item.dataset.sessionId === state.currentSessionId) {
          item.querySelector('.session-title').textContent = newName;
        }
      });
    } catch (error) {
      console.error('Error renaming session:', error);
      el.textContent = originalText;
    }
  }

  el.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); saveRename(); }
    if (e.key === 'Escape') {
      el.textContent = originalText;
      el.contentEditable = false;
      el.style.background = '';
      el.style.outline = '';
    }
  }, { once: true });
  el.addEventListener('blur', saveRename, { once: true });
};


// ── QUICK START ──────────────────────────
window.quickStart = async function(name, role, brief) {
  if (!state.currentUser) return;
  state.currentRole = role;
  switchRole(role);

  try {
    const docRef = await addDoc(collection(db, 'sessions'), {
      name, role, brief,
      messages:  [],
      createdAt: new Date(),
      userId:    state.currentUser.uid,
      userName:  state.currentUser.displayName || 'Anonymous'
    });

    state.currentSessionId         = docRef.id;
    state.caseSummary              = '';
    state.messagesSinceLastSummary = 0;
    state.messages                 = [];

    addSessionToSidebar(name, role, docRef.id, true);
    hideWelcomeScreen();
    document.getElementById('chat-area').innerHTML = '';
    document.getElementById('session-title-display').textContent = name;

    state.messages.push({ role: 'user', text: 'Case brief: ' + brief + '\n\nPlease introduce yourself in your role and invite me to begin.' });
    getAIResponse('Case brief: ' + brief, saveMessageToFirebase);

  } catch (error) {
    console.error('Error creating quick session:', error);
  }
};


// ── SEND MESSAGE ─────────────────────────
window.sendMessage = async function() {
  if (state.isLoading) return;
  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled = true;

  const input = document.getElementById('msg-input');
  const text  = input.value.trim();
  if (!text) { sendBtn.disabled = false; return; }

  input.value        = '';
  input.style.height = 'auto';

  addMessageToChat('user', text, null);
  state.messages.push({ role: 'user', text });
  updateArgCounter();
  state.messagesSinceLastSummary++;
  if (state.messagesSinceLastSummary >= SUMMARY_UPDATE_INTERVAL) {
    updateCaseSummary();
  }
  await saveMessageToFirebase('user', text, null);
  getAIResponse(text, saveMessageToFirebase);
};


// ── MID-SESSION FILE UPLOAD ──────────────
window.handleMidSessionFile = async function(event) {
  const file    = event.target.files[0];
  if (!file) return;

  const isPdf   = file.type === 'application/pdf';
  const isImage = file.type.startsWith('image/');

  if (!isPdf && !isImage) { alert('Please upload a PDF or image file.'); return; }
  if (file.size > 10 * 1024 * 1024) { alert('File too large. Please upload a file under 10MB.'); return; }

  addMessageToChat('user', '📎 Uploading ' + file.name + '...', null);

  try {
    if (isPdf) {
      const arrayBuffer = await file.arrayBuffer();
      const pdfjsLib    = window['pdfjs-dist/build/pdf'];
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      const pdf         = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText      = '';
      const pagesToRead = Math.min(pdf.numPages, 10);
      for (let i = 1; i <= pagesToRead; i++) {
        const page        = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(item => item.str).join(' ') + '\n';
      }

      if (!fullText.trim()) {
        addMessageToChat('ai', 'Could not extract text from this PDF. Please try a text-based PDF.', null);
        return;
      }

      const prompt = 'I am sharing a document with you:\n\n' + fullText.substring(0, 3000) + '\n\nPlease analyze this document in the context of our case and respond accordingly.';
      state.messages.push({ role: 'user', text: prompt });
      await saveMessageToFirebase('user', prompt, null);
      getAIResponse(prompt, saveMessageToFirebase);

    } else if (isImage) {
      const base64 = await _fileToBase64(file);
      _addImageToChat(base64, file.name);
      await sendImageToAI(base64, file.type, saveMessageToFirebase);
    }
  } catch (error) {
    console.error('File upload error:', error);
    addMessageToChat('ai', 'Error processing file. Please try again.', null);
  }

  event.target.value = '';
};

function _fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader   = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function _addImageToChat(base64, filename) {
  const chatArea = document.getElementById('chat-area');
  const msgDiv   = document.createElement('div');
  msgDiv.className = 'msg msg-user';
  msgDiv.innerHTML = `
    <div>
      <div class="msg-bubble user-bubble">
        <div style="font-size:12px;color:var(--text3);margin-bottom:8px">📎 ${escapeHtml(filename)}</div>
        <img src="data:image/jpeg;base64,${base64}" style="max-width:200px;border-radius:8px;display:block">
      </div>
    </div>
    <div class="msg-avatar user-av">${state.userInitial || 'U'}</div>
  `;
  chatArea.appendChild(msgDiv);
  chatArea.scrollTop = chatArea.scrollHeight;
}