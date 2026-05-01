// ══════════════════════════════════════════
// FIREBASE SETUP
// ══════════════════════════════════════════
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, doc, updateDoc, arrayUnion, where, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// YOUR FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyARAqEPx23O2sxmmOfULKR-Lb38ZKP2Ufk",
  authDomain: "lexarena-76fda.firebaseapp.com",
  projectId: "lexarena-76fda",
  storageBucket: "lexarena-76fda.firebasestorage.app",
  messagingSenderId: "788257269378",
  appId: "1:788257269378:web:8b8f2e262203f4502df69b"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);


// ══════════════════════════════════════════
// GEMINI API
// ══════════════════════════════════════════
const GROQ_API_KEY = "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";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// ══════════════════════════════════════════
// APP STATE
// ══════════════════════════════════════════
let currentRole = "opposing";
let isLoading = false;
let messages = [];
let currentSessionId = null;
let currentUser = null;
window.userInitial = "U";


// ══════════════════════════════════════════
// SYSTEM PROMPTS
// ══════════════════════════════════════════
const difficultyInstructions = {
  beginner: `DIFFICULTY — BEGINNER: The user is a law student with limited experience. Be firm but educational. After challenging their argument, briefly explain WHY it was weak and what principle of Indian law they should understand. Give them a hint about what section or case they should look up. Be patient.`,
  
  intermediate: `DIFFICULTY — INTERMEDIATE: The user is a junior advocate with basic knowledge. Apply standard courtroom pressure. Challenge arguments clearly but give them room to recover and respond. Expect proper section citations but help if they are close.`,
  
  expert: `DIFFICULTY — EXPERT: The user claims to be an experienced advocate. Show absolutely no mercy. Attack every logical gap immediately. Cite obscure but real Supreme Court judgments. Ask rapid follow-up questions before they can recover. Expect perfect citations, proper legal structure, and anticipation of counterarguments. Any vagueness is immediately penalized.`
};

let currentDifficulty = 'intermediate';

const systemPrompts = {
  opposing: `You are Senior Advocate appearing for the opposing party in an Indian court of law. You have 20 years of experience in Indian courts including the Supreme Court of India and various High Courts.

ABSOLUTE RULES — NEVER BREAK THESE:
- You are a human lawyer. NEVER say "As an AI", "I am an AI", or anything that breaks your character as a lawyer.
- ONLY discuss Indian law. If the user raises non-Indian law, firmly redirect them.
- ALWAYS address the user as "Counsel" or "learned counsel"
- ALWAYS cite specific Indian statutes with section numbers (e.g. "Section 302 IPC", "Section 161 CrPC")
- When citing case law, use real Indian cases with year and court (e.g. "Sharad Birdhichand Sarda v. State of Maharashtra (1984) 4 SCC 116")
- Keep responses under 120 words
- Be aggressive, sharp, and relentless — expose every weakness

COURTROOM BEHAVIOR:
- Open with a sharp challenge to the user's argument
- Cite at least one specific statute or case law per response
- End with a pointed question that forces the user to defend their position
- Never concede a point without extracting something in return

After your argument, add feedback in EXACTLY this format — no deviation:
FEEDBACK:
GOOD: [specific thing done well, referencing the actual argument made]
GAP: [specific missing element — name the exact section or case they should have cited]
TIP: [one actionable improvement for next argument]`,

  judge: `You are Hon'ble Justice presiding over a Sessions Court in India. You have 25 years of experience on the bench including stints at the High Court level.

ABSOLUTE RULES — NEVER BREAK THESE:
- You are a human judge. NEVER say "As an AI" or break character.
- ONLY discuss Indian law — IPC, CrPC, CPC, Evidence Act, Constitution of India
- Address the user as "Counsel" or "learned counsel"
- Cite specific sections and Supreme Court judgments when questioning
- Keep responses under 120 words
- Be stern, precise, and impatient with vague arguments

JUDICIAL BEHAVIOR:
- Ask sharp, specific questions that test the legal foundation of arguments
- Interrupt immediately if the argument is vague or legally unsound
- Reference specific Supreme Court or High Court precedents when relevant
- Demand precise section numbers — never accept vague references
- Maintain formal court language at all times

After your judicial response, add feedback in EXACTLY this format:
FEEDBACK:
GOOD: [specific strength in the user's submission]
GAP: [exact legal point, section, or precedent the user failed to address]
TIP: [one specific improvement for their next submission]`,

  supporting: `You are a Senior Advocate with 15 years of experience in Indian courts, acting as mentor to a junior lawyer preparing for an important hearing.

ABSOLUTE RULES — NEVER BREAK THESE:
- You are a human lawyer mentor. NEVER say "As an AI" or break character.
- ONLY discuss Indian law — IPC, CrPC, CPC, Evidence Act, Constitution of India
- Address the user as "counsel" or by their argument
- Always suggest specific sections and real Indian case law
- Keep responses under 120 words
- Be encouraging but rigorous — push them to be better

MENTORING BEHAVIOR:
- Identify the strongest part of their argument first
- Point out the most dangerous weakness the opponent will exploit
- Always suggest at least one specific case law or section they should cite
- Help them anticipate the judge's likely questions
- Structure advice as: strengthen this → fix this → cite this

After your advice, add feedback in EXACTLY this format:
FEEDBACK:
GOOD: [specific strength in their argument]
GAP: [exact weakness the opposing counsel will attack]
TIP: [one specific case law or section to strengthen their position]`
};


// ══════════════════════════════════════════
// AUTH STATE LISTENER
// Runs automatically when page loads
// Shows app if logged in, login page if not
// ══════════════════════════════════════════
onAuthStateChanged(auth, function(user) {
  if (user) {
    // User is logged in
    currentUser = user;
    const displayName = user.displayName || 'User';
    const initials = displayName.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
    window.userInitial = initials.substring(0, 1);

    document.getElementById('user-name').textContent = displayName;
    document.getElementById('user-email').textContent = user.email;
    document.getElementById('user-initials').textContent = initials;

    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');

    loadSessions();
  } else {
    // User is logged out
    currentUser = null;
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-page').classList.remove('hidden');
  }
});


// ══════════════════════════════════════════
// LOGIN PAGE — switch between sign in / sign up
// ══════════════════════════════════════════
window.showSignup = function() {
  document.getElementById('signin-form').classList.add('hidden');
  document.getElementById('signup-form').classList.remove('hidden');
}

window.showSignin = function() {
  document.getElementById('signup-form').classList.add('hidden');
  document.getElementById('signin-form').classList.remove('hidden');
}


