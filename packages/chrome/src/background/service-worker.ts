/**
 * Whiteout Chrome Extension - Service Worker (MV3 background script).
 *
 * Handles message routing between content scripts, popup, sidebar, and
 * options page. Opens the side panel on action click. Creates a context
 * menu for anonymizing selected text via the popup.
 */

/// <reference types="chrome" />

import type { Entity } from "@whiteout/core";

// -- Types for inter-component messaging --

export interface ScanPageMessage {
  type: "SCAN_PAGE";
}

export interface ApplyAliasesMessage {
  type: "APPLY_ALIASES";
  entities: Entity[];
}

export interface HighlightEntitiesMessage {
  type: "HIGHLIGHT_ENTITIES";
  entities: Entity[];
}

export interface ApplySubstitutionMessage {
  type: "APPLY_SUBSTITUTION";
  entities: Entity[];
}

export interface ExtractTextMessage {
  type: "EXTRACT_TEXT";
}

export interface ExtractTextResponse {
  text: string;
  title: string;
}

export interface StatusMessage {
  type: "STATUS";
  status: "idle" | "scanning" | "done" | "error";
  detail?: string;
}

export type WhiteoutMessage =
  | ScanPageMessage
  | ApplyAliasesMessage
  | HighlightEntitiesMessage
  | ApplySubstitutionMessage
  | ExtractTextMessage
  | StatusMessage;

// -- Context menu registration (from distant) --

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "whiteout-anonymize",
    title: "Whiteout: Anonymiser la selection",
    contexts: ["selection"],
  });
});

// -- Context menu click handler --

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
      url: chrome.runtime.getURL("popup/popup.html"),
      type: "popup",
      width: 900,
      height: 700,
    });
  }
});

function getSelectionText(): string {
  return window.getSelection()?.toString() ?? "";
}

// -- Action click: open the side panel --

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id != null) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

// -- Message routing --

chrome.runtime.onMessage.addListener(
  (message: WhiteoutMessage, sender, sendResponse) => {
    handleMessage(message, sender, sendResponse).catch((err) => {
      console.error("[Whiteout SW] Error handling message:", err);
      sendResponse({ error: String(err) });
    });
    // Return true to indicate we will respond asynchronously.
    return true;
  },
);

async function handleMessage(
  message: WhiteoutMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
): Promise<void> {
  switch (message.type) {
    case "SCAN_PAGE": {
      await handleScanPage(sendResponse);
      break;
    }

    case "APPLY_ALIASES": {
      await handleApplyAliases(message as ApplyAliasesMessage, sendResponse);
      break;
    }

    case "HIGHLIGHT_ENTITIES": {
      await forwardToActiveTab(message);
      sendResponse({ ok: true });
      break;
    }

    case "APPLY_SUBSTITUTION": {
      await forwardToActiveTab(message);
      sendResponse({ ok: true });
      break;
    }

    default: {
      sendResponse({ error: `Unknown message type: ${(message as unknown as Record<string, unknown>).type}` });
    }
  }
}

// -- SCAN_PAGE: ask the content script for page text, relay to sidebar --

async function handleScanPage(
  sendResponse: (response?: unknown) => void,
): Promise<void> {
  broadcastStatus("scanning");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      sendResponse({ error: "No active tab" });
      broadcastStatus("error", "Aucun onglet actif");
      return;
    }

    // Ask the content script to extract text
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "EXTRACT_TEXT",
    } as ExtractTextMessage) as ExtractTextResponse;

    sendResponse({
      text: response.text,
      title: response.title,
      tabId: tab.id,
    });
  } catch (err) {
    console.error("[Whiteout SW] SCAN_PAGE failed:", err);
    sendResponse({ error: String(err) });
    broadcastStatus("error", String(err));
  }
}

// -- APPLY_ALIASES: forward entity substitutions to the active tab --

async function handleApplyAliases(
  message: ApplyAliasesMessage,
  sendResponse: (response?: unknown) => void,
): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      sendResponse({ error: "No active tab" });
      return;
    }

    await chrome.tabs.sendMessage(tab.id, {
      type: "APPLY_SUBSTITUTION",
      entities: message.entities,
    } as ApplySubstitutionMessage);

    broadcastStatus("done");
    sendResponse({ ok: true });
  } catch (err) {
    console.error("[Whiteout SW] APPLY_ALIASES failed:", err);
    sendResponse({ error: String(err) });
  }
}

// -- Helpers --

async function forwardToActiveTab(message: WhiteoutMessage): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.tabs.sendMessage(tab.id, message);
  }
}

function broadcastStatus(status: StatusMessage["status"], detail?: string): void {
  const msg: StatusMessage = { type: "STATUS", status, detail };
  chrome.runtime.sendMessage(msg).catch(() => {
    // Sidebar/popup may not be open; swallow the error.
  });
}

// Request persistent storage
navigator.storage?.persist?.();
