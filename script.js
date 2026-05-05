// ══════════════════════════════════════════
// script.js — Entry point
// Imports all modules and boots the app.
// This file should stay small.
// ══════════════════════════════════════════

// Core infrastructure
import './modules/firebase.js';
import './modules/state.js';

// Feature modules (order matters — ui before others)
import { initKeyboard } from './modules/ui.js';
import { initAuth }     from './modules/auth.js';

// Side-effect modules (register window.* globals)
import './modules/sessions.js';
import './modules/ai.js';
import './modules/score.js';

// Boot
initAuth();
initKeyboard(window.sendMessage);