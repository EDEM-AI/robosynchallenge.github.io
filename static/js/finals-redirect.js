// Old bookmarks keep working; the main site's Submit Policy is canonical.
(() => {
  try {
    const saved = JSON.parse(sessionStorage.getItem('rsc-finals-session-v1') || 'null');
    if (saved?.session_id && saved.email && !sessionStorage.getItem('robosynchallenge-session-v1')) {
      sessionStorage.setItem('robosynchallenge-session-v1', JSON.stringify({version:1,
        session:{session_id:saved.session_id}, user:{email:saved.email, role:'participant'}}));
    }
    sessionStorage.removeItem('rsc-finals-session-v1');
  } catch { /* The normal sign-in flow handles an invalid saved session. */ }
  location.replace(new URL('../#/submit-policy', location.href).href);
})();
