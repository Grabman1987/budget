// Applies a stored manual theme before first paint (CSP forbids inline scripts, so this is a file).
// Wrapped in a function so no variable leaks into the global scope.
(function () {
  try {
    var theme = localStorage.getItem('budget-theme');
    if (theme === 'light' || theme === 'dark')
      document.documentElement.setAttribute('data-theme', theme);
  } catch {
    /* storage blocked: follow the system theme */
  }
})();
