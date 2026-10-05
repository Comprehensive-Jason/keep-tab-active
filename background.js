// Keep Tab Active: flips a tab's autoDiscardable flag, the same switch as
// brave://discards. Memory Saver skips tabs where it is false. No state is
// stored; the tab itself holds the flag, so it ends when the tab closes.

const MENU_ID = "keep-tab-active";
const TAB_MENU_ID = "keep-tab-active-tab-strip";
const GREEN = "#2e7d32";

// Lucide "pin" (ISC licence, see icons/LUCIDE-LICENSE.txt), 24x24 viewBox.
const PIN_PATHS = [
  "M12 17v5",
  "M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z",
];

// A plain item, not a checkbox: Chromium only shows an extension's lone
// item inline in the page menu when it is a normal item.
const TITLE_OFF = "Keep this tab active";
const TITLE_ON = "Stop keeping this tab active";

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_ID,
    title: TITLE_OFF,
    contexts: ["all"],
  });
  // The tab strip's right-click menu. Newer Chromium builds expose it (older
  // ones only in Firefox), so check first, as WebScrapBook does. The title
  // can't follow the clicked tab, since Chromium has no "menu is opening"
  // event, so it stays neutral; the favicon pin shows the state there.
  if (chrome.contextMenus.ContextType?.TAB) {
    chrome.contextMenus.create({
      id: TAB_MENU_ID,
      title: "Toggle keep tab active",
      contexts: ["tab"],
    });
  }
});

chrome.action.setBadgeBackgroundColor({ color: GREEN });

async function toggle(tab) {
  if (!tab || tab.id === chrome.tabs.TAB_ID_NONE) return;
  const fresh = await chrome.tabs.get(tab.id);
  const keep = fresh.autoDiscardable !== false;
  await chrome.tabs.update(tab.id, { autoDiscardable: !keep });
  await markTab(tab.id, keep ? fresh.url : null);
}

// Site access ("<all_urls>") lets this reach background tabs and re-mark a
// protected tab after it reloads; activeTab alone covered only the tab in view.
async function markTab(tabId, pageUrl) {
  const href = pageUrl ? await markedFavicon(pageUrl) : null;
  chrome.scripting
    .executeScript({ target: { tabId }, func: setFaviconMark, args: [href] })
    .catch(() => {}); // brave:// pages, the Web Store, and PDFs refuse scripts
}

// The site's favicon with a green pin badge in the corner, as a data: URL.
// Drawn here because the extension can read Brave's favicon cache
// (the "favicon" permission) without the page's cross-origin limits.
async function markedFavicon(pageUrl) {
  const size = 32;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  try {
    const src = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=${size}`);
    const bitmap = await createImageBitmap(await (await fetch(src)).blob());
    ctx.drawImage(bitmap, 0, 0, size, size);
  } catch {
    // No cached favicon: the badge alone still shows the state.
  }
  ctx.beginPath();
  ctx.arc(21, 21, 10, 0, 2 * Math.PI);
  ctx.fillStyle = GREEN;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.save();
  ctx.translate(14.5, 14.5);
  ctx.scale(13 / 24, 13 / 24);
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const d of PIN_PATHS) ctx.stroke(new Path2D(d));
  ctx.restore();
  const bytes = new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer());
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:image/png;base64,${btoa(binary)}`;
}

// Runs inside the page. With an href, swaps in the marked favicon and keeps
// it there if the site rewrites its icons (YouTube does on every video).
// With null, puts the site's own icons back.
function setFaviconMark(href) {
  const state = (window.__keepTabActive ??= { hidden: [] });
  state.observer?.disconnect();
  document.querySelector("link[data-keep-tab-active]")?.remove();
  for (const link of state.hidden) link.rel = link.dataset.ktaRel;
  state.hidden = [];
  if (!href) return;

  const apply = () => {
    for (const link of document.querySelectorAll('link[rel~="icon"]:not([data-keep-tab-active])')) {
      link.dataset.ktaRel = link.rel;
      link.rel = "kta-hidden-icon";
      state.hidden.push(link);
    }
    if (!document.querySelector("link[data-keep-tab-active]")) {
      const ours = document.createElement("link");
      ours.rel = "icon";
      ours.href = href;
      ours.dataset.keepTabActive = "";
      document.head.append(ours);
    }
  };
  apply();
  state.observer = new MutationObserver(apply);
  state.observer.observe(document.head, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["rel", "href"],
  });
}

// Show the state: a badge on the toolbar icon, and the menu item's wording
// (the menu is shared by all tabs, so it follows whichever tab is active).
function reflect(tab) {
  const kept = tab.autoDiscardable === false;
  chrome.action.setBadgeText({ tabId: tab.id, text: kept ? "ON" : "" });
  if (tab.active) {
    chrome.contextMenus.update(MENU_ID, { title: kept ? TITLE_ON : TITLE_OFF }).catch(() => {});
  }
}

async function reflectActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab) reflect(tab);
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID || info.menuItemId === TAB_MENU_ID) toggle(tab);
});
chrome.action.onClicked.addListener(toggle);
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-keep-active") toggle(tab);
});

// onUpdated fires when the flag changes and on navigation, which clears
// per-tab badges, so re-applying here keeps the badge accurate.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  reflect(tab);
  // A full page load (reload, new site, or a discarded tab coming back)
  // wipes the injected favicon, so put it back on protected tabs.
  if (changeInfo.status === "complete" && tab.autoDiscardable === false) {
    markTab(tabId, tab.url);
  }
});
chrome.tabs.onActivated.addListener(({ tabId }) => chrome.tabs.get(tabId).then(reflect));
chrome.windows.onFocusChanged.addListener(reflectActiveTab);
