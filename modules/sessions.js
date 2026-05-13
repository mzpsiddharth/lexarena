// ══════════════════════════════════════════
// sessions.js — All session CRUD & sidebar
// Imports: state, firebase, ui, ai
//
// MESSAGES STORAGE: messages are stored in a
// subcollection: sessions/{id}/messages/{msgId}
// NOT as an array field on the session doc.
// This avoids the Firestore 1MB document limit
// for long sessions.
// ══════════════════════════════════════════

import { state, SUMMARY_UPDATE_INTERVAL, SEND_COOLDOWN_MS } from './state.js';
import { db }  from './firebase.js';
import {
  collection, addDoc, getDocs, query, orderBy,
  doc, updateDoc, where, getDoc, deleteDoc, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  addMessageToChat, updateArgCounter, clearChatArea,
  showWelcomeScreen, hideWelcomeScreen, switchRole, closeModal, escapeHtml, showToast
} from './ui.js';
import { getAIResponse, showWelcomeMessage, updateCaseSummary, sendImageToAI } from './ai.js';


// ── SAVE MESSAGE ─────────────────────────
// Writes to subcollection sessions/{id}/messages/{auto-id}
// Timestamp used for ordering on load.
export async function saveMessageToFirebase(role, text, feedback) {
  if (!state.currentSessionId) return;
  try {
    await addDoc(
      collection(db, 'sessions', state.currentSessionId, 'messages'),
      {
        role,
        text,
        feedback:  feedback || null,
        createdAt: serverTimestamp()
      }
    );
  } catch (e) {
    console.error('Error saving message:', e);
    showToast('⚠️ Could not save message — check your connection');
  }
}


// ── LOAD SESSIONS LIST ────────────────────
export async function loadSessions() {
  if (!state.currentUser) return;
  try {
    const list = document.getElementById('sessions-list');
    list.innerHTML = '<div style="padding:10px 16px;color:var(--text3);font-size:12px">Loading sessions...</div>';

    const snapshot = await getDocs(query(
      collection(db, 'sessions'),
      where('userId', '==', state.currentUser.uid),
      orderBy('createdAt', 'desc')
    ));

    list.innerHTML = '';

    if (snapshot.empty) {
      list.innerHTML = '<div style="padding:10px 16px;color:var(--text3);font-size:12px">No sessions yet. Create one!</div>';
      showWelcomeScreen();
      return;
    }

    snapshot.forEach(function(docSnap) {
      const s = docSnap.data();
      addSessionToSidebar(s.name, s.role, docSnap.id, false);
    });

    showWelcomeScreen();

  } catch (e) { console.error('Error loading sessions:', e); }
}


// ── ADD SESSION TO SIDEBAR ────────────────
export function addSessionToSidebar(name, role, sessionId, isNew) {
  const list     = document.getElementById('sessions-list');
  const emptyMsg = list.querySelector('div');
  if (emptyMsg && (emptyMsg.textContent.includes('No sessions') || emptyMsg.textContent.includes('Loading'))) {
    list.innerHTML = '';
  }

  document.querySelectorAll('.session-item').forEach(item => item.classList.remove('active'));

  const badges = { judge: '⚖ Judge', opposing: '⚔ Opposing', supporting: '🤝 Supporting' };
  const item   = document.createElement('div');
  item.className         = 'session-item' + (isNew ? ' active' : '');
  item.dataset.sessionId = sessionId;
  item.innerHTML = `
    <div class="session-title">${escapeHtml(name)}</div>
    <div class="session-meta">
      <span class="badge badge-${role}">${badges[role]}</span>
      <span>${isNew ? 'Just now' : ''}</span>
    </div>
    <button class="session-del-btn" data-id="${sessionId}" title="Delete session">×</button>
  `;

  item.addEventListener('click', function(e) {
    if (e.target.classList.contains('session-del-btn')) {
      e.stopPropagation();
      deleteSession(e.target.dataset.id, item);
      return;
    }
    loadSession(sessionId, name, role, item);
  });

  if (isNew) list.insertBefore(item, list.firstChild);
  else       list.appendChild(item);
}


