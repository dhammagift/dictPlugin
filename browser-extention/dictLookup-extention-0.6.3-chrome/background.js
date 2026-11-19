let isEnabled = true;

// Определяем API браузера (Chrome или Edge)
const browserAPI = self.chrome || self.browser;

// Загружаем сохраненное состояние расширения из хранилища
browserAPI.storage.local.get(['isEnabled'], (result) => {
  isEnabled = result.isEnabled !== undefined ? result.isEnabled : false; // ИЗМЕНЕНО: true -> false
  updateIcon();
});

// Добавляем создание контекстных меню при установке/обновлении расширения
browserAPI.runtime.onInstalled.addListener((details) => {
  // Удаляем все существующие меню, чтобы избежать дублирования при обновлении
  browserAPI.contextMenus.removeAll(() => {
    browserAPI.contextMenus.create({
      id: "openDhammaGiftMain",
      title: "Dhamma.gift",
      contexts: ["action"] // 'action' для меню кнопки расширения
    });

    browserAPI.contextMenus.create({
      id: "openDict",
      title: "Dict.Dhamma.Gift",
      contexts: ["action"]
    });

    browserAPI.contextMenus.create({
      id: "openAkshara",
      title: "Aksharamukha.com",
      contexts: ["action"]
    });

    browserAPI.contextMenus.create({
      id: "openMitra",
      title: "DharmaMitra.org",
      contexts: ["action"]
    });

    // Пункт меню для выделенного текста
    browserAPI.contextMenus.create({
      id: "translateSelection",
      title: "Dhamma.gift",
      contexts: ["selection"]
    });

    // Word-aware grammar parse, same URL pattern as paliLookup.js on the site
    browserAPI.contextMenus.create({
      id: "explainGrammarSelection",
      title: "Explain grammar (DharmaMitra)",
      contexts: ["selection"]
    });
  });
  
  // Off on a fresh install only. onInstalled also fires on every extension update and browser update,
  // and switching off there silently turned the extension off for everyone after each release.
  if (details.reason === 'install') {
    browserAPI.storage.local.set({ isEnabled: false });
    isEnabled = false;
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
    browserAPI.tabs.create({ url: "https://dharmamitra.org/translate?target_lang=english-explained" });
  } else if (info.menuItemId === "translateSelection") {
    // Работает всегда, независимо от isEnabled
    const msg = { action: "translate_from_context_menu", text: info.selectionText };
    // Tabs opened before the extension was installed or updated have no content.js yet: load it, ask again.
    browserAPI.tabs.sendMessage(tab.id, msg).catch(() => {
      browserAPI.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] })
        .then(() => browserAPI.tabs.sendMessage(tab.id, msg))
        .catch((e) => console.warn('Dhamma.gift: could not reach the page', e));
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
    isEnabled = !(result.isEnabled !== undefined ? result.isEnabled : false);
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
        // Reset = the default: click-lookup off (it used to turn it on).
        isEnabled = false;
        browserAPI.storage.local.set({ isEnabled: false });
        updateIcon();
    } else if (request.action === 'update_side_panel' && sender.tab) {
        const tabId = sender.tab.id;
        const path = `sidepanel.html?src=${encodeURIComponent(request.url)}`;
        browserAPI.sidePanel.setOptions({ tabId, path, enabled: true });
        browserAPI.sidePanel.open({ tabId });
    }
    if (request.action === 'open_dictionary_window' && /^https:\/\//i.test(request.url || '')) {
        openDictionaryWindow(request);
    }
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
      const cmd = (commands || []).find((c) => c.name === 'toggle_extension');
      callback((cmd && cmd.shortcut) || '');
    });
  } catch (e) {
    callback('');
  }
}

// Функция обновления состояния расширения
function updateExtensionState(tab) {
  // Badge first, on every page: on chrome:// / about: pages the state flipped with no change of icon.
  updateIcon();
  if (tab.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://')) {

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
  const iconPath = isEnabled ? "icon.png" : "icon_disabled.png";
  browserAPI.action.setIcon({ path: iconPath });
  browserAPI.action.setBadgeText({ text: isEnabled ? "ON" : "OFF" });
  browserAPI.action.setBadgeBackgroundColor({ color: isEnabled ? "#4CAF50" : "#B71C1C" });
}

// Функция выполнения скрипта (универсальная для Chrome и Edge)
function executeScript(tabId, scriptDetails) {
  if (browserAPI.scripting && browserAPI.scripting.executeScript) {
    browserAPI.scripting.executeScript({
      target: { tabId },
      ...scriptDetails
    });
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