// ══════════════════════════════════════════
// SIGN UP — create new account
// ══════════════════════════════════════════
window.doSignup = async function() {
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const errorEl = document.getElementById('signup-error');

  if (!name || !email || !password) {
    errorEl.textContent = 'Please fill in all fields.';
    return;
  }

  if (password.length < 6) {
    errorEl.textContent = 'Password must be at least 6 characters.';
    return;
  }

  errorEl.textContent = '';

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCredential.user, { displayName: name });
    // onAuthStateChanged will handle showing the app
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      errorEl.textContent = 'This email is already registered. Please sign in.';
    } else if (error.code === 'auth/invalid-email') {
      errorEl.textContent = 'Invalid email address.';
    } else {
      errorEl.textContent = 'Error: ' + error.message;
    }
  }
}


// ══════════════════════════════════════════
// SIGN IN — existing account
// ══════════════════════════════════════════
window.doLogin = async function() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');

  if (!email || !password) {
    errorEl.textContent = 'Please enter your email and password.';
    return;
  }

  errorEl.textContent = '';

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will handle showing the app
  } catch (error) {
    if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
      errorEl.textContent = 'Incorrect email or password.';
    } else if (error.code === 'auth/user-not-found') {
      errorEl.textContent = 'No account found. Please sign up first.';
    } else {
      errorEl.textContent = 'Error: ' + error.message;
    }
  }
}


// ══════════════════════════════════════════
// SIGN OUT
// ══════════════════════════════════════════
window.doLogout = async function() {
  await signOut(auth);
  messages = [];
  currentSessionId = null;
  document.getElementById('sessions-list').innerHTML = '';
  document.getElementById('chat-area').innerHTML = '';
}


// ══════════════════════════════════════════
// LOAD SESSIONS — only this user's sessions
// ══════════════════════════════════════════
async function loadSessions() {
  if (!currentUser) return;

  try {
    const list = document.getElementById('sessions-list');
    list.innerHTML = '<div style="padding:10px 16px;color:var(--text3);font-size:12px">Loading sessions...</div>';

    const q = query(
      collection(db, 'sessions'),
      where('userId', '==', currentUser.uid),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);

    list.innerHTML = '';

    if (snapshot.empty) {
      list.innerHTML = '<div style="padding:10px 16px;color:var(--text3);font-size:12px">No sessions yet. Create one!</div>';
            showWelcomeScreen();
      return;
    }

    snapshot.forEach(function(docSnap) {
      const session = docSnap.data();
      addSessionToSidebar(session.name, session.role, docSnap.id, false);
    });

  } catch (error) {
    console.error('Error loading sessions:', error);
  }
}


// ══════════════════════════════════════════
// CREATE NEW SESSION
// ══════════════════════════════════════════
window.createSession = async function() {
  if (!currentUser) return;

  const nameInput = document.getElementById('new-session-name');
  const briefInput = document.getElementById('new-session-brief');

  const sessionName = nameInput.value.trim();
  const sessionBrief = briefInput.value.trim();

  if (!sessionName) {
    nameInput.style.borderColor = 'var(--danger)';
    nameInput.placeholder = 'Please enter a session name';
    return;
  }

  nameInput.style.borderColor = '';

  try {
    const docRef = await addDoc(collection(db, 'sessions'), {
      name: sessionName,
      role: currentRole,
      brief: sessionBrief,
      messages: [],
      createdAt: new Date(),
      userId: currentUser.uid
    });

    currentSessionId = docRef.id;
    addSessionToSidebar(sessionName, currentRole, docRef.id, true);

    document.getElementById('chat-area').innerHTML = '';
    messages = [];
    updateArgCounter();
    document.getElementById('session-title-display').textContent = sessionName;

    nameInput.value = '';
    briefInput.value = '';
    closeModal();
    hideWelcomeScreen();

    if (sessionBrief) {
      messages.push({ role: 'user', text: 'Case brief: ' + sessionBrief + '\n\nPlease introduce yourself in your role and invite me to begin.' });
      getAIResponse('Case brief: ' + sessionBrief);
    } else {
      showWelcomeMessage();
    }

  } catch (error) {
    console.error('Error creating session:', error);
  }
}


// ══════════════════════════════════════════
// ADD SESSION TO SIDEBAR
// ══════════════════════════════════════════
function addSessionToSidebar(name, role, sessionId, isNew) {
  const list = document.getElementById('sessions-list');

  const emptyMsg = list.querySelector('div');
  if (emptyMsg && (emptyMsg.textContent.includes('No sessions') || emptyMsg.textContent.includes('Loading'))) {
    list.innerHTML = '';
  }

  document.querySelectorAll('.session-item').forEach(function(item) {
    item.classList.remove('active');
  });

  const badgeText = { judge: '⚖ Judge', opposing: '⚔ Opposing', supporting: '🤝 Supporting' };

  const newSession = document.createElement('div');
  newSession.className = 'session-item' + (isNew ? ' active' : '');
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
    // If they clicked the delete button, delete — don't load
    if (e.target.classList.contains('session-del-btn')) {
      e.stopPropagation();
      deleteSession(e.target.dataset.id, newSession);
      return;
    }
    loadSession(sessionId, name, role, newSession);
  });

  if (isNew) {
    list.insertBefore(newSession, list.firstChild);
  } else {
    list.appendChild(newSession);
  }
}


// ══════════════════════════════════════════
// LOAD SESSION WHEN CLICKED
// ══════════════════════════════════════════
async function loadSession(sessionId, name, role, element) {
  document.querySelectorAll('.session-item').forEach(function(item) {
    item.classList.remove('active');
  });
  element.classList.add('active');

  currentSessionId = sessionId;
  currentRole = role;
  document.getElementById('session-title-display').textContent = name;
  switchRole(role);

  document.getElementById('chat-area').innerHTML = '';
  hideWelcomeScreen();
  messages = [];

  try {
    const q = query(collection(db, 'sessions'), where('userId', '==', currentUser.uid));
    const snapshot = await getDocs(q);

    snapshot.forEach(function(docSnap) {
      if (docSnap.id === sessionId) {
        const session = docSnap.data();
        const savedMessages = session.messages || [];

        if (savedMessages.length === 0) {
          showWelcomeMessage();
        } else {
          savedMessages.forEach(function(msg) {
            addMessageToChat(msg.role, msg.text, msg.feedback || null);
            messages.push(msg);
          });
          updateArgCounter();
        }
      }
    });
  } catch (error) {
    console.error('Error loading session:', error);
    showWelcomeMessage();
  }
}


// ══════════════════════════════════════════
// SAVE MESSAGE TO FIREBASE
// ══════════════════════════════════════════
async function saveMessageToFirebase(role, text, feedback) {
  if (!currentSessionId) return;
  try {
    const sessionRef = doc(db, 'sessions', currentSessionId);
    await updateDoc(sessionRef, {
      messages: arrayUnion({ role, text, feedback: feedback || null })
    });
  } catch (error) {
    console.error('Error saving message:', error);
  }
}


