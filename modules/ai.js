// ══════════════════════════════════════════
// ai.js — All Groq API calls & AI logic
// Handles: main response, case summary,
// image vision, feedback parsing,
// welcome message
// ══════════════════════════════════════════

import { state, SUMMARY_UPDATE_INTERVAL, systemPrompts, difficultyInstructions } from './state.js';
import { db }                          from './firebase.js';
import { doc, updateDoc }              from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { addMessageToChat, showTypingIndicator, hideTypingIndicator } from './ui.js';

const GROQ_API_URL = '/api/chat';


// ── FEEDBACK PARSER ──────────────────────
export function parseFeedback(fullText) {
  const markers = ['FEEDBACK:', 'Feedback:', '**FEEDBACK:**', '**Feedback:**'];
  let feedbackIndex = -1;

  for (const marker of markers) {
    const idx = fullText.indexOf(marker);
    if (idx !== -1) { feedbackIndex = idx; break; }
  }

  if (feedbackIndex === -1) return { mainText: fullText.trim(), feedback: null };

  const mainText    = fullText.substring(0, feedbackIndex).trim();
  const feedbackText = fullText.substring(feedbackIndex);

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
      gap:  extractFlexible(feedbackText, ['GAP:',  'Gap:',  '**GAP:**',  '**Gap:**']),
      tip:  extractFlexible(feedbackText, ['TIP:',  'Tip:',  '**TIP:**',  '**Tip:**'])
    }
  };
}


// ── WELCOME MESSAGE ──────────────────────
// Called when a session has no prior messages
export function showWelcomeMessage(saveToFirebase) {
  const welcomes = {
    opposing:   "I represent the opposing party. I will challenge every assertion you make, every section you cite, and every witness you rely upon.\n\nState your opening submission. I am ready.",
    judge:      "This Court is now in session. You may commence your submissions. The Court expects proper citations and precise section references.\n\nProceed, counsel.",
    supporting: "I have reviewed your brief. There is good material here to work with.\n\nTell me your current argument and I will help you make it airtight."
  };
  const welcomeText = welcomes[state.currentRole];
  addMessageToChat('ai', welcomeText, null);

  // Persist so it survives refresh
  state.messages.push({ role: 'ai', text: welcomeText, feedback: null });
  saveToFirebase('ai', welcomeText, null);
}


// ── MAIN AI RESPONSE ─────────────────────
export async function getAIResponse(userMessage, saveToFirebase) {
  state.isLoading = true;
  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled    = true;
  sendBtn.style.opacity = '0.4';
  showTypingIndicator();

  try {
    const recentMessages = state.messages.slice(-5);
    const conversationHistory = recentMessages.map(msg => ({
      role:    msg.role === 'user' ? 'user' : 'assistant',
      content: msg.text
    }));

    const basePrompt = systemPrompts[state.currentRole]
      .replace('{DIFFICULTY}', difficultyInstructions[state.currentDifficulty]);

    const systemPromptWithSummary = state.caseSummary
      ? basePrompt + '\n\nCASE SUMMARY SO FAR:\n' + state.caseSummary
      : basePrompt;

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:       'llama-3.3-70b-versatile',
        messages:    [{ role: 'system', content: systemPromptWithSummary }, ...conversationHistory],
        max_tokens:  500,
        temperature: 0.7
      })
    });

    const data   = await response.json();
    const aiText = data.choices[0].message.content;
    const parsed = parseFeedback(aiText);

    state.messages.push({ role: 'ai', text: parsed.mainText, feedback: parsed.feedback });
    await saveToFirebase('ai', parsed.mainText, parsed.feedback);
    addMessageToChat('ai', parsed.mainText, parsed.feedback);

  } catch (error) {
    console.error('API Error:', error);
    hideTypingIndicator();
    _showApiError(error, userMessage, saveToFirebase);
  }

  state.isLoading = false;
  sendBtn.disabled    = false;
  sendBtn.style.opacity = '1';
  hideTypingIndicator();
}


// ── IMAGE VISION ─────────────────────────
export async function sendImageToAI(base64, mimeType, saveToFirebase) {
  state.isLoading = true;
  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled    = true;
  sendBtn.style.opacity = '0.4';
  showTypingIndicator();

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.2-11b-vision-preview',
        messages: [
          {
            role:    'system',
            content: systemPrompts[state.currentRole]
              .replace('{DIFFICULTY}', difficultyInstructions[state.currentDifficulty])
          },
          {
            role:    'user',
            content: [
              { type: 'text',      text: 'I am sharing an image related to our case. Please analyze it in the context of Indian law.' },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
            ]
          }
        ],
        max_tokens: 500
      })
    });

    const data   = await response.json();
    const aiText = data.choices[0].message.content;
    const parsed = parseFeedback(aiText);

    state.messages.push({ role: 'ai', text: parsed.mainText, feedback: parsed.feedback });
    await saveToFirebase('ai', parsed.mainText, parsed.feedback);
    addMessageToChat('ai', parsed.mainText, parsed.feedback);

  } catch (error) {
    console.error('Image API Error:', error);
    addMessageToChat('ai', 'Error analyzing image. Please try again.', null);
  }

  state.isLoading = false;
  sendBtn.disabled    = false;
  sendBtn.style.opacity = '1';
  hideTypingIndicator();
}