// ── LOAD SESSION ─────────────────────────
// Reads messages from subcollection, ordered by createdAt.
export async function loadSession(sessionId, name, role, element) {
  document.querySelectorAll('.session-item').forEach(item => item.classList.remove('active'));
  element.classList.add('active');

  state.currentSessionId         = sessionId;
  state.messages                 = [];
  state.caseSummary              = '';
  state.messagesSinceLastSummary = 0;

  document.getElementById('session-title-display').textContent = name;
  switchRole(role, true);
  clearChatArea();
  hideWelcomeScreen();

  // Show loading indicator while Firestore reads complete
  const chatArea   = document.getElementById('chat-area');
  const loadingDiv = document.createElement('div');
  loadingDiv.id        = 'session-loading';
  loadingDiv.className = 'msg msg-ai';
  loadingDiv.innerHTML = `
    <div class="msg-avatar ai-av">⚖</div>
    <div class="msg-bubble">
      <div class="typing-dots"><span></span><span></span><span></span></div>
    </div>`;
  chatArea.appendChild(loadingDiv);

  try {
    // Load session metadata (caseSummary, savedReport, etc.)
    const sessionSnap = await getDoc(doc(db, 'sessions', sessionId));
    document.getElementById('session-loading')?.remove();
    if (!sessionSnap.exists()) { showWelcomeMessage(saveMessageToFirebase); return; }

    // Load messages from subcollection
    const messagesSnap = await getDocs(query(
      collection(db, 'sessions', sessionId, 'messages'),
      orderBy('createdAt', 'asc')
    ));

    if (messagesSnap.empty) {
      showWelcomeMessage(saveMessageToFirebase);
    } else {
      messagesSnap.forEach(msgDoc => {
        const msg = msgDoc.data();
        addMessageToChat(msg.role, msg.text, msg.feedback || null, msg.ragSections || null);
        state.messages.push({ role: msg.role, text: msg.text, feedback: msg.feedback || null, ragSections: msg.ragSections || null });
      });
      updateArgCounter();
      state.caseSummary = sessionSnap.data().caseSummary || '';
      // Make saved AI report available to exportSession
      window._exportSavedReport = sessionSnap.data().savedReport || null;
    }
  } catch (e) {
    console.error('Error loading session:', e);
    document.getElementById('session-loading')?.remove();
    showWelcomeMessage(saveMessageToFirebase);
  }
}


// ── CREATE SESSION ────────────────────────
window.createSession = async function() {
  if (!state.currentUser) return;

  const nameInput    = document.getElementById('new-session-name');
  const briefInput   = document.getElementById('new-session-brief');
  const sessionName  = nameInput.value.trim();
  const sessionBrief = briefInput.value.trim();

  if (!sessionName) {
    nameInput.style.borderColor = 'var(--danger)';
    nameInput.placeholder = 'Please enter a session name';
    return;
  }
  nameInput.style.borderColor = '';

  try {
    // Session doc no longer has a messages array — just metadata
    const docRef = await addDoc(collection(db, 'sessions'), {
      name:      sessionName,
      role:      state.currentRole,
      brief:     sessionBrief,
      createdAt: new Date(),
      userId:    state.currentUser.uid,
      userName:  state.currentUser.displayName || 'Anonymous'
    });

    state.currentSessionId         = docRef.id;
    state.messages                 = [];
    state.caseSummary              = '';
    state.messagesSinceLastSummary = 0;

    addSessionToSidebar(sessionName, state.currentRole, docRef.id, true);
    clearChatArea();
    updateArgCounter();
    document.getElementById('session-title-display').textContent = sessionName;
    nameInput.value  = '';
    briefInput.value = '';
    closeModal();
    hideWelcomeScreen();

    if (sessionBrief) {
      state.messages.push({ role: 'user', text: 'Case brief: ' + sessionBrief + '\n\nPlease introduce yourself in your role and invite me to begin.' });
      getAIResponse('Case brief: ' + sessionBrief, saveMessageToFirebase);
    } else {
      showWelcomeMessage(saveMessageToFirebase);
    }
  } catch (e) { console.error('Error creating session:', e); }
};