// ══════════════════════════════════════════
// SEND MESSAGE
// ══════════════════════════════════════════
window.sendMessage = async function() {
  if (isLoading) return;
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';

  addMessageToChat('user', text, null);
  messages.push({ role: 'user', text });
  updateArgCounter();
  await saveMessageToFirebase('user', text, null);
  setTimeout(function() {
    getAIResponse(text);
  }, 2000);
}


// ══════════════════════════════════════════
// GEMINI API CALL
// ══════════════════════════════════════════
async function getAIResponse(userMessage) {
  isLoading = true;
  document.getElementById('send-btn').disabled = true;
  document.getElementById('send-btn').style.opacity = '0.4';
  showTypingIndicator();

  try {
    // Only send last 10 messages to avoid request being too large
    const recentMessages = messages.slice(-10);
    const conversationHistory = recentMessages.map(function(msg) {
      return {
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.text
      };
    });

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: systemPrompts[currentRole].replace('{DIFFICULTY}', difficultyInstructions[currentDifficulty])
          },
          ...conversationHistory
        ],
        max_tokens: 500,
        temperature: 0.7
      })
    });

    const data = await response.json();
    const aiText = data.choices[0].message.content;
    const parsed = parseFeedback(aiText);

    messages.push({ role: 'ai', text: parsed.mainText, feedback: parsed.feedback });
    await saveMessageToFirebase('ai', parsed.mainText, parsed.feedback);
    addMessageToChat('ai', parsed.mainText, parsed.feedback);

  } catch (error) {
    console.error('API Error:', error);
    hideTypingIndicator();

    const errorDiv = document.createElement('div');
    errorDiv.className = 'msg msg-ai';

    // Detect error type
    let errorMsg, showRetry, retryDelay;

    const errorStr = JSON.stringify(error) + (error.message || '');

    if (errorStr.includes('429')) {
      errorMsg = '⏳ Too many requests — Gemini is rate limiting. Retrying in 15 seconds...';
      showRetry = true;
      retryDelay = 15000;
    } else if (errorStr.includes('503') || errorStr.includes('502')) {
      errorMsg = '🔧 Gemini servers are temporarily overloaded. Retrying in 20 seconds...';
      showRetry = true;
      retryDelay = 20000;
    } else if (errorStr.includes('401') || errorStr.includes('403')) {
      errorMsg = '🔑 API key issue. Please check your Gemini API key.';
      showRetry = false;
    } else if (errorStr.includes('fetch') || errorStr.includes('network') || errorStr.includes('Failed')) {
      errorMsg = '📶 Network error. Please check your internet connection.';
      showRetry = true;
      retryDelay = 5000;
    } else {
      errorMsg = '⚠️ Something went wrong. Please try again.';
      showRetry = true;
      retryDelay = 5000;
    }

    // Get last user message for retry
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');

    errorDiv.innerHTML = `
      <div class="msg-avatar ai-av">⚖</div>
      <div>
        <div class="msg-bubble error-bubble">
          <div class="error-msg-text">${errorMsg}</div>
          ${showRetry ? `
          <div class="error-actions">
            <button class="btn-retry" id="retry-btn">↻ Retry now</button>
            <span class="error-hint">or wait for auto-retry</span>
          </div>
          <div class="retry-bar">
            <div class="retry-progress" id="retry-progress"></div>
          </div>` : ''}
        </div>
      </div>
    `;

    document.getElementById('chat-area').appendChild(errorDiv);
    document.getElementById('chat-area').scrollTop = document.getElementById('chat-area').scrollHeight;

    if (showRetry && lastUserMsg) {
      // Animate progress bar
      const progressEl = errorDiv.querySelector('#retry-progress');
      if (progressEl) {
        progressEl.style.transition = `width ${retryDelay}ms linear`;
        setTimeout(function() { progressEl.style.width = '100%'; }, 100);
      }

      // Auto retry after delay
      const autoRetry = setTimeout(function() {
        errorDiv.remove();
        getAIResponse(lastUserMsg.text);
      }, retryDelay);

      // Manual retry button
      const retryBtn = errorDiv.querySelector('#retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', function() {
          clearTimeout(autoRetry);
          errorDiv.remove();
          getAIResponse(lastUserMsg.text);
        });
      }
    }
  }

  isLoading = false;
  document.getElementById('send-btn').disabled = false;
  document.getElementById('send-btn').style.opacity = '1';
  hideTypingIndicator();
}


// ══════════════════════════════════════════
// WELCOME MESSAGE
// ══════════════════════════════════════════
function showWelcomeMessage() {
  const welcomes = {
    opposing: "I represent the opposing party. I will challenge every assertion you make, every section you cite, and every witness you rely upon.\n\nState your opening submission. I am ready.",
    judge: "This Court is now in session. You may commence your submissions. The Court expects proper citations and precise section references.\n\nProceed, counsel.",
    supporting: "I have reviewed your brief. There is good material here to work with.\n\nTell me your current argument and I will help you make it airtight."
  };
  addMessageToChat('ai', welcomes[currentRole], null);
}


// ══════════════════════════════════════════
// PARSE FEEDBACK
// ══════════════════════════════════════════
function parseFeedback(fullText) {
  // Try multiple possible feedback markers
  const markers = ['FEEDBACK:', 'Feedback:', '**FEEDBACK:**', '**Feedback:**'];
  let feedbackIndex = -1;
  
  for (const marker of markers) {
    const idx = fullText.indexOf(marker);
    if (idx !== -1) {
      feedbackIndex = idx;
      break;
    }
  }

  if (feedbackIndex === -1) return { mainText: fullText.trim(), feedback: null };

  const mainText = fullText.substring(0, feedbackIndex).trim();
  const feedbackText = fullText.substring(feedbackIndex);

  // Try multiple label formats
  function extractFlexible(text, labels) {
    for (const label of labels) {
      const index = text.indexOf(label);
      if (index !== -1) {
        return text.substring(index + label.length).split('\n')[0].trim()
          .replace(/^\*+/, '').replace(/\*+$/, '').trim();
      }
    }
    return '';
  }

  return {
    mainText,
    feedback: {
      good: extractFlexible(feedbackText, ['GOOD:', 'Good:', '**GOOD:**', '**Good:**']),
      gap:  extractFlexible(feedbackText, ['GAP:', 'Gap:', '**GAP:**', '**Gap:**']),
      tip:  extractFlexible(feedbackText, ['TIP:', 'Tip:', '**TIP:**', '**Tip:**'])
    }
  };
}


