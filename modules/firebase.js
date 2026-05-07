// ══════════════════════════════════════════
// firebase.js — Firebase initialisation
// Exports db and auth — import these everywhere
// you need Firestore or Auth, never re-init.
// ══════════════════════════════════════════

import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyARAqEPx23O2sxmmOfULKR-Lb38ZKP2Ufk",
  authDomain:        "lexarena-76fda.firebaseapp.com",
  projectId:         "lexarena-76fda",
  storageBucket:     "lexarena-76fda.firebasestorage.app",
  messagingSenderId: "788257269378",
  appId:             "1:788257269378:web:8b8f2e262203f4502df69b"
};

const app = initializeApp(firebaseConfig);

export const db   = getFirestore(app);
export const auth = getAuth(app);