// ── DELETE SESSION ────────────────────────
// Deletes the session doc AND all messages in the subcollection.
async function deleteSession(sessionId, element) {
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
          <button class="btn-primary" id="confirm-del" style="flex:1;background:var(--danger)">Delete</button>
          <button class="btn-cancel"  id="cancel-del"  style="flex:1">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#confirm-del').addEventListener('click', () => { overlay.remove(); resolve(true);  });
    overlay.querySelector('#cancel-del').addEventListener('click',  () => { overlay.remove(); resolve(false); });
    overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
  });
  if (!confirmed) return;

  try {
    // Delete all messages in subcollection first — chunk into batches of 500 (Firestore limit)
    const messagesSnap = await getDocs(collection(db, 'sessions', sessionId, 'messages'));
    const allMsgDocs   = [];
    messagesSnap.forEach(msgDoc => allMsgDocs.push(msgDoc.ref));

    for (let i = 0; i < allMsgDocs.length; i += 500) {
      const batch = writeBatch(db);
      allMsgDocs.slice(i, i + 500).forEach(ref => batch.delete(ref));
      await batch.commit();
    }

    await deleteDoc(doc(db, 'sessions', sessionId));

    element.remove();
    if (state.currentSessionId === sessionId) {
      state.currentSessionId = null;
      state.messages         = [];
      clearChatArea();
      showWelcomeScreen();
      document.getElementById('session-title-display').textContent = 'Select a session';
    }
    const list = document.getElementById('sessions-list');
    if (list.children.length === 0) {
      list.innerHTML = '<div style="padding:10px 16px;color:var(--text3);font-size:12px">No sessions yet. Create one!</div>';
    }
  } catch (e) { console.error('Error deleting session:', e); }
}


// ── RENAME SESSION ────────────────────────
window.makeEditable = function(el) {
  if (!state.currentSessionId) return;
  const orig = el.textContent;
  el.contentEditable = true;
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  el.style.cssText += ';background:var(--surface2);border-radius:6px;padding:2px 8px;outline:1px solid var(--accent)';

  async function save() {
    const newName = el.textContent.trim();
    el.contentEditable = false;
    el.style.background = el.style.borderRadius = el.style.padding = el.style.outline = '';
    // Only save if name changed AND user explicitly committed (Enter or intentional blur)
    if (!newName || newName === orig || !el.dataset.renameConfirmed) {
      el.textContent = orig;  // restore if bailed out
      delete el.dataset.renameConfirmed;
      return;
    }
    delete el.dataset.renameConfirmed;
    try {
      await updateDoc(doc(db, 'sessions', state.currentSessionId), { name: newName });
      document.querySelectorAll('.session-item').forEach(item => {
        if (item.dataset.sessionId === state.currentSessionId)
          item.querySelector('.session-title').textContent = newName;
      });
    } catch (e) { console.error('Rename error:', e); el.textContent = orig; }
  }

  el.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); el.dataset.renameConfirmed = '1'; save(); }
    if (e.key === 'Escape') { el.textContent = orig; el.contentEditable = false; el.style.background = el.style.outline = ''; }
  }, { once: true });
  // On blur: only save if it was a deliberate click-away (pointer inside document), not a tab switch
  el.addEventListener('blur', function() {
    if (document.hasFocus()) { el.dataset.renameConfirmed = '1'; }
    save();
  }, { once: true });
};