// ── CASE SUMMARY ─────────────────────────
export async function updateCaseSummary() {
  if (state.messages.length < 6) return;

  try {
    const roleLabels     = { judge: 'Judge', opposing: 'Opposing Counsel', supporting: 'Supporting Counsel' };
    const recentExchanges = state.messages.slice(-10).map(msg => {
      const speaker = msg.role === 'user' ? 'LAWYER' : roleLabels[state.currentRole];
      return speaker + ': ' + msg.text;
    }).join('\n\n');

    const summaryPrompt = `Summarize this Indian courtroom practice session in 3 sentences maximum. Focus on: what case is being argued, what arguments the lawyer has made so far, and what key legal points have been raised or missed. Be specific about Indian law sections and cases mentioned.

EXCHANGES:
${recentExchanges}

Respond with ONLY the summary, no preamble.`;

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:       'llama-3.3-70b-versatile',
        messages:    [{ role: 'user', content: summaryPrompt }],
        max_tokens:  150,
        temperature: 0.3
      })
    });

    const data = await response.json();
    state.caseSummary = data.choices[0].message.content.trim();
    state.messagesSinceLastSummary = 0;

    if (state.currentSessionId) {
      const sessionRef = doc(db, 'sessions', state.currentSessionId);
      await updateDoc(sessionRef, { caseSummary: state.caseSummary });
    }

  } catch (error) {
    console.error('Summary update error:', error);
  }
}


// ── SCORE GENERATION ─────────────────────
export async function generateNewScore(userMessages) {
  const overlay = document.createElement('div');
  overlay.className    = 'modal-overlay';
  overlay.style.zIndex = '300';
  overlay.innerHTML    = `
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
  setTimeout(() => {
    const prog = document.getElementById('score-progress');
    if (prog) prog.style.width = '90%';
  }, 100);

  try {
    const roleLabels = { judge: 'Judge', opposing: 'Opposing Counsel', supporting: 'Supporting Counsel' };
    const transcript  = state.messages.map(msg => {
      const speaker = msg.role === 'user' ? 'STUDENT/LAWYER' : roleLabels[state.currentRole].toUpperCase();
      return speaker + ': ' + msg.text;
    }).join('\n\n');

    const sessionName     = document.getElementById('session-title-display').textContent;
    const analysisPrompt  = `You are an expert Indian law professor and senior advocate with 30 years of experience. Analyze this courtroom practice session and provide a detailed performance report.

SESSION: ${sessionName}
AI ROLE: ${roleLabels[state.currentRole]}

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:       'llama-3.3-70b-versatile',
        messages:    [{ role: 'user', content: analysisPrompt }],
        max_tokens:  800,
        temperature: 0.3
      })
    });

    const data = await response.json();
    let reportText = data.choices[0].message.content;
    reportText     = reportText.replace(/```json/g, '').replace(/```/g, '').trim();
    const report   = JSON.parse(reportText);

    if (state.currentSessionId) {
      const sessionRef = doc(db, 'sessions', state.currentSessionId);
      await updateDoc(sessionRef, {
        savedReport:      report,
        scoredAtArgCount: userMessages.length
      });
    }

    overlay.remove();
    return report;

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
    return null;
  }
}


// ── PRIVATE: API ERROR DISPLAY ───────────
function _showApiError(error, userMessage, saveToFirebase) {
  const chatArea  = document.getElementById('chat-area');
  const errorDiv  = document.createElement('div');
  errorDiv.className = 'msg msg-ai';

  const errorStr = JSON.stringify(error) + (error.message || '');
  let errorMsg, showRetry, retryDelay;

  if (errorStr.includes('429')) {
    errorMsg   = '⏳ Too many requests — Groq is rate limiting. Retrying in 15 seconds...';
    showRetry  = true;
    retryDelay = 15000;
  } else if (errorStr.includes('503') || errorStr.includes('502')) {
    errorMsg   = '🔧 Groq servers are temporarily overloaded. Retrying in 20 seconds...';
    showRetry  = true;
    retryDelay = 20000;
  } else if (errorStr.includes('401') || errorStr.includes('403')) {
    errorMsg  = '🔑 API key issue. Please contact support.';
    showRetry = false;
  } else if (errorStr.includes('fetch') || errorStr.includes('network') || errorStr.includes('Failed')) {
    errorMsg   = '📶 Network error. Please check your internet connection.';
    showRetry  = true;
    retryDelay = 5000;
  } else {
    errorMsg   = '⚠️ Something went wrong. Please try again.';
    showRetry  = true;
    retryDelay = 5000;
  }

  const lastUserMsg = [...state.messages].reverse().find(m => m.role === 'user');

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

  chatArea.appendChild(errorDiv);
  chatArea.scrollTop = chatArea.scrollHeight;

  if (showRetry && lastUserMsg) {
    const progressEl = errorDiv.querySelector('#retry-progress');
    if (progressEl) {
      progressEl.style.transition = `width ${retryDelay}ms linear`;
      setTimeout(() => { progressEl.style.width = '100%'; }, 100);
    }
    const autoRetry = setTimeout(() => {
      errorDiv.remove();
      getAIResponse(lastUserMsg.text, saveToFirebase);
    }, retryDelay);

    const retryBtn = errorDiv.querySelector('#retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        clearTimeout(autoRetry);
        errorDiv.remove();
        getAIResponse(lastUserMsg.text, saveToFirebase);
      });
    }
  }
}