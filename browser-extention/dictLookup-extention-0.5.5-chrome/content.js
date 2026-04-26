// content.js
if (typeof window.dhammaGiftExtInjected === 'undefined') {
    window.dhammaGiftExtInjected = true;


// content.js
(function() {
    'use strict';
    const extStyles = `
        ::-webkit-scrollbar {
            width: 6px !important;
            height: 6px !important;
            background: transparent !important;
        }
        ::-webkit-scrollbar-track {
            background: transparent !important;
        }
        ::-webkit-scrollbar-thumb {
            background: rgba(150, 150, 150, 0.4) !important;
            border-radius: 3px !important;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: rgba(150, 150, 150, 0.7) !important;
        }

        .popupExt.dragging {
            opacity: 0.9;
            cursor: move;
        }
        
        .popupExt.resizing {
            opacity: 0.9;
        }
        
        .popupExt.dragging iframe,
        .popupExt.resizing iframe {
            pointer-events: none;
        }

        .bubble-ext-notification {
            position: fixed;
            bottom: 8%;
            left: 50%;
            box-shadow: 0 0 5px black;
            background: #136857;
            color: white;
            padding: 12px 20px;
            border-radius: 24px;
            font-size: 14px;
            opacity: 0;
            transform: translate(-50%, 20px);
            transition: all 0.3s ease;
            z-index: 2147483647;
            pointer-events: none;
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .bubble-ext-notification.show {
            opacity: 1;
            transform: translate(-50%, 0);
        }

        /* --- SLEEK POPUP STYLES --- */
        .popupExt {
            background: #E1EBED !important;
            border: 1px solid #666 !important;
            border-radius: 8px !important;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4) !important;
            overflow: hidden !important;
            color-scheme: light !important;
        }
        [data-theme="dark"] .popupExt, html.dark .popupExt, .popupExt.dark-theme {
            background: #07021D !important;
            border-color: #444 !important;
            color-scheme: dark !important;
        }

        .dg-ext-header {
            cursor: move !important;
            height: 12px !important;
            width: 100% !important;
            background: transparent !important;
            display: flex !important;
            align-items: center !important;
            padding: 0 10px !important;
        }

        .dg-ext-iframe {
            width: 100% !important;
            height: calc(100% - 12px) !important;
            border: none !important;
            display: block !important;
            background: transparent !important;
            color-scheme: light dark !important;
        }

        .dg-ext-btn {
            position: absolute !important;
            top: 12px !important;
            border: none !important;
            cursor: pointer !important;
            width: 30px !important;
            height: 30px !important;
            border-radius: 50% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 0 !important;
            transition: background 0.2s !important;
            z-index: 100001 !important;
            text-decoration: none !important;
        }
        
        .dg-ext-close-btn { 
            right: 10px !important; 
            background: rgba(206, 5, 32, 0.6) !important; 
            color: white !important; 
        }
        .dg-ext-close-btn:hover { 
            background: rgba(206, 5, 32, 0.9) !important; 
        }
        
        .dg-ext-open-btn { 
            right: 80px !important; 
            background: rgba(45, 62, 80, 0.6) !important; 
            color: white !important; 
        }
        .dg-ext-open-btn:hover { 
            background: rgba(45, 62, 80, 0.9) !important; 
        }

        .dg-ext-dict-btn { 
            right: 45px !important; 
            background: rgba(45, 62, 80, 0.6) !important; 
        }
        .dg-ext-dict-btn:hover { 
            background: rgba(45, 62, 80, 0.9) !important; 
        }

        .dg-ext-resize-corner {
            position: absolute !important; 
            right: 0 !important; 
            bottom: 0 !important; 
            width: 20px !important; 
            height: 20px !important; 
            cursor: nwse-resize !important; 
            z-index: 100002 !important;
        }
        .dg-ext-resize-corner::after {
            content: "" !important; 
            position: absolute !important; 
            right: 3px !important; 
            bottom: 3px !important; 
            width: 0 !important; 
            height: 0 !important; 
            border-style: solid !important; 
            border-width: 0 0 12px 12px !important; 
            border-color: transparent transparent #666 transparent !important;
        }
    `;
    const styleSheet = document.createElement("style");
    styleSheet.type = "text/css";
    styleSheet.innerText = extStyles;
    document.head.appendChild(styleSheet);
})();

if (window.self === window.top) {
(async function() {
    'use strict';

    // 1. Cross-browser API helper
    const browserApi = typeof browser !== 'undefined' ? browser : chrome;

    // URLs, parameters, and storage keys
    const dhammaGiftURL = 'https://dhamma.gift/?q=';
    const dgParams = '&p=-kn';
    const storageKey = 'dictPopupSize';
    const dictUrlKey = 'dictUrl';
    
    // Default URLs and modes
    const DEFAULT_POPUP_URL = 'https://dict.dhamma.gift/?silent&q='; 
    const NEW_WINDOW_URL_EN = 'https://dict.dhamma.gift/?silent&q=';
    const NEW_WINDOW_URL_RU = 'https://dict.dhamma.gift/ru/?silent&q=';
    let currentModeOrUrl = 'newWindowExt';
    let contextMenuOnlyExt = false;

    // Reset popup settings logic
    try {
        const result = await browserApi.storage.local.get(['popup_reset_flag']);
        if (result && result.popup_reset_flag) {
            localStorage.removeItem('popupExtWidth');
            localStorage.removeItem('popupExtHeight');
            localStorage.removeItem('popupExtTop');
            localStorage.removeItem('popupExtLeft');
            localStorage.removeItem(storageKey);
            await browserApi.storage.local.remove('popup_reset_flag');
            console.log("Popup position and size settings have been reset.");
        }
    } catch (error) {
        console.error("Error checking for popup reset flag:", error);
    }

    // Load saved mode, URL and context menu preference from storage
    try {
        const result = await browserApi.storage.sync.get([dictUrlKey, 'contextMenuOnly']);
        if (result) {
            if (result[dictUrlKey]) currentModeOrUrl = result[dictUrlKey];
            if (result.contextMenuOnly !== undefined) contextMenuOnlyExt = result.contextMenuOnly;
        }
    } catch (error) {
        console.error("Error loading settings from storage:", error);
    }

    // Listen for changes
    browserApi.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync') {
            if (changes[dictUrlKey]) currentModeOrUrl = changes[dictUrlKey].newValue;
            if (changes.contextMenuOnly) contextMenuOnlyExt = changes.contextMenuOnly.newValue;
        }
    });

    let isEnabled = false;
	
function getEffectiveThemeExt() {
    const html = document.documentElement;
    const body = document.body || document.getElementsByTagName('body')[0];

    if (!body) {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    // 1. Проверка по явным атрибутам и классам
    const isDarkAttribute = html.getAttribute('data-theme') === 'dark' ||
                            html.getAttribute('theme') === 'dark' ||
                            body.getAttribute('data-theme') === 'dark';

    const isDarkClass = html.classList.contains('dark') ||
                        html.classList.contains('dark-mode') ||
                        html.classList.contains('theme-dark') ||
                        body.classList.contains('dark') ||
                        body.classList.contains('dark-mode') ||
                        body.classList.contains('theme-dark');

    if (isDarkAttribute || isDarkClass) return 'dark';

    const isLightAttribute = html.getAttribute('data-theme') === 'light' ||
                             html.getAttribute('theme') === 'light' ||
                             body.getAttribute('data-theme') === 'light';

    const isLightClass = html.classList.contains('light') ||
                         html.classList.contains('theme-light') ||
                         body.classList.contains('light');

    if (isLightAttribute || isLightClass) return 'light';

    // 2. Определение по вычисленному цвету фона
    function getBrightness(element) {
        if (!element) return null;
        
        const style = window.getComputedStyle(element);
        const bgColor = style.backgroundColor;
        
        // Пропускаем прозрачный фон, чтобы проверить родителя
        if (bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
            return null;
        }

        const rgb = bgColor.match(/\d+/g);
        if (!rgb || rgb.length < 3) return null;

        const r = parseInt(rgb[0], 10);
        const g = parseInt(rgb[1], 10);
        const b = parseInt(rgb[2], 10);

        // Формула воспринимаемой яркости
        return (r * 299 + g * 587 + b * 114) / 1000;
    }

    let brightness = getBrightness(body);
    
    if (brightness === null) {
        brightness = getBrightness(html);
    }

    if (brightness !== null) {
        return brightness < 127 ? 'dark' : 'light';
    }

    // 3. Фолбэк на системные настройки ОС/браузера
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }

    return 'light';
}

    // --- NEW WINDOW MODE LOGIC ---
    let dictionaryWindow = null;
    function openDictionaryWindowExt(url) {
        
        const newWindowWidth = 500, newWindowHeight = 500;
        const screenWidth = window.screen.availWidth, screenHeight = window.screen.availHeight;
        const newWindowLeft = screenWidth - newWindowWidth - 30;
        const newWindowTop = screenHeight - newWindowHeight - 50;
        const popupFeatures = `width=${newWindowWidth},height=${newWindowHeight},left=${newWindowLeft},top=${newWindowTop},scrollbars=yes,resizable=yes`;
        dictionaryWindow = window.open(url, 'dictionaryPopup', popupFeatures);
        if (dictionaryWindow) dictionaryWindow.focus();
    }

    // --- POPUP MODE LOGIC ---
    function createPopupExt() {
        const overlayExt = document.createElement('div');
        overlayExt.className = 'overlayExt';
        Object.assign(overlayExt.style, { position: 'fixed', top: '0', left: '0', width: '100%', height: '100%', background: 'rgba(0, 0, 0, 0.5)', zIndex: '99999', display: 'none' });

        const popupExt = document.createElement('div');
        popupExt.className = 'popupExt';
        Object.assign(popupExt.style, { position: 'fixed', width: '80%', maxWidth: '600px', maxHeight: '600px', height: '80%', zIndex: '100000', display: 'none' });

        const closeBtnExt = document.createElement('button');
        closeBtnExt.className = 'dg-ext-btn dg-ext-close-btn';
        closeBtnExt.title = 'Close (Esc)';
        closeBtnExt.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" width="17" height="17" fill="currentColor"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>`;

        const openBtnExt = document.createElement('a');
        openBtnExt.className = 'dg-ext-btn dg-ext-open-btn';
        openBtnExt.target = '_blank';
        openBtnExt.title = 'Search with Dhamma.Gift';
        openBtnExt.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="16" height="16" fill="white" style="transform: scaleX(-1);"><path d="M505 442.7l-99.7-99.7c28.4-35.3 45.7-79.8 45.7-128C451 98.8 352.2 0 224 0S-3 98.8-3 224s98.8 224 224 224c48.2 0 92.7-17.3 128-45.7l99.7 99.7c6.2 6.2 14.4 9.4 22.6 9.4s16.4-3.1 22.6-9.4c12.5-12.5 12.5-32.8 0-45.3zM224 384c-88.4 0-160-71.6-160-160S135.6 64 224 64s160 71.6 160 160-71.6 160-160 160z"/></svg>`;

        const dictBtnExt = document.createElement('a');
        dictBtnExt.className = 'dg-ext-btn dg-ext-dict-btn';
        dictBtnExt.target = '_blank';
        dictBtnExt.title = 'Open in DPD full mode';
        const dictIconExt = document.createElement('img');
        dictIconExt.src = browserApi.runtime.getURL('dpd-logo-dark.svg');
        Object.assign(dictIconExt.style, { width: '16px', height: '16px' });
        dictBtnExt.appendChild(dictIconExt);

        const iframeExt = document.createElement('iframe');
        iframeExt.className = 'dg-ext-iframe';
        
        const resizeHandleExt = document.createElement('div');
        resizeHandleExt.className = 'dg-ext-resize-corner';
        
        const headerExt = document.createElement('div');
        headerExt.className = 'dg-ext-header';

        popupExt.append(headerExt, dictBtnExt, openBtnExt, closeBtnExt, iframeExt, resizeHandleExt);
        document.body.append(overlayExt, popupExt);

        function savePopupStateExt() {
            const rect = popupExt.getBoundingClientRect();
            localStorage.setItem('popupExtTop', `${rect.top}px`);
            localStorage.setItem('popupExtLeft', `${rect.left}px`);
            localStorage.setItem('popupExtWidth', popupExt.style.width);
            localStorage.setItem('popupExtHeight', popupExt.style.height);
        }

        popupExt.style.top = localStorage.getItem('popupExtTop') || `${window.innerHeight / 2 - 300}px`;
        popupExt.style.left = localStorage.getItem('popupExtLeft') || `${window.innerWidth / 2 - 375}px`;
        popupExt.style.width = localStorage.getItem('popupExtWidth') || '749px';
        popupExt.style.height = localStorage.getItem('popupExtHeight') || '600px';

        let isDraggingExt = false, startX, startY, initialLeft, initialTop;
        headerExt.addEventListener('mousedown', e => {
            isDraggingExt = true;
            iframeExt.style.pointerEvents = 'none';
            popupExt.classList.add('dragging');
            startX = e.clientX; startY = e.clientY;
            initialLeft = parseInt(popupExt.style.left, 10);
            initialTop = parseInt(popupExt.style.top, 10);
        });

        let isResizingExt = false, startWidth, startHeight, startResizeExtX, startResizeExtY;
        resizeHandleExt.addEventListener('mousedown', e => {
            isResizingExt = true;
            iframeExt.style.pointerEvents = 'none';
            popupExt.classList.add('resizing');
            startWidth = parseInt(document.defaultView.getComputedStyle(popupExt).width, 10);
            startHeight = parseInt(document.defaultView.getComputedStyle(popupExt).height, 10);
            startResizeExtX = e.clientX;
            startResizeExtY = e.clientY;
            e.preventDefault();
        });

        document.addEventListener('mousemove', e => {
            if (isDraggingExt) {
                popupExt.style.left = `${initialLeft + e.clientX - startX}px`;
                popupExt.style.top = `${initialTop + e.clientY - startY}px`;
            }
            if (isResizingExt) {
                const newWidth = startWidth + (e.clientX - startResizeExtX);
                const newHeight = startHeight + (e.clientY - startResizeExtY);
                popupExt.style.width = Math.max(200, newWidth) + 'px';
                popupExt.style.height = Math.max(150, newHeight) + 'px';
            }
        });

        document.addEventListener('mouseup', () => {
            if (isDraggingExt) {
                isDraggingExt = false;
                iframeExt.style.pointerEvents = 'auto';
                popupExt.classList.remove('dragging');
                savePopupStateExt();
            }
            if (isResizingExt) {
                isResizingExt = false;
                iframeExt.style.pointerEvents = 'auto';
                popupExt.classList.remove('resizing');
                savePopupStateExt();
            }
        });

        const closePopupExt = (event) => {
            event.stopPropagation();
            savePopupStateExt();
            popupExt.style.display = 'none';
            overlayExt.style.display = 'none';
            iframeExt.src = '';
        };
        closeBtnExt.addEventListener('click', closePopupExt);
        overlayExt.addEventListener('click', closePopupExt);
		
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && popupExt.style.display === 'block') {
                closePopupExt(event);
            }
        });

        return { overlayExt, popupExt, iframeExt, openBtnExt, dictBtnExt };
    }
    const { overlayExt, popupExt, iframeExt, openBtnExt, dictBtnExt } = createPopupExt();

    // --- CORE LOGIC ---
    const getSelectedText = () => window.getSelection().toString().trim();
    const processWordExt = (word) => word.replace(/^[\s'‘—.–…"“”]+/, '').replace(/[\s'‘,—.—–"“…:;”]+$/, '').replace(/[‘'’‘"“””]+/g, "'").trim().toLowerCase();
    
function calculateOffsetWithHTMLExt(element, targetNode, targetOffset) {
    let offset = 0;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);

    let node;
    while ((node = walker.nextNode())) {
        if (node === targetNode) {
            return offset + targetOffset;
        }
        offset += node.textContent.length;
    }

    return -1; 
}

function getWordUnderCursorExt(event) {
    const x = event.clientX;
    const y = event.clientY;
    let range;

    if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(x, y);
    } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(x, y);
        if (!pos || !pos.offsetNode) {
            return null;
        }
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
    } else {
        return null;
    }

    if (!range || !range.startContainer) {
        return null;
    }

    if (range.startContainer.nodeType !== Node.TEXT_NODE) {
        return null;
    }

    const nodeRange = document.createRange();
    nodeRange.selectNode(range.startContainer);
    const nodeRect = nodeRange.getBoundingClientRect();

    if (x < nodeRect.left || x > nodeRect.right || y < nodeRect.top || y > nodeRect.bottom) {
        return null;
    }

    const parentElement = range.startContainer.parentElement.closest('span, p, div, td, li, a, h1, h2, h3, h4, h5, h6') || range.startContainer.parentElement;
    if (!parentElement) {
        return null;
    }

    const fullText = parentElement.textContent;
    const globalOffset = calculateOffsetWithHTMLExt(parentElement, range.startContainer, range.startOffset);
    
    if (globalOffset === -1) {
        return null;
    }

    const regex = /[^\s.,;"'!?()“"”–—]+/g;
    let match;
    while ((match = regex.exec(fullText)) !== null) {
        if (match.index <= globalOffset && regex.lastIndex >= globalOffset) {
            const word = match[0];
            if (word && word.trim().length > 0) {
                return word;
            }
        }
    }

    return null;
}

    function triggerCustomProtocol(url) {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        iframe.contentWindow.location.href = url;
        setTimeout(() => {
            document.body.removeChild(iframe);
        }, 500);
    }

async function showTranslation(word) {
        const processedWord = processWordExt(word);
        const encodedWord = encodeURIComponent(processedWord);
        const theme = getEffectiveThemeExt();
        let url;

        // Применяем класс темы к самому попапу, чтобы закрасить шапку
        if (theme === 'dark') {
            popupExt.classList.add('dark-theme');
        } else {
            popupExt.classList.remove('dark-theme');
        }

        switch (currentModeOrUrl) {
            case 'newWindowExt':
                url = `https://dict.dhamma.gift/?silent&theme=${theme}&q=${encodedWord}`;
                openDictionaryWindowExt(url);
                break;
            case 'newWindowRuExt':
                url = `https://dict.dhamma.gift/ru/?silent&theme=${theme}&q=${encodedWord}`;
                openDictionaryWindowExt(url);
                break;
            case 'dharmamitra':
                url = `https://dharmamitra.org/translate?input_sentence=${encodedWord}`;
                openDictionaryWindowExt(url);
                break;
            case 'goldendict://':
            case 'dttp://app.dicttango/WordLookup?word=':
            case 'mdict://mdict.cn/search?text=':
                url = `${currentModeOrUrl}${encodedWord}`;
                triggerCustomProtocol(url);
                break;
            default:
                const isRussianDict = currentModeOrUrl.includes('/ru/');
                
                if (currentModeOrUrl.includes('dict.dhamma.gift')) {
                    url = `https://dict.dhamma.gift${isRussianDict ? '/ru' : ''}/?silent&theme=${theme}&q=${encodedWord}`;
                } else {
                    url = `${currentModeOrUrl}${encodedWord}`;
                }
                
                iframeExt.src = url;
                popupExt.style.display = 'block';
                overlayExt.style.display = 'block';
                
                const searchBaseUrl = isRussianDict ? 'https://f.dhamma.gift/?q=' : 'https://dhamma.gift/?q=';
                openBtnExt.href = `${searchBaseUrl}${encodedWord}${dgParams}`;
                
                dictBtnExt.href = currentModeOrUrl.includes('dict.dhamma.gift')
                    ? `https://dict.dhamma.gift${isRussianDict ? '/ru' : ''}/?silent&theme=${theme}&q=${encodedWord}`
                    : `${currentModeOrUrl.startsWith('http') ? currentModeOrUrl : DEFAULT_POPUP_URL}${encodedWord}`;
                break;
        }
    }
	
    function showStatusBubble(text) {
        let bubble = document.getElementById('bubble-ext-status');
        if (!bubble) {
            bubble = document.createElement('div');
            bubble.id = 'bubble-ext-status';
            bubble.className = 'bubble-ext-notification';
            document.body.appendChild(bubble);
        }
        bubble.textContent = text;
        bubble.classList.remove('show');
        void bubble.offsetWidth;
        bubble.classList.add('show');
        
        setTimeout(() => {
            bubble.classList.remove('show');
        }, 2000);
    }

