document.addEventListener('DOMContentLoaded', function() {
    // Добавляем эту строку для кросс-браузерности
    const browserApi = typeof browser !== 'undefined' ? browser : chrome;

    const urlPreset = document.getElementById('urlPreset');
    const customUrlContainer = document.getElementById('customUrlContainer');
    const customUrl = document.getElementById('customUrl');
    const langButtons = Array.from(document.querySelectorAll('#langSeg .seg-btn'));
    const saveButton = document.getElementById('save');
    const resetButton = document.getElementById('reset');
    const status = document.getElementById('status');

    // Pre-simplification: language used to be baked into the mode itself.
    // Collapse those old stored values onto a base mode + 'ru', once.
    const LEGACY_RU_MODE = {
        'newWindowRuExt': 'newWindowExt',
        'sidePanelRuExt': 'sidePanelExt',
        'https://dict.dhamma.gift/ru/?silent&q=': 'https://dict.dhamma.gift/?silent&q=',
        'https://dict.dhamma.gift/ru/gd?search=': 'https://dict.dhamma.gift/?silent&q=',
        // Compact is gone (the site read "gd" as the word): Popup instead.
        'https://dict.dhamma.gift/gd?search=': 'https://dict.dhamma.gift/?silent&q='
    };

    let selectedLang = 'en';

    function setLang(lang) {
        selectedLang = lang === 'ru' ? 'ru' : 'en';
        langButtons.forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.lang === selectedLang)));
    }

    langButtons.forEach(btn => btn.addEventListener('click', () => setLang(btn.dataset.lang)));

    // Показываем/скрываем поле для кастомного URL
    urlPreset.addEventListener('change', function() {
        if (this.value === 'custom') {
            customUrlContainer.style.display = 'block';
            customUrl.focus();
        } else {
            customUrlContainer.style.display = 'none';
        }
    });

// Сохранение настроек
    saveButton.addEventListener('click', function() {
        let selectedValue;

        if (urlPreset.value === 'custom') {
            selectedValue = customUrl.value.trim();
            if (!selectedValue) {
                showStatus('Please enter a custom URL', 'error');
                return;
            }
            if (!/^https:\/\//i.test(selectedValue)) {
                showStatus('The custom URL must start with https://', 'error');
                return;
            }
        } else {
            selectedValue = urlPreset.value;
        }

        // Используем browserApi вместо chrome
        browserApi.storage.sync.set({ dictUrl: selectedValue, dictLang: selectedLang }, function() {
            if (browserApi.runtime.lastError) {
                showStatus(`Error: ${browserApi.runtime.lastError.message}`, 'error');
            } else {
                showStatus('Saved! Refresh the reading page if needed', 'success');
            }
        });
    });

    // Сброс настроек
    resetButton.addEventListener('click', function() {
        // Используем browserApi вместо chrome
        browserApi.storage.sync.remove(['dictUrl', 'dictLang', 'doubleCopyLookup'], function() {
            doubleCopy.checked = true;
            browserApi.storage.local.set({ 'popup_reset_flag': true });
            browserApi.runtime.sendMessage({ action: 'reset_extension_state' });

            urlPreset.selectedIndex = 0;
            customUrlContainer.style.display = 'none';
            customUrl.value = '';
            setLang('en');

            showStatus('Settings reset. Please reload any pages where the extension is active.', 'success');
        });
    });

    // Загрузка сохраненных настроек
    // Используем browserApi вместо chrome
    browserApi.storage.sync.get(['dictUrl', 'dictLang'], function(result) {
        let dictUrl = result.dictUrl;
        let lang = result.dictLang === 'ru' ? 'ru' : 'en';

        if (dictUrl && LEGACY_RU_MODE[dictUrl]) {
            if (!/\/gd\?search=$/.test(dictUrl) || dictUrl.includes('/ru/')) lang = 'ru';
            dictUrl = LEGACY_RU_MODE[dictUrl];
        }

        setLang(lang);

        if (dictUrl) {
            const options = Array.from(urlPreset.options);
            const foundOption = options.find(option => option.value === dictUrl);

            if (foundOption) {
                urlPreset.value = dictUrl;
            } else {
                urlPreset.value = 'custom';
                customUrlContainer.style.display = 'block';
                customUrl.value = dictUrl;
            }
        }
    });

    // Hotkeys: Ctrl+C+C (saved at once) and the browser's own shortcuts for our commands.
    const doubleCopy = document.getElementById('doubleCopy');
    Promise.resolve(browserApi.storage.sync.get(['doubleCopyLookup']))
        .then((r) => { doubleCopy.checked = !(r && r.doubleCopyLookup === false); })
        .catch(() => {});
    doubleCopy.addEventListener('change', () => {
        browserApi.storage.sync.set({ doubleCopyLookup: doubleCopy.checked });
    });

    function showShortcuts() {
        Promise.resolve(browserApi.commands.getAll()).then((commands) => {
            const key = (name) => ((commands || []).find((c) => c.name === name) || {}).shortcut || 'not set';
            document.getElementById('keyLookup').textContent = key('lookup_selection');
            document.getElementById('keyToggle').textContent = key('toggle_extension');
        }).catch(() => {});
    }
    showShortcuts();
    window.addEventListener('focus', showShortcuts);

    document.getElementById('editKeys').addEventListener('click', () => {
        browserApi.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });

    function showStatus(message, type) {
        status.textContent = message;
        status.className = type;
        status.style.display = 'block';

        setTimeout(function() {
            status.style.display = 'none';
        }, 3000);
    }
});