// ── QUICK START ───────────────────────────
window.quickStart = async function(name, role, brief) {
  if (!state.currentUser) return;
  switchRole(role, true);

  // Reset difficulty to intermediate for a clean start
  state.currentDifficulty = 'intermediate';
  const diffSel = document.getElementById('difficulty-select');
  if (diffSel) diffSel.value = 'intermediate';

  try {
    const docRef = await addDoc(collection(db, 'sessions'), {
      name, role, brief,
      createdAt: new Date(),
      userId:    state.currentUser.uid,
      userName:  state.currentUser.displayName || 'Anonymous'
    });

    state.currentSessionId         = docRef.id;
    state.messages                 = [];
    state.caseSummary              = '';
    state.messagesSinceLastSummary = 0;

    addSessionToSidebar(name, role, docRef.id, true);
    hideWelcomeScreen();
    clearChatArea();
    document.getElementById('session-title-display').textContent = name;

    state.messages.push({ role: 'user', text: 'Case brief: ' + brief + '\n\nPlease introduce yourself in your role and invite me to begin.' });
    getAIResponse('Case brief: ' + brief, saveMessageToFirebase);

  } catch (e) { console.error('Error creating quick session:', e); }
};


// ── SEND MESSAGE ─────────────────────────
window.sendMessage = async function() {
  if (state.isLoading) return;

  const now = Date.now();
  if (now - state.lastMessageTime < SEND_COOLDOWN_MS) {
    const wait = Math.ceil((SEND_COOLDOWN_MS - (now - state.lastMessageTime)) / 1000);
    showToast('⏳ Please wait ' + wait + 's before sending again.');
    return;
  }

  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled = true;

  const input = document.getElementById('msg-input');
  const text  = input.value.trim();
  if (!text) { sendBtn.disabled = false; return; }

  state.lastMessageTime = Date.now();
  input.value        = '';
  input.style.height = 'auto';

  addMessageToChat('user', text, null);
  state.messages.push({ role: 'user', text });
  updateArgCounter();
  state.messagesSinceLastSummary++;
  if (state.messagesSinceLastSummary >= SUMMARY_UPDATE_INTERVAL) updateCaseSummary();

  await saveMessageToFirebase('user', text, null);
  getAIResponse(text, saveMessageToFirebase);
};


// ── FILE UPLOAD ───────────────────────────
window.handleMidSessionFile = async function(event) {
  const file    = event.target.files[0];
  if (!file) return;

  const isPdf   = file.type === 'application/pdf';
  const isImage = file.type.startsWith('image/');
  if (!isPdf && !isImage) { showToast('Please upload a PDF or image file.'); return; }
  if (file.size > 10 * 1024 * 1024) { showToast('File too large. Max 10MB.'); return; }

  addMessageToChat('user', '📎 Uploading ' + file.name + '...', null);

  try {
    if (isPdf) {
      const arrayBuffer = await file.arrayBuffer();
      const pdfjsLib    = window['pdfjs-dist/build/pdf'];
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf         = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText      = '';
      for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
        const page = await pdf.getPage(i);
        fullText  += (await page.getTextContent()).items.map(x => x.str).join(' ') + '\n';
      }
      if (!fullText.trim()) { addMessageToChat('ai', 'Could not extract text from this PDF.', null); return; }
      const prompt = 'I am sharing a document with you:\n\n' + fullText.substring(0, 3000) + '\n\nPlease analyze this document in the context of our case.';
      state.messages.push({ role: 'user', text: prompt });
      await saveMessageToFirebase('user', prompt, null);
      getAIResponse(prompt, saveMessageToFirebase);

    } else {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload  = () => res(r.result.split(',')[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const chatArea = document.getElementById('chat-area');
      const imgDiv   = document.createElement('div');
      imgDiv.className = 'msg msg-user';
      imgDiv.innerHTML = `
        <div>
          <div class="msg-bubble user-bubble">
            <div style="font-size:12px;color:var(--text3);margin-bottom:8px">📎 ${escapeHtml(file.name)}</div>
            <img src="data:${file.type};base64,${base64}" style="max-width:200px;border-radius:8px;display:block">
          </div>
        </div>
        <div class="msg-avatar user-av">${state.userInitial || 'U'}</div>`;
      chatArea.appendChild(imgDiv);
      chatArea.scrollTop = chatArea.scrollHeight;
      await sendImageToAI(base64, file.type, saveMessageToFirebase);
    }
  } catch (e) {
    console.error('File upload error:', e);
    addMessageToChat('ai', 'Error processing file. Please try again.', null);
  }
  event.target.value = '';
};