// ══════════════════════════════════════════
// ADD MESSAGE TO CHAT UI
// ══════════════════════════════════════════
function addMessageToChat(role, text, feedback) {
  const chatArea = document.getElementById('chat-area');
  const msgDiv = document.createElement('div');
  const roleLabels = { opposing: 'Opposing counsel', judge: 'Judge', supporting: 'Supporting counsel' };

  if (role === 'user') {
    msgDiv.className = 'msg msg-user';
    msgDiv.innerHTML = `
      <div>
        <div class="msg-bubble user-bubble">${escapeHtml(text)}</div>
      </div>
      <div class="msg-avatar user-av">${window.userInitial || 'U'}</div>
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
        <div class="msg-label">${roleLabels[currentRole]}</div>
        <div class="msg-bubble">${escapeHtml(text)}${feedbackHtml}</div>
      </div>
    `;
  }

  chatArea.appendChild(msgDiv);
  chatArea.scrollTop = chatArea.scrollHeight;
}


// ══════════════════════════════════════════
// TYPING INDICATOR
// ══════════════════════════════════════════
function showTypingIndicator() {
  const chatArea = document.getElementById('chat-area');
  const indicator = document.createElement('div');
  indicator.id = 'typing-indicator';
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

function hideTypingIndicator() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}


// ══════════════════════════════════════════
// ROLE SWITCHING
// ══════════════════════════════════════════
window.switchRole = function(role) {
  currentRole = role;
  document.getElementById('btn-judge').className = 'role-btn';
  document.getElementById('btn-opposing').className = 'role-btn';
  document.getElementById('btn-supporting').className = 'role-btn';
  document.getElementById('btn-' + role).className = 'role-btn role-active-' + role;
  const labels = { judge: 'Judge', opposing: 'opposing counsel', supporting: 'supporting counsel' };
  document.querySelector('.hint-role').textContent = labels[role];
}


// ══════════════════════════════════════════
// MODAL
// ══════════════════════════════════════════
window.openModal = function() { document.getElementById('modal').classList.remove('hidden'); }
window.closeModal = function() { document.getElementById('modal').classList.add('hidden'); }
document.getElementById('modal').addEventListener('click', function(e) { if (e.target === this) closeModal(); });
window.selectRole = function(role) {
  document.getElementById('opt-judge').className = 'role-option';
  document.getElementById('opt-opposing').className = 'role-option';
  document.getElementById('opt-supporting').className = 'role-option';
  document.getElementById('opt-' + role).className = 'role-option role-sel-' + role;
  currentRole = role;
}


// ══════════════════════════════════════════
// KEYBOARD + TEXTAREA
// ══════════════════════════════════════════
document.getElementById('msg-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
document.getElementById('msg-input').addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 140) + 'px';
});


// ══════════════════════════════════════════
// SECURITY HELPER
// ══════════════════════════════════════════
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}
// ══════════════════════════════════════════
// DELETE SESSION
// ══════════════════════════════════════════
async function deleteSession(sessionId, sessionElement) {
  // Ask user to confirm first
  const confirmed = confirm('Delete this session? This cannot be undone.');
  if (!confirmed) return;

  try {
    // Delete from Firebase
    const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await deleteDoc(doc(db, 'sessions', sessionId));

    // Remove from sidebar
    sessionElement.remove();

    // If this was the active session, clear the chat
    if (currentSessionId === sessionId) {
      currentSessionId = null;
      document.getElementById('chat-area').innerHTML = '';
      document.getElementById('session-title-display').textContent = 'Select a session';
      messages = [];
        }

    // Show empty message if no sessions left
    const list = document.getElementById('sessions-list');
    if (list.children.length === 0) {
      list.innerHTML = '<div style="padding:10px 16px;color:var(--text3);font-size:12px">No sessions yet. Create one!</div>';
    }

  } catch (error) {
    console.error('Error deleting session:', error);
  }
}
// ══════════════════════════════════════════
// SCORE CARD
// ══════════════════════════════════════════
window.showScoreCard = async function() {
  const userMessages = messages.filter(m => m.role === 'user');

  if (userMessages.length < 2) {
    alert('Practice more before requesting a score — at least 2 arguments needed.');
    return;
  }

  // Check if saved score exists in Firebase
  if (currentSessionId) {
    try {
      const sessionRef = doc(db, 'sessions', currentSessionId);
      const sessionSnap = await getDoc(sessionRef);
      if (sessionSnap.exists()) {
        const data = sessionSnap.data();
        if (data.savedReport && data.scoredAtArgCount === userMessages.length) {
          // Show saved report
          showSavedReport(data.savedReport, userMessages.length, data.scoredAtArgCount);
          return;
        }
        if (data.savedReport && data.scoredAtArgCount < userMessages.length) {
          // New arguments added — show saved report with refresh button active
          showSavedReport(data.savedReport, userMessages.length, data.scoredAtArgCount);
          return;
        }
      }
    } catch (error) {
      console.error('Error checking saved score:', error);
    }
  }

  // No saved score — generate new one
  await generateNewScore(userMessages);
}