// Listen for messages from background.js
    browserApi.runtime.onMessage.addListener((request) => {
        if (request.action === "show_extension_status") {
            const isRu = currentModeOrUrl.includes('/ru/') || localStorage.getItem('siteLanguage') === 'ru';
            
            let statusText;
            if (isRu) {
                statusText = request.enabled 
                    ? "Dhamma.Gift расширение: Вкл" 
                    : "Dhamma.Gift расширение: Выкл";
            } else {
                statusText = request.enabled 
                    ? "Dhamma.Gift extension: On" 
                    : "Dhamma.Gift extension: Off";
            }
            
            showStatusBubble(statusText);
        } else if (request.action === "translate_from_context_menu") {
            if (request.text) {
                showTranslation(request.text);
            }
        }
    }); 
    
    const handleClickExt = (event) => {
        if (!isEnabled || event.target.closest('a, button, input, textarea, select, .popupExt, video, .html5-video-player')) return;
        
        const selectedText = getSelectedText();
        if (selectedText) { 
            showTranslation(selectedText); 
            return; 
        }
        
        const clickedWord = getWordUnderCursorExt(event);
        if (clickedWord) { 
            showTranslation(clickedWord); 
        }
    };

    // Initialize and add/remove event listeners
    browserApi.storage.local.get(['isEnabled'], (result) => {
        isEnabled = result.isEnabled !== false;
        if (isEnabled) document.addEventListener('click', handleClickExt);
    });

    browserApi.storage.onChanged.addListener((changes, namespace) => {
        if (changes.isEnabled && namespace === 'local') {
            isEnabled = changes.isEnabled.newValue;
            if (isEnabled) {
                document.addEventListener('click', handleClickExt);
            } else {
                document.removeEventListener('click', handleClickExt);
                popupExt.style.display = 'none';
                overlayExt.style.display = 'none';
            }
        }
    });

})();
}
}