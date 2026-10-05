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
  // Chrome 150 added it; the try is a second guard for builds that list the
  // type but reject it.
  if (chrome.contextMenus.ContextType?.TAB) {
    try {
      chrome.contextMenus.create(
        { id: TAB_MENU_ID, title: "Toggle keep tab active", contexts: ["tab"] },
        () => void chrome.runtime.lastError,
      );
    } catch {
      // Older browser: the page menu, toolbar icon, and shortcut still work.
    }
  }
});

chrome.action.setBadgeBackgroundColor({ color: GREEN });

// Tabs to protect as soon as they finish loading (see toggle).
const pendingKeep = new Set();

async function toggle(tab) {
  if (!tab || tab.id === chrome.tabs.TAB_ID_NONE) return;
  const fresh = await chrome.tabs.get(tab.id);
  const keep = fresh.autoDiscardable !== false;
  // Discarded by Memory Saver, or restored at startup but never loaded
  // (status "unloaded" without the discarded flag).
  const unloaded = fresh.discarded || fresh.status === "unloaded";
  try {
    await chrome.tabs.update(tab.id, { autoDiscardable: !keep });
  } catch (e) {
    console.warn("Keep Tab Active: could not set autoDiscardable", { status: fresh.status, discarded: fresh.discarded }, e);
    if (!(keep && unloaded)) throw e;
    pendingKeep.add(tab.id);
  }
  // An unloaded tab has no page to pin. Protecting it means the user wants
  // it kept, so load it now; onUpdated pins it when the load completes.
  if (keep && unloaded) {
    await loadTab(tab.id);
    return;
  }
  // No URL means no page access (a background tab without the opt-in);
  // the protection still applies, only the favicon pin is skipped.
  if (keep && !fresh.url) return;
  await markTab(tab.id, keep ? fresh.url : null);
}

// Reload is enough for a discarded tab; if a never-loaded restored tab is
// still unloaded afterwards, navigate it to its own URL instead.
async function loadTab(tabId) {
  await chrome.tabs.reload(tabId).catch((e) => console.warn("Keep Tab Active: reload failed", e));
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const after = await chrome.tabs.get(tabId).catch(() => null);
  if (after?.status === "unloaded" && after.url) {
    await chrome.tabs.update(tabId, { url: after.url }).catch((e) => console.warn("Keep Tab Active: load failed", e));
  }
}

// Page access comes from activeTab by default: toggling counts as a user
// gesture on the tab in view. The opt-in on the options page grants
// "<all_urls>", which also reaches background tabs and survives reloads.
// Some sites' security policy (CSP img-src) forbids data: images, so the
// browser keeps the old favicon. When the swap didn't take, mark the title
// with a pin instead. A frozen background tab runs the script only once the
// user switches to it, so this waits until then.
async function markTab(tabId, pageUrl) {
  const href = pageUrl ? await markedFavicon(pageUrl) : null;
  const run = (useTitle) =>
    chrome.scripting.executeScript({ target: { tabId }, func: setFaviconMark, args: [href, useTitle] });
  try {
    await run(false);
    if (!href) return;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const tab = await chrome.tabs.get(tabId);
    if (tab.autoDiscardable === false && !tab.favIconUrl?.startsWith("data:")) await run(true);
  } catch {
    // brave:// pages, the Web Store, and PDFs refuse scripts; closed tabs
  }
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
// The site's icon links are parked in a <template> (inert, so the browser
// ignores them) rather than renamed: browsers re-read the favicon when icon
// links are added or removed, but can miss a rel change on a loaded page.
// Everything lives in the page itself, so a reloaded or updated copy of the
// extension can still undo what an earlier copy did.
// With useTitle, leaves the icons alone and prefixes the title instead.
function setFaviconMark(href, useTitle = false) {
  const PIN = "📌 "; // defined here: injected functions can't see outer constants
  // Each call stamps the page; a watcher from an older call, or from an
  // earlier copy of the extension (its scripts linger in the page after a
  // reload or update), stands down instead of re-adding its pin.
  const gen = String(Math.random());
  document.documentElement.dataset.ktaGen = gen;

  if (document.title.startsWith(PIN)) document.title = document.title.slice(PIN.length);

  document.querySelector("link[data-keep-tab-active]")?.remove();
  const parked = document.querySelector("template[data-kta-parked]");
  if (parked) {
    document.head.append(...parked.content.childNodes);
    parked.remove();
  }
  for (const link of document.querySelectorAll('link[rel="kta-hidden-icon"]')) {
    link.rel = link.dataset.ktaRel; // renamed by 1.6 and earlier
  }
  if (!href) return;

  let observer;
  const apply = () => {
    if (!chrome.runtime?.id || document.documentElement.dataset.ktaGen !== gen) {
      observer?.disconnect();
      return;
    }
    if (useTitle) {
      if (!document.title.startsWith(PIN)) document.title = PIN + document.title;
      return;
    }
    const icons = document.querySelectorAll('link[rel~="icon"]:not([data-keep-tab-active])');
    if (icons.length) {
      let park = document.querySelector("template[data-kta-parked]");
      if (!park) {
        park = document.createElement("template");
        park.dataset.ktaParked = "";
        document.head.append(park);
      }
      park.content.append(...icons);
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
  observer = new MutationObserver(apply);
  observer.observe(document.head, {
    childList: true,
    subtree: true,
    characterData: true, // the site retitling itself (YouTube, chat apps)
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
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && pendingKeep.delete(tabId)) {
    tab = await chrome.tabs.update(tabId, { autoDiscardable: false });
  }
  reflect(tab);
  // A full page load (reload, new site, or a discarded tab coming back)
  // wipes the injected favicon, so put it back on protected tabs. Only
  // possible with the opt-in; without it tab.url is hidden and this skips.
  if (changeInfo.status === "complete" && tab.autoDiscardable === false && tab.url) {
    markTab(tabId, tab.url);
  }
});

// When the opt-in is granted, pin every tab that is already protected.
chrome.permissions.onAdded.addListener(async () => {
  for (const tab of await chrome.tabs.query({})) {
    if (tab.autoDiscardable === false && tab.url) markTab(tab.id, tab.url);
  }
});
chrome.tabs.onActivated.addListener(({ tabId }) => chrome.tabs.get(tabId).then(reflect));
chrome.windows.onFocusChanged.addListener(reflectActiveTab);
