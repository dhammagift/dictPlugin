let isEnabled = true;

// Определяем API браузера (Chrome или Edge)
const browserAPI = self.chrome || self.browser;

// Загружаем сохраненное состояние расширения из хранилища
// Safari: on by default. The user already switches the extension on in Safari Settings and grants
// website access there, so a second "off until you press the toolbar button" step made lookups look
// broken (App Review 2.1(a)). content.js reads a missing key as on too.
browserAPI.storage.local.get(['isEnabled'], (result) => {
  isEnabled = result.isEnabled !== false;
  updateIcon();
});

// One failing item must not abort the rest: Safari may reject a context it doesn't support
// (e.g. 'action'), and the selection items below are the ones that matter.
function createMenu(props) {
  try {
    browserAPI.contextMenus.create(props, () => void browserAPI.runtime.lastError);
  } catch (e) {
    console.warn('contextMenus.create failed', props.id, e);
  }
}

// Добавляем создание контекстных меню при установке/обновлении расширения
browserAPI.runtime.onInstalled.addListener((details) => {
  // Удаляем все существующие меню, чтобы избежать дублирования при обновлении
  browserAPI.contextMenus.removeAll(() => {
    // Пункт меню для выделенного текста
    createMenu({
      id: "translateSelection",
      title: "Dhamma.gift",
      contexts: ["selection"]
    });

    // Word-aware grammar parse, same URL pattern as paliLookup.js on the site
    createMenu({
      id: "explainGrammarSelection",
      title: "Explain grammar (DharmaMitra)",
      contexts: ["selection"]
    });

    // 'action' для меню кнопки расширения
    createMenu({ id: "openDhammaGiftMain", title: "Dhamma.gift", contexts: ["action"] });
    createMenu({ id: "openDict", title: "Dict.Dhamma.Gift", contexts: ["action"] });
    createMenu({ id: "openAkshara", title: "Aksharamukha.com", contexts: ["action"] });
    createMenu({ id: "openMitra", title: "DharmaMitra.org", contexts: ["action"] });
  });

  // Explicit value on a fresh install only. onInstalled also fires on every extension update and
  // browser update, and resetting there overrode the user's own choice after each release.
  if (details.reason === 'install') {
    browserAPI.storage.local.set({ isEnabled: true });
    isEnabled = true;
  }
  updateIcon();
});

// Обработчик клика по пунктам контекстного меню
browserAPI.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "openDhammaGiftMain") {
    browserAPI.tabs.create({ url: "https://dhamma.gift/" });
  } else if (info.menuItemId === "openDict") {
    browserAPI.tabs.create({ url: "https://dict.dhamma.gift/" });
  } else if (info.menuItemId === "openAkshara") {
    browserAPI.tabs.create({ url: "https://www.aksharamukha.com/converter" });
  } else if (info.menuItemId === "openMitra") {
    browserAPI.tabs.create({ url: "https://dharmamitra.org/?target_lang=english-explained" });
  } else if (info.menuItemId === "translateSelection") {
    // Работает всегда, независимо от isEnabled
    browserAPI.tabs.sendMessage(tab.id, {
        action: "translate_from_context_menu",
        text: info.selectionText
    }).catch(() => {
        // Ошибка может возникнуть, если контентный скрипт еще не загружен на странице
    });
  } else if (info.menuItemId === "explainGrammarSelection") {
    const url = `https://dharmamitra.org/translate?translate_mode=explain-grammar&input_sentence=${encodeURIComponent(info.selectionText || '')}`;
    browserAPI.tabs.create({ url });
  }
});

// The service worker is restarted after ~30 s idle and `isEnabled` starts as the default again, while
// the stored value is read asynchronously. Toggling from memory right after a wake-up (hotkey, icon)
// flipped the default instead of the real state, so the first press often seemed to do nothing.
// Always toggle from storage.
function toggleEnabled(tab) {
  browserAPI.storage.local.get(['isEnabled'], (result) => {
    isEnabled = !(result.isEnabled !== false);
    browserAPI.storage.local.set({ isEnabled });
    updateExtensionState(tab);
  });
}

// Обработчик клика по значку расширения
browserAPI.action.onClicked.addListener((tab) => {
  toggleEnabled(tab);
});

