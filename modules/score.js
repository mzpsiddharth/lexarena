// ══════════════════════════════════════════
// score.js — Score card, export PDF, share,
// leaderboard
// Imports: state, firebase, ui, ai
// ══════════════════════════════════════════

import { state }  from './state.js';
import { db }     from './firebase.js';
import {
  doc, getDoc, updateDoc, addDoc, collection,
  query, where, getDocs, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { generateScore } from './ai.js';
import { escapeHtml, showToast } from './ui.js';


// ── SCORE CARD ────────────────────────────
window.showScoreCard = async function() {
  const userMessages = state.messages.filter(m => m.role === 'user');
  if (userMessages.length < 2) {
    showToast('Practice more — at least 2 arguments needed for a score.');
    return;
  }

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
    await submitToLeaderboard(report.score);
    showSavedReport(report, userMessages.length, userMessages.length);
  }
};


// ── SHOW SAVED REPORT ─────────────────────
function showSavedReport(report, currentArgCount, scoredAtArgCount) {
  // Make the AI-generated report available to exportSession for consistent scoring
  window._exportSavedReport = report;
  const roleLabels  = { judge: 'Judge', opposing: 'Opposing Counsel', supporting: 'Supporting Counsel' };
  const sessionName = document.getElementById('session-title-display').textContent;
  const scoreColor  = report.score >= 8 ? '#4caf7d' : report.score >= 6 ? '#c9a96e' : '#e07a5f';
  const hasNewArgs  = currentArgCount > scoredAtArgCount;

  const overlay = document.createElement('div');
  overlay.className       = 'modal-overlay';
  overlay.style.zIndex    = '300';
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
    await submitToLeaderboard(report.score);
    showSavedReport(report, userMessages.length, userMessages.length);
  }
};


// ── LEADERBOARD ───────────────────────────
// One entry per session — updates in place if the new score is higher.
// Prevents spam and makes the leaderboard reflect best performance.
async function submitToLeaderboard(score) {
  if (!state.currentUser || score < 6 || !state.currentSessionId) return;

  try {
    const sessionName = document.getElementById('session-title-display').textContent;

    // Check if this session already has a leaderboard entry
    const existing = await getDocs(query(
      collection(db, 'leaderboard'),
      where('sessionId', '==', state.currentSessionId)
    ));

    if (!existing.empty) {
      // Entry exists — only update if score improved
      const existingDoc  = existing.docs[0];
      const existingScore = existingDoc.data().score;

      if (score > existingScore) {
        await updateDoc(doc(db, 'leaderboard', existingDoc.id), {
          score,
          userName:    state.currentUser.displayName || 'Anonymous',
          sessionName,
          role:        state.currentRole,
          updatedAt:   new Date()
        });
        showToast('🏆 Leaderboard score updated to ' + score + '/10!');
      }
      // If score is same or lower, do nothing silently
      return;
    }

    // No existing entry — create a new one
    await addDoc(collection(db, 'leaderboard'), {
      sessionId:   state.currentSessionId,
      userName:    state.currentUser.displayName || 'Anonymous',
      sessionName,
      score,
      role:        state.currentRole,
      createdAt:   new Date()
    });

  } catch (e) {
    console.error('Leaderboard error:', e);
  }
}