// ══════════════════════════════════════════
// SHOW SAVED REPORT
// ══════════════════════════════════════════
function showSavedReport(report, currentArgCount, scoredAtArgCount) {
  const roleLabels = { judge: 'Judge', opposing: 'Opposing Counsel', supporting: 'Supporting Counsel' };
  const sessionName = document.getElementById('session-title-display').textContent;
  const scoreColor = report.score >= 8 ? '#4caf7d' : report.score >= 6 ? '#c9a96e' : '#e07a5f';
  const hasNewArgs = currentArgCount > scoredAtArgCount;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '300';
  overlay.style.overflowY = 'auto';

  overlay.innerHTML = `
    <div class="modal" style="max-width:500px;max-height:90vh;overflow-y:auto">

      <!-- Header -->
      <div style="text-align:center;margin-bottom:24px">
        <div style="font-size:36px;margin-bottom:10px">⚖</div>
        <div style="font-family:var(--font-display);font-size:22px;margin-bottom:4px">Performance Report</div>
        <div style="font-size:12px;color:var(--text3)">${sessionName} · vs ${roleLabels[currentRole]}</div>
        ${hasNewArgs ? `<div style="font-size:11px;color:var(--accent);margin-top:6px;background:rgba(201,169,110,0.1);border-radius:20px;padding:4px 12px;display:inline-block">
          ${currentArgCount - scoredAtArgCount} new argument(s) added — refresh to update score
        </div>` : `<div style="font-size:11px;color:var(--text3);margin-top:6px">Saved report · Add more arguments to refresh</div>`}
      </div>

      <!-- Score -->
      <div style="background:var(--surface2);border-radius:12px;padding:20px;margin-bottom:16px;display:flex;align-items:center;justify-content:center;gap:24px">
        <div style="text-align:center">
          <div style="font-size:52px;font-family:var(--font-display);color:${scoreColor};line-height:1">${report.score}<span style="font-size:22px;color:var(--text3)">/10</span></div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">Overall score</div>
        </div>
        <div style="width:1px;height:50px;background:var(--border)"></div>
        <div style="text-align:center">
          <div style="font-size:36px;font-weight:700;color:${scoreColor};line-height:1">${report.grade}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:4px">${report.verdict}</div>
        </div>
      </div>

      <!-- Summary -->
      <div style="background:var(--surface2);border-radius:10px;padding:16px;margin-bottom:16px;font-size:13px;color:var(--text2);line-height:1.7;border-left:3px solid var(--accent)">
        ${report.summary}
      </div>

      <!-- Strengths -->
      <div style="margin-bottom:16px">
        <div style="font-size:11px;color:#4caf7d;letter-spacing:1px;text-transform:uppercase;font-weight:600;margin-bottom:10px">✓ What you did well</div>
        ${report.strengths.map(s => `
          <div class="sc-row"><div class="sc-dot" style="background:#4caf7d"></div><div class="sc-text">${s}</div></div>`).join('')}
      </div>

      <!-- Weaknesses -->
      <div style="margin-bottom:16px">
        <div style="font-size:11px;color:#e05555;letter-spacing:1px;text-transform:uppercase;font-weight:600;margin-bottom:10px">✗ Areas to improve</div>
        ${report.weaknesses.map(w => `
          <div class="sc-row"><div class="sc-dot" style="background:#e05555"></div><div class="sc-text">${w}</div></div>`).join('')}
      </div>

      <!-- Missed laws -->
      ${report.missed_laws && report.missed_laws.length > 0 ? `
      <div style="margin-bottom:16px">
        <div style="font-size:11px;color:var(--accent);letter-spacing:1px;text-transform:uppercase;font-weight:600;margin-bottom:10px">📚 Laws you should have cited</div>
        ${report.missed_laws.map(l => `
          <div class="sc-row"><div class="sc-dot" style="background:var(--accent)"></div><div class="sc-text">${l}</div></div>`).join('')}
      </div>` : ''}

      <!-- Improvement -->
      <div style="background:rgba(201,169,110,0.08);border:1px solid rgba(201,169,110,0.2);border-radius:10px;padding:14px;margin-bottom:20px">
        <div style="font-size:11px;color:var(--accent);letter-spacing:1px;text-transform:uppercase;font-weight:600;margin-bottom:6px">→ For your next session</div>
        <div style="font-size:13px;color:var(--text2);line-height:1.6">${report.improvement}</div>
      </div>

      <!-- Buttons -->
      <div style="display:flex;gap:10px">
        ${hasNewArgs ? `
        <button class="btn-primary" style="flex:1" onclick="refreshScore(this)">
          🔄 Refresh score
        </button>` : `
        <button class="btn-primary" style="flex:1;opacity:0.5;cursor:not-allowed" title="Add more arguments first">
          🔄 Add arguments to refresh
        </button>`}
        <button class="btn-cancel" style="flex:1" onclick="this.closest('.modal-overlay').remove()">Close</button>
      </div>

    </div>
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) overlay.remove();
  });
}

// ══════════════════════════════════════════
// REFRESH SCORE
// ══════════════════════════════════════════
window.refreshScore = async function(btn) {
  const overlay = btn.closest('.modal-overlay');
  overlay.remove();
  const userMessages = messages.filter(m => m.role === 'user');
  await generateNewScore(userMessages);
}

// ══════════════════════════════════════════
// GENERATE NEW SCORE
// ══════════════════════════════════════════
async function generateNewScore(userMessages) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '300';
  overlay.innerHTML = `
    <div class="modal" style="max-width:460px;text-align:center;padding:40px">
      <div style="font-size:40px;margin-bottom:16px">⚖</div>
      <div style="font-family:var(--font-display);font-size:20px;margin-bottom:8px">Analyzing your performance...</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:24px">AI is reviewing your arguments</div>
      <div class="retry-bar" style="max-width:200px;margin:0 auto">
        <div class="retry-progress" id="score-progress" style="transition:width 8s linear"></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  setTimeout(function() {
    const prog = document.getElementById('score-progress');
    if (prog) prog.style.width = '90%';
  }, 100);

  try {
    const roleLabels = { judge: 'Judge', opposing: 'Opposing Counsel', supporting: 'Supporting Counsel' };
    const transcript = messages.map(function(msg) {
      const speaker = msg.role === 'user' ? 'STUDENT/LAWYER' : roleLabels[currentRole].toUpperCase();
      return speaker + ': ' + msg.text;
    }).join('\n\n');

    const sessionName = document.getElementById('session-title-display').textContent;

    const analysisPrompt = `You are an expert Indian law professor and senior advocate with 30 years of experience. Analyze this courtroom practice session and provide a detailed performance report.

SESSION: ${sessionName}
AI ROLE: ${roleLabels[currentRole]}

TRANSCRIPT:
${transcript}

Provide a performance report in EXACTLY this JSON format, nothing else:
{
  "score": <number 1-10>,
  "grade": "<A+/A/B+/B/C+/C>",
  "summary": "<2-3 sentence overall assessment>",
  "strengths": ["<specific strength 1>", "<specific strength 2>", "<specific strength 3>"],
  "weaknesses": ["<specific weakness 1>", "<specific weakness 2>", "<specific weakness 3>"],
  "missed_laws": ["<specific section or case 1>", "<specific section or case 2>"],
  "improvement": "<one specific actionable advice>",
  "verdict": "<one line dramatic verdict like a judge would give>"
}

Be honest and specific — mention actual arguments from the transcript.`;

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: analysisPrompt }],
        max_tokens: 800,
        temperature: 0.3
      })
    });

    const data = await response.json();
    let reportText = data.choices[0].message.content;
    reportText = reportText.replace(/```json/g, '').replace(/```/g, '').trim();
    const report = JSON.parse(reportText);

    // Save to Firebase
    if (currentSessionId) {
      try {
        const sessionRef = doc(db, 'sessions', currentSessionId);
        await updateDoc(sessionRef, {
          savedReport: report,
          scoredAtArgCount: userMessages.length
        });
      } catch (error) {
        console.error('Error saving report:', error);
      }
    }

    // Submit to leaderboard
    const sessionName2 = document.getElementById('session-title-display').textContent;
    submitToLeaderboard(report.score, sessionName2, currentRole);

    overlay.remove();
    showSavedReport(report, userMessages.length, userMessages.length);

  } catch (error) {
    console.error('Score card error:', error);
    overlay.innerHTML = `
      <div class="modal" style="max-width:400px;text-align:center">
        <div style="font-size:36px;margin-bottom:12px">⚠️</div>
        <div class="modal-title" style="margin-bottom:8px">Could not generate report</div>
        <div style="font-size:13px;color:var(--text2);margin-bottom:20px">Please try again.</div>
        <button class="btn-primary" onclick="this.closest('.modal-overlay').remove()">Close</button>
      </div>
    `;
  }
}

