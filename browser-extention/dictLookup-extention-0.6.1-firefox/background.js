let isEnabled = false; // По умолчанию выключено

// Определяем API (Firefox использует browser, Chrome использует chrome)
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Загружаем сохраненное состояние расширения из хранилища
browserAPI.storage.local.get(['isEnabled']).then((result) => {
  isEnabled = result.isEnabled !== undefined ? result.isEnabled : false;
  updateIcon();
});

// Добавляем создание контекстных меню при установке/обновлении расширения
browserAPI.runtime.onInstalled.addListener((details) => {
  browserAPI.contextMenus.removeAll(() => {
    // Firefox поддерживает 'action' в MV3 (или 'browser_action' в MV2)
    const actionContext = browserAPI.contextMenus.ContextType ? "action" : "browser_action";
    
    browserAPI.contextMenus.create({
      id: "openDhammaGiftMain",
      title: "Dhamma.gift",
      contexts: ["action"]
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
    browserAPI.tabs.create({ url: "https://dharmamitra.org/?target_lang=english-explained" });
  } else if (info.menuItemId === "translateSelection") {
    // Гарантируем, что контентный скрипт загружен перед отправкой сообщения,
    // так как расширение по умолчанию выключено
    executeScript(tab.id, { files: ['content.js'] }).then(() => {
        return browserAPI.tabs.sendMessage(tab.id, {
            action: "translate_from_context_menu",
            text: info.selectionText
        });
    }).catch(err => console.error("Message send failed:", err));
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

// Обработчик сообщений
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'reset_extension_state') {
        // Explicit value: background reads a missing key as off, content.js as on.
        isEnabled = true;
        browserAPI.storage.local.set({ isEnabled: true });
        updateIcon();
    } else if (request.action === 'update_side_panel' && sender.tab) {
        const panel = `sidepanel.html?src=${encodeURIComponent(request.url)}`;
        browserAPI.sidebarAction.setPanel({ tabId: sender.tab.id, panel }).then(() => {
            // Firefox only allows programmatic open() from a direct user-action handler;
            // this best-effort call may silently fail outside that context, but setPanel
            // above still updates the content for when the user opens the sidebar manually
            // or via the "_execute_sidebar_action" shortcut in manifest.json.
            return browserAPI.sidebarAction.open();
        }).catch(() => {});
    }
});

// Обработчик горячей клавиши
browserAPI.commands.onCommand.addListener((command) => {
  if (command === 'toggle_extension') {
    browserAPI.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
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
  if (tab.id && tab.url && !tab.url.startsWith('about:') && !tab.url.startsWith('moz-extension://')) {
    updateIcon();

    // The toast names the hotkey the browser actually assigned (none if the default was taken).
    getToggleShortcut((shortcut) => browserAPI.tabs.sendMessage(tab.id, {
        action: "show_extension_status",
        enabled: isEnabled,
        shortcut
    }).catch(() => {}));

    if (isEnabled) {
      executeScript(tab.id, { files: ['content.js'] });
    } else {
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

// Универсальная функция выполнения скрипта (с поддержкой Promise для Firefox)
function executeScript(tabId, scriptDetails) {
  if (browserAPI.scripting && browserAPI.scripting.executeScript) {
    return browserAPI.scripting.executeScript({
      target: { tabId },
      ...scriptDetails
    });
  } else {
    // Фолбэк для старых версий
    if (scriptDetails.files) {
      return browserAPI.tabs.executeScript(tabId, { file: scriptDetails.files[0] });
    } else if (scriptDetails.func) {
      return browserAPI.tabs.executeScript(tabId, { code: `(${scriptDetails.func.toString()})()` });
    }
  }
  return Promise.resolve();
}

// Функция отключения попапа
function disablePopup() {
  const popup = document.querySelector('.popupExt');
  const overlay = document.querySelector('.overlayExt');
  if (popup && overlay) {
    popup.style.display = 'none';
    overlay.style.display = 'none';
  }
}