/// <reference types="chrome" />

// Minimal content script — only injected on-demand via chrome.scripting.executeScript
// Returns selected text to the service worker.

(() => {
  const selection = window.getSelection();
  if (selection && selection.toString().trim()) {
    chrome.runtime.sendMessage({
      type: "SELECTION_TEXT",
      text: selection.toString(),
    });
  }
})();