// ── EXPORT PDF ────────────────────────────
window.exportSession = function() {
  if (state.messages.length === 0) { showToast('No messages to export. Start a session first.'); return; }

  const { jsPDF }    = window.jspdf;
  const pdf          = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth    = 210;
  const margin       = 20;
  const maxWidth     = pageWidth - margin * 2;
  const lineHeight   = 5.5;
  let y              = 20;

  function safeSym(text) {
    return String(text)
      .replace(/✓/g, '[+]').replace(/✗/g, '[-]').replace(/→/g, '[>]')
      .replace(/⚖/g, '').replace(/📎/g, '').replace(/<br>/g, '\n');
  }

  function lineCount(text, width, fontSize) {
    pdf.setFontSize(fontSize);
    return pdf.splitTextToSize(safeSym(String(text)), width).length;
  }

  function addText(text, x, fontSize, color, bold) {
    pdf.setFontSize(fontSize);
    pdf.setTextColor(...color);
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    const lines = pdf.splitTextToSize(safeSym(String(text)), maxWidth - (x - margin));
    lines.forEach(function(line) {
      if (y > 272) { pdf.addPage(); y = 20; }
      pdf.text(line, x, y);
      y += lineHeight;
    });
  }

  function addLine(color) {
    if (y > 272) { pdf.addPage(); y = 20; }
    pdf.setDrawColor(...(color || [200,200,200]));
    pdf.line(margin, y, pageWidth - margin, y);
    y += 5;
  }

  function ensureSpace(needed) {
    if (y + needed > 272) { pdf.addPage(); y = 20; }
  }

  const roleLabels  = { judge: 'Judge', opposing: 'Opposing Counsel', supporting: 'Supporting Counsel' };
  const sessionName = document.getElementById('session-title-display').textContent;
  const date        = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  pdf.setFillColor(20, 20, 40);
  pdf.rect(0, 0, pageWidth, 42, 'F');
  pdf.setFontSize(22); pdf.setTextColor(201,169,110); pdf.setFont('helvetica','bold');
  pdf.text('NyayArena', margin, 16);
  pdf.setFontSize(9); pdf.setTextColor(180,180,200); pdf.setFont('helvetica','normal');
  pdf.text('AI Courtroom Simulator  |  Indian Law Practice', margin, 24);
  pdf.setFontSize(11); pdf.setTextColor(255,255,255); pdf.setFont('helvetica','bold');
  const displayName = sessionName.length > 55 ? sessionName.substring(0, 52) + '...' : sessionName;
  pdf.text(displayName, margin, 35);
  y = 52;

  pdf.setFillColor(240, 240, 248);
  pdf.roundedRect(margin, y-4, maxWidth, 26, 3, 3, 'F');
  pdf.setFontSize(9); pdf.setTextColor(80,80,110); pdf.setFont('helvetica','normal');
  pdf.text('AI Role:',   margin+4, y+3);  pdf.setFont('helvetica','bold'); pdf.text(roleLabels[state.currentRole] || state.currentRole, margin+22, y+3);
  pdf.setFont('helvetica','normal');
  pdf.text('Date:',      margin+4, y+10); pdf.setFont('helvetica','bold'); pdf.text(date, margin+22, y+10);
  pdf.setFont('helvetica','normal');
  pdf.text('Arguments:', margin+4, y+17); pdf.setFont('helvetica','bold'); pdf.text(String(state.messages.filter(m=>m.role==='user').length), margin+26, y+17);
  y += 32;
  addLine([180,180,200]);

  let argCount = 0;
  state.messages.forEach(function(msg) {
    if (msg.role === 'user') {
      argCount++;
      const textLines = lineCount(msg.text, maxWidth - 6, 10);
      const blockH    = lineHeight * textLines + 16;
      ensureSpace(blockH);

      pdf.setFillColor(228, 238, 255);
      pdf.roundedRect(margin, y-3, maxWidth, blockH, 2, 2, 'F');
      pdf.setFontSize(8); pdf.setTextColor(40,70,160); pdf.setFont('helvetica','bold');
      pdf.text('YOU  —  Argument ' + argCount, margin+4, y+4);
      y += 8;
      addText(msg.text, margin+4, 10, [20,20,50], false);
      y += 4;

    } else {
      const mainLines = lineCount(msg.text, maxWidth - 6, 10);
      let blockH      = lineHeight * mainLines + 14;
      let feedbackH   = 0;

      if (msg.feedback && (msg.feedback.good || msg.feedback.gap || msg.feedback.tip)) {
        const goodLines = msg.feedback.good ? lineCount('[+] ' + msg.feedback.good, maxWidth - 20, 9) : 0;
        const gapLines  = msg.feedback.gap  ? lineCount('[-] ' + msg.feedback.gap,  maxWidth - 20, 9) : 0;
        const tipLines  = msg.feedback.tip  ? lineCount('[>] ' + msg.feedback.tip,  maxWidth - 20, 9) : 0;
        feedbackH = (goodLines + gapLines + tipLines) * lineHeight + 14;
      }

      ensureSpace(blockH + feedbackH + 6);

      pdf.setFillColor(255, 248, 235);
      pdf.roundedRect(margin, y-3, maxWidth, blockH, 2, 2, 'F');
      pdf.setFontSize(8); pdf.setTextColor(160,90,20); pdf.setFont('helvetica','bold');
      pdf.text((roleLabels[state.currentRole] || 'AI').toUpperCase(), margin+4, y+4);
      y += 8;
      addText(msg.text, margin+4, 10, [40,35,25], false);
      y += 3;

      if (msg.feedback && (msg.feedback.good || msg.feedback.gap || msg.feedback.tip)) {
        ensureSpace(feedbackH);
        pdf.setFillColor(255, 252, 242);
        pdf.setDrawColor(201,169,110);
        pdf.roundedRect(margin+4, y-2, maxWidth-8, feedbackH, 2, 2, 'FD');
        pdf.setFontSize(7.5); pdf.setTextColor(150,110,30); pdf.setFont('helvetica','bold');
        pdf.text('ARGUMENT ANALYSIS', margin+8, y+5);
        y += 9;
        if (msg.feedback.good) addText('[+] ' + msg.feedback.good, margin+8, 9, [30,120,60],  false);
        if (msg.feedback.gap)  addText('[-] ' + msg.feedback.gap,  margin+8, 9, [170,40,40],  false);
        if (msg.feedback.tip)  addText('[>] ' + msg.feedback.tip,  margin+8, 9, [130,90,20],  false);
        y += 4;
      }

      addLine([215,215,228]);
    }
  });

  const scored = state.messages.filter(m => m.role==='ai' && m.feedback);
  if (scored.length > 0) {
    ensureSpace(50);
    y += 4;
    pdf.setFillColor(18,18,38);
    pdf.roundedRect(margin, y-4, maxWidth, 46, 3, 3, 'F');
    pdf.setFontSize(11); pdf.setTextColor(201,169,110); pdf.setFont('helvetica','bold');
    pdf.text('PERFORMANCE SUMMARY', margin+5, y+6);

    // Use the AI-generated report score if it exists, otherwise show argument ratio
    const savedScore  = window._exportSavedReport;
    let score, grade, scoreLabel;
    if (savedScore && typeof savedScore.score === 'number') {
      score      = savedScore.score;
      grade      = savedScore.grade || (score>=8?'A':score>=6?'B':score>=5?'C+':'C');
      scoreLabel = 'AI score';
    } else {
      const good  = scored.filter(m=>m.feedback&&m.feedback.good).length;
      const gap   = scored.filter(m=>m.feedback&&m.feedback.gap).length;
      const total = good + gap;
      score      = total > 0 ? Math.round((good/total)*10) : 5;
      grade      = score>=8?'A':score>=6?'B':score>=5?'C+':'C';
      scoreLabel = 'Ratio score';
    }

    pdf.setFontSize(28); pdf.setTextColor(255,255,255); pdf.setFont('helvetica','bold');
    pdf.text(score+'/10', margin+5, y+24);
    pdf.setFontSize(18); pdf.setTextColor(201,169,110);
    pdf.text(grade, margin+42, y+24);

    const good  = scored.filter(m=>m.feedback&&m.feedback.good).length;
    const gap   = scored.filter(m=>m.feedback&&m.feedback.gap).length;
    pdf.setFontSize(9); pdf.setFont('helvetica','normal');
    pdf.setTextColor(140,210,140); pdf.text('Strong: '+good,          margin+5,  y+34);
    pdf.setTextColor(210,120,120); pdf.text('Gaps: '+gap,             margin+35, y+34);
    pdf.setTextColor(160,160,180); pdf.text('Exchanges: '+scored.length, margin+62, y+34);
    pdf.setTextColor(120,120,150); pdf.text('('+scoreLabel+')',       margin+5,  y+40);
    y += 52;
  }

  y += 4;
  addLine([200,200,210]);
  pdf.setFontSize(8); pdf.setTextColor(150,150,170); pdf.setFont('helvetica','normal');
  pdf.text('Generated by NyayArena  |  nyayarena.vercel.app  |  ' + date, margin, y);
  pdf.save(sessionName.replace(/[^a-z0-9]/gi,'_').toLowerCase() + '_nyayarena.pdf');
};


// ── SHARE SESSION ─────────────────────────
window.shareSession = async function() {
  if (!state.currentSessionId) { showToast('No active session to share.'); return; }
  try {
    await updateDoc(doc(db, 'sessions', state.currentSessionId), { isPublic: true });
    const shareUrl  = window.location.origin + '/share.html?id=' + state.currentSessionId;
    const overlay   = document.createElement('div');
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
          <button class="btn-primary" id="copy-share-link-btn" style="flex:2">Copy link</button>
          <button class="btn-cancel"  id="close-share-btn" style="flex:1">Close</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('close-share-btn').addEventListener('click', () => overlay.remove());
    document.getElementById('copy-share-link-btn').addEventListener('click', function() {
      navigator.clipboard.writeText(shareUrl).then(() => {
        this.textContent      = '✓ Copied!';
        this.style.background = 'var(--supporting)';
        setTimeout(() => { this.textContent = 'Copy link'; this.style.background = ''; }, 2000);
      });
    });
  } catch (e) {
    console.error('Error sharing session:', e);
    showToast('Error generating share link. Please try again.');
  }
};

// copyShareLink removed — share modal now uses inline addEventListener closure