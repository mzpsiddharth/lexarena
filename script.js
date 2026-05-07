// ══════════════════════════════════════════
// script.js — Entry point (22 lines)
// Boot order matters:
// 1. ui registers DOM listeners immediately
// 2. sessions/score register window.* globals
// 3. auth starts onAuthStateChanged last
// ══════════════════════════════════════════

import { initKeyboard } from './modules/ui.js';
import { initAuth }     from './modules/auth.js';

// Side-effect imports — register window.* globals
import './modules/sessions.js';
import './modules/score.js';

// Boot
initAuth();
initKeyboard(window.sendMessage);