// ══════════════════════════════════════════
// MOBILE SIDEBAR TOGGLE
// ══════════════════════════════════════════
window.toggleSidebar = function() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('mobile-overlay');
  sidebar.classList.toggle('mobile-open');
  overlay.classList.toggle('active');
}

window.closeSidebar = function() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('mobile-overlay');
  sidebar.classList.remove('mobile-open');
  overlay.classList.remove('active');
}
// ══════════════════════════════════════════
// WELCOME SCREEN
// ══════════════════════════════════════════
function showWelcomeScreen() {
  const ws = document.getElementById('welcome-screen');
  if (ws) ws.style.display = 'flex';
}

function hideWelcomeScreen() {
  const ws = document.getElementById('welcome-screen');
  if (ws) ws.style.display = 'none';
}

window.quickStart = async function(name, role, brief) {
  if (!currentUser) return;

  // Set role
  currentRole = role;
  switchRole(role);

  try {
    const docRef = await addDoc(collection(db, 'sessions'), {
      name: name,
      role: role,
      brief: brief,
      messages: [],
      createdAt: new Date(),
      userId: currentUser.uid
    });

    currentSessionId = docRef.id;
    addSessionToSidebar(name, role, docRef.id, true);

    hideWelcomeScreen();
    document.getElementById('chat-area').innerHTML = '';
    messages = [];
    document.getElementById('session-title-display').textContent = name;

    // Send brief to AI and get opening message
    messages.push({ role: 'user', text: 'Case brief: ' + brief + '\n\nPlease introduce yourself in your role and invite me to begin.' });
    setTimeout(function() {
      getAIResponse('Case brief: ' + brief);
    }, 2000);

  } catch (error) {
    console.error('Error creating quick session:', error);
  }
}

// ══════════════════════════════════════════
// RENAME SESSION
// ══════════════════════════════════════════
window.makeEditable = function(el) {
  if (!currentSessionId) return;

  const originalText = el.textContent;
  el.contentEditable = true;
  el.focus();

  // Select all text
  const range = document.createRange();
  range.selectNodeContents(el);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);

  // Add editing style
  el.style.background = 'var(--surface2)';
  el.style.borderRadius = '6px';
  el.style.padding = '2px 8px';
  el.style.outline = '1px solid var(--accent)';

  // Save on Enter or blur
  async function saveRename() {
    const newName = el.textContent.trim();
    el.contentEditable = false;
    el.style.background = '';
    el.style.borderRadius = '';
    el.style.padding = '';
    el.style.outline = '';

    if (!newName || newName === originalText) return;

    try {
      // Update in Firebase
      const sessionRef = doc(db, 'sessions', currentSessionId);
      await updateDoc(sessionRef, { name: newName });

      // Update in sidebar
      document.querySelectorAll('.session-item').forEach(function(item) {
        if (item.dataset.sessionId === currentSessionId) {
          item.querySelector('.session-title').textContent = newName;
        }
      });

    } catch (error) {
      console.error('Error renaming session:', error);
      el.textContent = originalText;
    }
  }

  el.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveRename();
    }
    if (e.key === 'Escape') {
      el.textContent = originalText;
      el.contentEditable = false;
      el.style.background = '';
      el.style.outline = '';
    }
  }, { once: true });

  el.addEventListener('blur', saveRename, { once: true });
}

// ══════════════════════════════════════════
// PDF UPLOAD AND TEXT EXTRACTION
// ══════════════════════════════════════════
let extractedPdfText = '';

window.handlePdfUpload = async function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById('pdf-status');
  const uploadArea = document.getElementById('pdf-upload-area');

  if (file.size > 10 * 1024 * 1024) {
    statusEl.style.color = 'var(--danger)';
    statusEl.textContent = 'File too large. Please upload a PDF under 10MB.';
    return;
  }

  statusEl.style.color = 'var(--accent)';
  statusEl.textContent = '⏳ Reading PDF...';

  try {
    const arrayBuffer = await file.arrayBuffer();

    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;

    let fullText = '';
    const pagesToRead = Math.min(totalPages, 10);

    for (let i = 1; i <= pagesToRead; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }

    if (!fullText.trim()) {
      statusEl.style.color = 'var(--danger)';
      statusEl.textContent = 'Could not extract text. Try a text-based PDF (not scanned).';
      return;
    }

    extractedPdfText = fullText.substring(0, 3000);

    uploadArea.classList.add('has-file');
    uploadArea.querySelector('.pdf-upload-icon').textContent = '✅';
    uploadArea.querySelector('.pdf-upload-text').textContent = file.name;
    uploadArea.querySelector('.pdf-upload-sub').textContent = totalPages + ' pages · Text extracted successfully';

    statusEl.style.color = 'var(--supporting)';
    statusEl.textContent = '✓ PDF read successfully — AI will use this as the case brief';

    const briefInput = document.getElementById('new-session-brief');
    if (!briefInput.value.trim()) {
      briefInput.placeholder = 'PDF uploaded — you can add extra notes here or leave blank';
    }

  } catch (error) {
    console.error('PDF Error:', error);
    statusEl.style.color = 'var(--danger)';
    statusEl.textContent = 'Error reading PDF. Make sure it is a valid PDF file.';
  }
}

