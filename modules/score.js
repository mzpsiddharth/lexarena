// ══════════════════════════════════════════
// score.js — Score card, export PDF, share,
// leaderboard
// Imports: state, firebase, ui, ai
// ══════════════════════════════════════════

import { state }  from './state.js';
import { db }     from './firebase.js';
import { doc, getDoc, updateDoc, addDoc, collection } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { generateScore } from './ai.js';
import { escapeHtml }    from './ui.js';


// ── SCORE CARD ────────────────────────────
window.showScoreCard = async function() {
  const userMessages = state.messages.filter(m => m.role === 'user');
  if (userMessages.length < 2) { alert('Practice more before requesting a score — at least 2 arguments needed.'); return; }

  if (state.currentSessionId) {
    try {
      const snap = await getDoc(doc(db, 'sessions', state.currentSessionId));
      if (snap.exists() && snap.data().savedReport) {
        showSavedReport(snap.data().savedReport, userMessages.length, snap.data().scoredAtArgCount);
        return;
      }
    } catch (e) { console.error('Error checking saved score:', e); }
  }

  const report = await generateScore(userMessages);
  if (report) {
    submitToLeaderboard(report.score);
    showSavedReport(report, userMessages.length, userMessages.length);
  }
};


// ── SHOW SAVED REPORT ─────────────────────
function showSavedReport(report, currentArgCount, scoredAtArgCount) {
  const roleLabels  = { judge: 'Judge', opposing: 'Opposing Counsel', supporting: 'Supporting Counsel' };
  const sessionName = document.getElementById('session-title-display').textContent;
  const scoreColor  = report.score >= 8 ? '#4caf7d' : report.score >= 6 ? '#c9a96e' : '#e07a5f';
  const hasNewArgs  = currentArgCount > scoredAtArgCount;

  const overlay = document.createElement('div');
  overlay.className    = 'modal-overlay';
  overlay.style.zIndex = '300';
  overlay.style.overflowY = 'auto';
  overlay.innerHTML = `
    <div class="modal" style="max-width:500px;max-height:90vh;overflow-y:auto">
      <div style="text-align:center;margin-bottom:24px">
        <div style="font-size:36px;margin-bottom:10px">⚖</div>
        <div style="font-family:var(--font-display);font-size:22px;margin-bottom:4px">Performance Report</div>
        <div style="font-size:12px;color:var(--text3)">${escapeHtml(sessionName)} · vs ${roleLabels[state.currentRole]}</div>
        ${hasNewArgs
          ? `<div style="font-size:11px;color:var(--accent);margin-top:6px;background:rgba(201,169,110,0.1);border-radius:20px;padding:4px 12px;display:inline-block">${currentArgCount - scoredAtArgCount} new argument(s) — refresh to update</div>`
          : `<div style="font-size:11px;color:var(--text3);margin-top:6px">Saved report · Add more arguments to refresh</div>`}
      </div>

      <div style="background:var(--surface2);border-radius:12px;padding:20px;margin-bottom:16px;display:flex;align-items:center;justify-content:center;gap:24px">
        <div style="text-align:center">
          <div style="font-size:52px;font-family:var(--font-display);color:${scoreColor};line-height:1">${report.score}<span style="font-size:22px;color:var(--text3)">/10</span></div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">Overall score</div>
        </div>
        <div style="width:1px;height:50px;background:var(--border)"></div>
        <div style="text-align:center">
          <div style="font-size:36px;font-weight:700;color:${scoreColor};line-height:1">${report.grade}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:4px">${escapeHtml(report.verdict)}</div>
        </div>
      </div>

      <div style="background:var(--surface2);border-radius:10px;padding:16px;margin-bottom:16px;font-size:13px;color:var(--text2);line-height:1.7;border-left:3px solid var(--accent)">${escapeHtml(report.summary)}</div>

      <div style="margin-bottom:16px">
        <div style="font-size:11px;color:#4caf7d;letter-spacing:1px;text-transform:uppercase;font-weight:600;margin-bottom:10px">✓ What you did well</div>
        ${report.strengths.map(s => `<div class="sc-row"><div class="sc-dot" style="background:#4caf7d"></div><div class="sc-text">${escapeHtml(s)}</div></div>`).join('')}
      </div>
      <div style="margin-bottom:16px">
        <div style="font-size:11px;color:#e05555;letter-spacing:1px;text-transform:uppercase;font-weight:600;margin-bottom:10px">✗ Areas to improve</div>
        ${report.weaknesses.map(w => `<div class="sc-row"><div class="sc-dot" style="background:#e05555"></div><div class="sc-text">${escapeHtml(w)}</div></div>`).join('')}
      </div>
      ${report.missed_laws && report.missed_laws.length > 0 ? `
      <div style="margin-bottom:16px">
        <div style="font-size:11px;color:var(--accent);letter-spacing:1px;text-transform:uppercase;font-weight:600;margin-bottom:10px">📚 Laws you should have cited</div>
        ${report.missed_laws.map(l => `<div class="sc-row"><div class="sc-dot" style="background:var(--accent)"></div><div class="sc-text">${escapeHtml(l)}</div></div>`).join('')}
      </div>` : ''}

      <div style="background:rgba(201,169,110,0.08);border:1px solid rgba(201,169,110,0.2);border-radius:10px;padding:14px;margin-bottom:20px">
        <div style="font-size:11px;color:var(--accent);letter-spacing:1px;text-transform:uppercase;font-weight:600;margin-bottom:6px">→ For your next session</div>
        <div style="font-size:13px;color:var(--text2);line-height:1.6">${escapeHtml(report.improvement)}</div>
      </div>

      <div style="display:flex;gap:10px">
        ${hasNewArgs
          ? `<button class="btn-primary" style="flex:1" onclick="refreshScore(this)">🔄 Refresh score</button>`
          : `<button class="btn-primary" style="flex:1;opacity:0.5;cursor:not-allowed" title="Add more arguments first">🔄 Add arguments to refresh</button>`}
        <button class="btn-cancel" style="flex:1" onclick="this.closest('.modal-overlay').remove()">Close</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}


window.refreshScore = async function(btn) {
  btn.closest('.modal-overlay').remove();
  const userMessages = state.messages.filter(m => m.role === 'user');
  const report = await generateScore(userMessages);
  if (report) {
    submitToLeaderboard(report.score);
    showSavedReport(report, userMessages.length, userMessages.length);
  }
};


// ── LEADERBOARD ───────────────────────────
async function submitToLeaderboard(score) {
  if (!state.currentUser || score < 6) return;
  try {
    const sessionName = document.getElementById('session-title-display').textContent;
    await addDoc(collection(db, 'leaderboard'), {
      userName:    state.currentUser.displayName || 'Anonymous',
      sessionName: sessionName,
      score:       score,
      role:        state.currentRole,
      createdAt:   new Date()
    });
  } catch (e) { console.error('Leaderboard error:', e); }
}


// ── EXPORT PDF ────────────────────────────
window.exportSession = function() {
  if (state.messages.length === 0) { alert('No messages to export. Start a session first.'); return; }

  const { jsPDF }    = window.jspdf;
  const pdf          = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth    = 210;
  const margin       = 20;
  const maxWidth     = pageWidth - margin * 2;
  let y              = 20;

  function addText(text, x, fontSize, color, bold) {
    pdf.setFontSize(fontSize);
    pdf.setTextColor(...color);
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    const lines = pdf.splitTextToSize(String(text), maxWidth - (x - margin));
    lines.forEach(function(line) {
      if (y > 270) { pdf.addPage(); y = 20; }
      pdf.text(line, x, y);
      y += fontSize * 0.45;
    });
  }

  function addLine(color) {
    if (y > 270) { pdf.addPage(); y = 20; }
    pdf.setDrawColor(...(color || [200,200,200]));
    pdf.line(margin, y, pageWidth - margin, y);
    y += 6;
  }

  const roleLabels  = { judge: 'Judge', opposing: 'Opposing Counsel', supporting: 'Supporting Counsel' };
  const sessionName = document.getElementById('session-title-display').textContent;
  const date        = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  // Header
  pdf.setFillColor(20, 20, 40);
  pdf.rect(0, 0, pageWidth, 42, 'F');
  pdf.setFontSize(24); pdf.setTextColor(201,169,110); pdf.setFont('helvetica','bold');
  pdf.text('LexArena', margin, 18);
  pdf.setFontSize(10); pdf.setTextColor(180,180,200); pdf.setFont('helvetica','normal');
  pdf.text('AI Courtroom Simulator · Indian Law', margin, 26);
  pdf.setFontSize(12); pdf.setTextColor(255,255,255);
  pdf.text(sessionName, margin, 36);
  y = 52;

  // Session info
  pdf.setFillColor(245,245,250);
  pdf.roundedRect(margin, y-5, maxWidth, 28, 3, 3, 'F');
  pdf.setFontSize(10); pdf.setTextColor(80,80,100); pdf.setFont('helvetica','normal');
  pdf.text('AI Role: ' + (roleLabels[state.currentRole] || state.currentRole), margin+4, y+4);
  pdf.text('Date: ' + date, margin+4, y+11);
  pdf.text('Total arguments: ' + state.messages.filter(m => m.role==='user').length, margin+4, y+18);
  y += 34;
  addLine([180,180,200]);

  // Messages
  let argCount = 0;
  state.messages.forEach(function(msg) {
    if (msg.role === 'user') {
      argCount++;
      pdf.setFillColor(230,240,255);
      if (y > 265) { pdf.addPage(); y = 20; }
      pdf.roundedRect(margin, y-4, maxWidth, 8, 2, 2, 'F');
      addText('YOU — Argument ' + argCount, margin+3, 10, [30,60,120], true);
      y += 2;
      addText(msg.text.replace(/<br>/g, '\n'), margin+3, 11, [20,20,40], false);
      y += 6;
    } else {
      pdf.setFillColor(255,245,230);
      if (y > 265) { pdf.addPage(); y = 20; }
      pdf.roundedRect(margin, y-4, maxWidth, 8, 2, 2, 'F');
      addText((roleLabels[state.currentRole] || 'AI').toUpperCase(), margin+3, 10, [140,80,20], true);
      y += 2;
      addText(msg.text.replace(/<br>/g, '\n'), margin+3, 11, [40,40,60], false);
      y += 4;
      if (msg.feedback && (msg.feedback.good || msg.feedback.gap || msg.feedback.tip)) {
        pdf.setFillColor(252,250,240); pdf.setDrawColor(201,169,110);
        if (y > 265) { pdf.addPage(); y = 20; }
        pdf.roundedRect(margin+4, y-2, maxWidth-8, 26, 2, 2, 'FD');
        addText('ARGUMENT ANALYSIS', margin+8, 9, [160,120,40], true);
        y += 2;
        if (msg.feedback.good) addText('✓  ' + msg.feedback.good, margin+8, 10, [30,120,70],  false);
        if (msg.feedback.gap)  addText('✗  ' + msg.feedback.gap,  margin+8, 10, [180,40,40],  false);
        if (msg.feedback.tip)  addText('→  ' + msg.feedback.tip,  margin+8, 10, [140,100,20], false);
        y += 6;
      }
      addLine([220,220,230]);
    }
  });

  // Score summary
  const scored = state.messages.filter(m => m.role==='ai' && m.feedback);
  if (scored.length > 0) {
    y += 4;
    if (y > 240) { pdf.addPage(); y = 20; }
    pdf.setFillColor(20,20,40);
    pdf.roundedRect(margin, y-5, maxWidth, 44, 3, 3, 'F');
    pdf.setFontSize(13); pdf.setTextColor(201,169,110); pdf.setFont('helvetica','bold');
    pdf.text('PERFORMANCE SUMMARY', margin+4, y+6);
    let good = scored.filter(m=>m.feedback&&m.feedback.good).length;
    let gap  = scored.filter(m=>m.feedback&&m.feedback.gap).length;
    const total = good + gap;
    const score = total > 0 ? Math.round((good/total)*10) : 5;
    const grade = score>=8?'A':score>=6?'B':score>=5?'C+':'C';
    pdf.setFontSize(20); pdf.setTextColor(255,255,255); pdf.setFont('helvetica','bold');
    pdf.text(score+'/10  '+grade, margin+4, y+20);
    pdf.setFontSize(10); pdf.setTextColor(150,220,150); pdf.setFont('helvetica','normal');
    pdf.text('Strong arguments: '+good, margin+4, y+30);
    pdf.setTextColor(220,120,120);
    pdf.text('Gaps identified: '+gap, margin+60, y+30);
    y += 50;
  }

  y += 6;
  addLine([200,200,210]);
  addText('Generated by LexArena · lexarena-omega.vercel.app · ' + date, margin, 9, [150,150,170], false);
  pdf.save(sessionName.replace(/[^a-z0-9]/gi,'_').toLowerCase() + '_lexarena.pdf');
};


// ── SHARE SESSION ─────────────────────────
window.shareSession = async function() {
  if (!state.currentSessionId) { alert('No active session to share.'); return; }
  try {
    await updateDoc(doc(db, 'sessions', state.currentSessionId), { isPublic: true });
    const shareUrl = window.location.origin + '/share.html?id=' + state.currentSessionId;
    const overlay  = document.createElement('div');
    overlay.className    = 'modal-overlay';
    overlay.style.zIndex = '300';
    overlay.innerHTML = `
      <div class="modal" style="max-width:420px;text-align:center">
        <div style="font-size:36px;margin-bottom:12px">🔗</div>
        <div class="modal-title" style="margin-bottom:8px">Share this session</div>
        <div style="font-size:13px;color:var(--text2);margin-bottom:20px;line-height:1.6">
          Anyone with this link can view your session as read-only. Perfect for sharing with a professor or mentor.
        </div>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px 14px;font-size:11px;color:var(--accent);word-break:break-all;margin-bottom:16px;text-align:left">
          ${shareUrl}
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn-primary" onclick="copyShareLink('${shareUrl}',this)" style="flex:2">Copy link</button>
          <button class="btn-cancel"  onclick="this.closest('.modal-overlay').remove()" style="flex:1">Close</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  } catch (e) {
    console.error('Error sharing session:', e);
    alert('Error generating share link. Please try again.');
  }
};

window.copyShareLink = function(url, btn) {
  navigator.clipboard.writeText(url).then(function() {
    btn.textContent    = '✓ Copied!';
    btn.style.background = 'var(--supporting)';
    setTimeout(() => { btn.textContent = 'Copy link'; btn.style.background = ''; }, 2000);
  });
};