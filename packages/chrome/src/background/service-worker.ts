/// <reference types="chrome" />

// Register context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "whiteout-anonymize",
    title: "Whiteout: Anonymiser la sélection",
    contexts: ["selection"],
  });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "whiteout-anonymize" && info.selectionText) {
    // Store selected text and open popup
    chrome.storage.local.set({ pendingText: info.selectionText });

    // Inject content script to get selection with formatting
    if (tab?.id) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: getSelectionText,
      }).then((results) => {
        if (results?.[0]?.result) {
          chrome.storage.local.set({ pendingText: results[0].result });
        }
      });
    }

    // Open popup as a new window (context menu can't open the action popup)
    chrome.windows.create({
      url: chrome.runtime.getURL("src/popup/popup.html"),
      type: "popup",
      width: 900,
      height: 700,
    });
  }
});

function getSelectionText(): string {
  return window.getSelection()?.toString() ?? "";
}

// Request persistent storage
navigator.storage?.persist?.();
