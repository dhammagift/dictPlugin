document.getElementById('f').src =
  new URLSearchParams(location.search).get('src') || 'https://dict.dhamma.gift/?silent';

// The dictionary announces its own en/ru switch; the panel is an extension page, not content.js, so keep it here.
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://dict.dhamma.gift' || !event.data || event.data.action !== 'dg_language_changed') return;
  const api = typeof browser !== 'undefined' ? browser : chrome;
  api.storage.sync.set({ dictLang: event.data.lang === 'ru' ? 'ru' : 'en' });
});
