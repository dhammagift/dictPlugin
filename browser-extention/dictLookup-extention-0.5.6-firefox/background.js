let isEnabled = false; // По умолчанию выключено

// Определяем API (Firefox использует browser, Chrome использует chrome)
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Загружаем сохраненное состояние расширения из хранилища
browserAPI.storage.local.get(['isEnabled']).then((result) => {
  isEnabled = result.isEnabled !== undefined ? result.isEnabled : false;
  updateIcon();
});

// Добавляем создание контекстных меню при установке/обновлении расширения
browserAPI.runtime.onInstalled.addListener(() => {
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
  });
  
  // Принудительно выключаем расширение при установке
  browserAPI.storage.local.set({ isEnabled: false });
  isEnabled = false;
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
  }
});

// Обработчик клика по значку расширения
browserAPI.action.onClicked.addListener((tab) => {
  isEnabled = !isEnabled;
  browserAPI.storage.local.set({ isEnabled });
  updateExtensionState(tab);
});

// Обработчик сообщений
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'reset_extension_state') {
        isEnabled = true;
        browserAPI.storage.local.remove('isEnabled');
        updateIcon();
    }
});

// Обработчик горячей клавиши
browserAPI.commands.onCommand.addListener((command) => {
  if (command === 'toggle_extension') {
    browserAPI.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs.length > 0) {
        isEnabled = !isEnabled;
        browserAPI.storage.local.set({ isEnabled });
        updateExtensionState(tabs[0]);
      }
    });
  }
});

// Функция обновления состояния расширения
function updateExtensionState(tab) {
  if (tab.id && tab.url && !tab.url.startsWith('about:') && !tab.url.startsWith('moz-extension://')) {
    updateIcon();

    browserAPI.tabs.sendMessage(tab.id, { 
        action: "show_extension_status", 
        enabled: isEnabled 
    }).catch(() => {});

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