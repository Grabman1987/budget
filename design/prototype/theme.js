/* Applies the saved light/dark choice before first paint (external file so a strict CSP can apply). */
try { var t = localStorage.getItem('fa-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* storage unavailable */ }