// ══════════════════════════════════════════
// MID SESSION FILE UPLOAD
// ══════════════════════════════════════════
window.handleMidSessionFile = async function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const isPdf = file.type === 'application/pdf';
  const isImage = file.type.startsWith('image/');

  if (!isPdf && !isImage) {
    alert('Please upload a PDF or image file.');
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    alert('File too large. Please upload a file under 10MB.');
    return;
  }

  // Show uploading message in chat
  addMessageToChat('user', '📎 Uploading ' + file.name + '...', null);

  try {
    if (isPdf) {
      // Extract text from PDF
      const arrayBuffer = await file.arrayBuffer();
      const pdfjsLib = window['pdfjs-dist/build/pdf'];
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      const pagesToRead = Math.min(pdf.numPages, 10);

      for (let i = 1; i <= pagesToRead; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(item => item.str).join(' ') + '\n';
      }

      if (!fullText.trim()) {
        addMessageToChat('ai', 'Could not extract text from this PDF. Please try a text-based PDF.', null);
        return;
      }

      const extractedText = fullText.substring(0, 3000);
      const prompt = 'I am sharing a document with you:\n\n' + extractedText + '\n\nPlease analyze this document in the context of our case and respond accordingly.';

      messages.push({ role: 'user', text: prompt });
      await saveMessageToFirebase('user', prompt, null);

      setTimeout(function() {
        getAIResponse(prompt);
      }, 2000);

    } else if (isImage) {
      // Convert image to base64 and send to Gemini
      const base64 = await fileToBase64(file);
      const mimeType = file.type;

      // Add image message to chat visually
      addImageToChat(base64, file.name);

      // Send image to Gemini with vision
      await sendImageToGemini(base64, mimeType);
    }

  } catch (error) {
    console.error('File upload error:', error);
    addMessageToChat('ai', 'Error processing file. Please try again.', null);
  }

  // Reset file input
  event.target.value = '';
}

function fileToBase64(file) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onload = function() {
      resolve(reader.result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function addImageToChat(base64, filename) {
  const chatArea = document.getElementById('chat-area');
  const msgDiv = document.createElement('div');
  msgDiv.className = 'msg msg-user';
  msgDiv.innerHTML = `
    <div>
      <div class="msg-bubble user-bubble">
        <div style="font-size:12px;color:var(--text3);margin-bottom:8px">📎 ${escapeHtml(filename)}</div>
        <img src="data:image/jpeg;base64,${base64}" style="max-width:200px;border-radius:8px;display:block">
      </div>
    </div>
    <div class="msg-avatar user-av">${window.userInitial || 'U'}</div>
  `;
  chatArea.appendChild(msgDiv);
  chatArea.scrollTop = chatArea.scrollHeight;
}

async function sendImageToGemini(base64, mimeType) {
  isLoading = true;
  document.getElementById('send-btn').disabled = true;
  document.getElementById('send-btn').style.opacity = '0.4';
  showTypingIndicator();

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY
      },
      body: JSON.stringify({
        model: 'llama-3.2-11b-vision-preview',
        messages: [
          {
            role: 'system',
            content: systemPrompts[currentRole].replace('{DIFFICULTY}', difficultyInstructions[currentDifficulty])
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'I am sharing an image related to our case. Please analyze it in the context of Indian law.' },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
            ]
          }
        ],
        max_tokens: 500
      })
    });

    const data = await response.json();
    const aiText = data.choices[0].message.content;
    const parsed = parseFeedback(aiText);

    messages.push({ role: 'ai', text: parsed.mainText, feedback: parsed.feedback });
    await saveMessageToFirebase('ai', parsed.mainText, parsed.feedback);
    addMessageToChat('ai', parsed.mainText, parsed.feedback);

  } catch (error) {
    console.error('Image API Error:', error);
    addMessageToChat('ai', 'Error analyzing image. Please try again.', null);
  }

  isLoading = false;
  document.getElementById('send-btn').disabled = false;
  document.getElementById('send-btn').style.opacity = '1';
  hideTypingIndicator();
}