// Обработчик сообщений (для сброса настроек)
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'reset_extension_state') {
        // Explicit value: background reads a missing key as off, content.js as on.
        isEnabled = true;
        browserAPI.storage.local.set({ isEnabled: true });
        updateIcon();
    }
    // window.open from a context-menu message has no user gesture, so Safari's popup blocker
    // dropped it and "Dhamma.gift" in the selection menu did nothing. Open the window from here.
    if (request.action === 'open_dictionary_window' && /^https?:\/\//i.test(request.url || '')) {
      openDictionaryWindow(request);
    }
    // No chrome.sidePanel equivalent in Safari — 'update_side_panel' is never sent
    // because content.js here has no sidePanelExt/sidePanelRuExt option to trigger it.
});

function openDictionaryWindow({ url, width, height, left, top }) {
  const fallback = () => browserAPI.tabs.create({ url });
  try {
    const p = browserAPI.windows.create({ url, type: 'popup', width, height, left, top });
    if (p && p.catch) p.catch(fallback);
  } catch (e) {
    fallback();
  }
}

// Обработчик горячей клавиши
browserAPI.commands.onCommand.addListener((command) => {
  if (command === 'toggle_extension') {
    browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        toggleEnabled(tabs[0]);
      }
    });
  }
});

// Shortcut currently bound to toggle_extension, e.g. "Ctrl+Shift+L"; "" if unassigned or unsupported.
function getToggleShortcut(callback) {
  try {
    browserAPI.commands.getAll((commands) => {
      // Safari's manifest binds the hotkey to _execute_action (the action click toggles).
      const cmd = (commands || []).find((c) => c.name === 'toggle_extension' || c.name === '_execute_action');
      callback((cmd && cmd.shortcut) || '');
    });
  } catch (e) {
    callback('');
  }
}

// Функция обновления состояния расширения
function updateExtensionState(tab) {
  // Badge first and unconditionally: Safari often leaves tab.url empty (no "tabs" permission,
  // start page), and requiring it left the badge stale, so the toolbar button seemed dead.
  updateIcon();
  if (tab && tab.id) {

    // Send notification to the content script to show the bubble
    // The toast names the hotkey the browser actually assigned (none if the default was taken).
    getToggleShortcut((shortcut) => browserAPI.tabs.sendMessage(tab.id, {
        action: "show_extension_status",
        enabled: isEnabled,
        shortcut
    }).catch(() => {
        // Fail silently if content script is not yet injected
    }));

    if (isEnabled) {
      // Запускаем content.js
      executeScript(tab.id, { files: ['content.js'] });
    } else {
      // Выключаем попап на странице
      executeScript(tab.id, { func: disablePopup });
    }
  }
}

// Функция обновления иконки расширения
function updateIcon() {
  const path = isEnabled
    ? { 16: "icon-16x16.png", 32: "icon-32x32.png" }
    : { 16: "icon_disabled.png", 32: "icon_disabled.png" };
  const action = browserAPI.action;
  // Each call guarded: an API Safari lacks must not abort the toggle that called us.
  const safe = (fn) => { try { const p = fn(); if (p && p.catch) p.catch(() => {}); } catch (e) {} };
  safe(() => action.setIcon({ path }));
  safe(() => action.setBadgeText({ text: isEnabled ? "ON" : "OFF" }));
  if (action.setBadgeBackgroundColor) {
    safe(() => action.setBadgeBackgroundColor({ color: isEnabled ? "#4CAF50" : "#B71C1C" }));
  }
}

// Функция выполнения скрипта (универсальная для Chrome и Edge)
function executeScript(tabId, scriptDetails) {
  if (browserAPI.scripting && browserAPI.scripting.executeScript) {
    // Rejects on pages the extension can't access (start page, other extensions); nothing to do there.
    browserAPI.scripting.executeScript({
      target: { tabId },
      ...scriptDetails
    }).catch(() => {});
  } else {
    if (scriptDetails.files) {
      browserAPI.tabs.executeScript(tabId, { file: scriptDetails.files[0] });
    } else if (scriptDetails.func) {
      browserAPI.tabs.executeScript(tabId, { code: `(${scriptDetails.func.toString()})()` });
    }
  }
}

// Функция отключения попапа (выполняется в контексте страницы)
function disablePopup() {
  const popup = document.querySelector('.popupExt');
  const overlay = document.querySelector('.overlayExt');
  if (popup && overlay) {
    popup.style.display = 'none';
    overlay.style.display = 'none';
  }
}