// ══════════════════════════════════════════
// EXPORT SESSION AS PDF
// ══════════════════════════════════════════
window.exportSession = function() {
  if (messages.length === 0) {
    alert('No messages to export. Start a session first.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth = 210;
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  let y = 20;

  function addText(text, x, fontSize, color, isBold) {
    pdf.setFontSize(fontSize);
    pdf.setTextColor(...color);
    if (isBold) pdf.setFont('helvetica', 'bold');
    else pdf.setFont('helvetica', 'normal');
    const lines = pdf.splitTextToSize(String(text), maxWidth);
    lines.forEach(function(line) {
      if (y > 270) { pdf.addPage(); y = 20; }
      pdf.text(line, x, y);
      y += fontSize * 0.45;
    });
  }

  function addLine(color) {
    if (y > 270) { pdf.addPage(); y = 20; }
    pdf.setDrawColor(...(color || [200, 200, 200]));
    pdf.line(margin, y, pageWidth - margin, y);
    y += 6;
  }

  // ── HEADER ──
  pdf.setFillColor(20, 20, 40);
  pdf.rect(0, 0, pageWidth, 42, 'F');

  pdf.setFontSize(24);
  pdf.setTextColor(201, 169, 110);
  pdf.setFont('helvetica', 'bold');
  pdf.text('⚖ LexArena', margin, 18);

  pdf.setFontSize(10);
  pdf.setTextColor(180, 180, 200);
  pdf.setFont('helvetica', 'normal');
  pdf.text('AI Courtroom Simulator · Indian Law', margin, 26);

  pdf.setFontSize(12);
  pdf.setTextColor(255, 255, 255);
  const sessionName = document.getElementById('session-title-display').textContent;
  pdf.text(sessionName, margin, 36);

  y = 52;

  // ── SESSION INFO BOX ──
  pdf.setFillColor(245, 245, 250);
  pdf.roundedRect(margin, y - 5, maxWidth, 28, 3, 3, 'F');

  const roleLabels = { judge: 'Judge', opposing: 'Opposing Counsel', supporting: 'Supporting Counsel' };
  const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const userMsgs = messages.filter(m => m.role === 'user').length;

  pdf.setFontSize(10);
  pdf.setTextColor(80, 80, 100);
  pdf.setFont('helvetica', 'normal');
  pdf.text('AI Role: ' + (roleLabels[currentRole] || currentRole), margin + 4, y + 4);
  pdf.text('Date: ' + date, margin + 4, y + 11);
  pdf.text('Total arguments: ' + userMsgs, margin + 4, y + 18);

  y += 34;
  addLine([180, 180, 200]);

  // ── MESSAGES ──
  let argCount = 0;
  messages.forEach(function(msg) {
    if (msg.role === 'user') {
      argCount++;

      // User label
      pdf.setFillColor(230, 240, 255);
      if (y > 265) { pdf.addPage(); y = 20; }
      pdf.roundedRect(margin, y - 4, maxWidth, 8, 2, 2, 'F');
      addText('YOU — Argument ' + argCount, margin + 3, 10, [30, 60, 120], true);
      y += 2;

      // User message text
      addText(msg.text.replace(/<br>/g, '\n'), margin + 3, 11, [20, 20, 40], false);
      y += 6;

    } else {
      // AI label
      pdf.setFillColor(255, 245, 230);
      if (y > 265) { pdf.addPage(); y = 20; }
      pdf.roundedRect(margin, y - 4, maxWidth, 8, 2, 2, 'F');
      const roleLabel = roleLabels[currentRole] || 'AI';
      addText(roleLabel.toUpperCase(), margin + 3, 10, [140, 80, 20], true);
      y += 2;

      // AI message text
      addText(msg.text.replace(/<br>/g, '\n'), margin + 3, 11, [40, 40, 60], false);
      y += 4;

      // Feedback block
      if (msg.feedback && (msg.feedback.good || msg.feedback.gap || msg.feedback.tip)) {
        pdf.setFillColor(252, 250, 240);
        pdf.setDrawColor(201, 169, 110);
        if (y > 265) { pdf.addPage(); y = 20; }
        pdf.roundedRect(margin + 4, y - 2, maxWidth - 8, 26, 2, 2, 'FD');

        addText('ARGUMENT ANALYSIS', margin + 8, 9, [160, 120, 40], true);
        y += 2;
        if (msg.feedback.good) addText('✓  ' + msg.feedback.good, margin + 8, 10, [30, 120, 70], false);
        y += 1;
        if (msg.feedback.gap)  addText('✗  ' + msg.feedback.gap,  margin + 8, 10, [180, 40, 40], false);
        y += 1;
        if (msg.feedback.tip)  addText('→  ' + msg.feedback.tip,  margin + 8, 10, [140, 100, 20], false);
        y += 6;
      }

      addLine([220, 220, 230]);
    }
  });

  // ── SCORE SUMMARY ──
  const aiWithFeedback = messages.filter(m => m.role === 'ai' && m.feedback);
  if (aiWithFeedback.length > 0) {
    y += 4;
    if (y > 240) { pdf.addPage(); y = 20; }

    pdf.setFillColor(20, 20, 40);
    pdf.roundedRect(margin, y - 5, maxWidth, 44, 3, 3, 'F');

    pdf.setFontSize(13);
    pdf.setTextColor(201, 169, 110);
    pdf.setFont('helvetica', 'bold');
    pdf.text('PERFORMANCE SUMMARY', margin + 4, y + 6);

    let goodCount = 0, gapCount = 0;
    aiWithFeedback.forEach(function(m) {
      if (m.feedback && m.feedback.good) goodCount++;
      if (m.feedback && m.feedback.gap) gapCount++;
    });

    const total = goodCount + gapCount;
    const score = total > 0 ? Math.round((goodCount / total) * 10) : 5;
    const grade = score >= 8 ? 'A' : score >= 6 ? 'B' : score >= 5 ? 'C+' : 'C';

    pdf.setFontSize(20);
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.text(score + '/10  ' + grade, margin + 4, y + 20);

    pdf.setFontSize(10);
    pdf.setTextColor(150, 220, 150);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Strong arguments: ' + goodCount, margin + 4, y + 30);
    pdf.setTextColor(220, 120, 120);
    pdf.text('Gaps identified: ' + gapCount, margin + 60, y + 30);

    y += 50;
  }

  // ── FOOTER ──
  y += 6;
  addLine([200, 200, 210]);
  addText('Generated by LexArena · lexarena.netlify.app · ' + date, margin, 9, [150, 150, 170], false);

  // ── SAVE ──
  const filename = sessionName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_lexarena.pdf';
  pdf.save(filename);
}
// ══════════════════════════════════════════
// SHARE SESSION
// ══════════════════════════════════════════
window.shareSession = async function() {
  if (!currentSessionId) {
    alert('No active session to share.');
    return;
  }

  try {
    // Update session to make it publicly readable
    const sessionRef = doc(db, 'sessions', currentSessionId);
    await updateDoc(sessionRef, { isPublic: true });

    // Generate share URL
    const shareUrl = window.location.origin + '/share.html?id=' + currentSessionId;

    // Show share modal
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '300';
    overlay.innerHTML = `
      <div class="modal" style="max-width:420px;text-align:center">
        <div style="font-size:36px;margin-bottom:12px">🔗</div>
        <div class="modal-title" style="margin-bottom:8px">Share this session</div>
        <div style="font-size:13px;color:var(--text2);margin-bottom:20px;line-height:1.6">
          Anyone with this link can view your session as read-only. 
          Perfect for sharing with a professor or mentor.
        </div>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;
          padding:12px 14px;font-family:var(--font-mono);font-size:11px;color:var(--accent);
          word-break:break-all;margin-bottom:16px;text-align:left">
          ${shareUrl}
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn-primary" onclick="copyShareLink('${shareUrl}', this)" style="flex:2">
            Copy link
          </button>
          <button class="btn-cancel" onclick="this.closest('.modal-overlay').remove()" style="flex:1">
            Close
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });

  } catch (error) {
    console.error('Error sharing session:', error);
    alert('Error generating share link. Please try again.');
  }
}

window.copyShareLink = function(url, btn) {
  navigator.clipboard.writeText(url).then(function() {
    btn.textContent = '✓ Copied!';
    btn.style.background = 'var(--supporting)';
    setTimeout(function() {
      btn.textContent = 'Copy link';
      btn.style.background = '';
    }, 2000);
  });
}

// ══════════════════════════════════════════
// ARGUMENT COUNTER
// ══════════════════════════════════════════
function updateArgCounter() {
  const counter = document.getElementById('arg-counter');
  const countEl = document.getElementById('arg-count');
  if (!counter || !countEl) return;

  const count = messages.filter(m => m.role === 'user').length;

  if (count === 0) {
    counter.classList.add('hidden');
  } else {
    counter.classList.remove('hidden');
    countEl.textContent = count;
  }
}

// ══════════════════════════════════════════
// DIFFICULTY
// ══════════════════════════════════════════
window.changeDifficulty = function(value) {
  currentDifficulty = value;

  const messages = {
    beginner: '🟢 Beginner mode — AI will be patient and guide you.',
    intermediate: '🟡 Intermediate mode — Standard courtroom pressure.',
    expert: '🔴 Expert mode — AI will be relentless. Good luck.'
  };

  // Show brief toast notification
  showToast(messages[value]);
}

function showToast(message) {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.textContent = message;
  toast.style.cssText = `
    position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
    background:var(--surface);border:1px solid var(--border2);
    border-radius:8px;padding:10px 20px;font-size:13px;color:var(--text);
    z-index:500;box-shadow:0 4px 20px rgba(0,0,0,0.3);
    animation:fadeIn 0.2s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 3000);
}

// ══════════════════════════════════════════
// LEADERBOARD — SUBMIT SCORE
// ══════════════════════════════════════════
async function submitToLeaderboard(score, sessionName, role) {
  if (!currentUser || score < 6) return; // Only submit scores 6 and above

  try {
    const { addDoc, collection: col } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

    await addDoc(col(db, 'leaderboard'), {
      userName: currentUser.displayName || 'Anonymous',
      sessionName: sessionName,
      score: score,
      role: role,
      createdAt: new Date()
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
  }
}