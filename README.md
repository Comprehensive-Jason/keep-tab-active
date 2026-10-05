# Keep Tab Active

A tiny Chromium extension (Chrome, Brave, Edge) that stops Memory Saver from discarding the tabs you pick, without replacing Memory Saver or protecting every tab.

Memory Saver unloads background tabs to save memory. That is fine until it unloads a video you were halfway through and the progress resets. Browsers only offer a site allowlist, which does not fit tabs you want protected for an hour and then never again. This extension flips the same per-tab switch as `chrome://discards` ("Auto Discardable"), from a right-click.

## Use

- Right-click a page, or a tab in the tab strip, and choose **Keep this tab active**. On a protected tab the page menu item reads **Stop keeping this tab active**.
- Or click the toolbar icon, or press `Alt+Shift+K` (change it at `chrome://extensions/shortcuts`).
- Protected tabs get a green pin badge on their favicon, and the toolbar icon shows **ON**.
- Check it at `chrome://discards`: protected tabs show a cross in the "Auto Discardable" column.

## Install (unpacked)

1. Download or clone this repository.
2. Open `chrome://extensions` (or `brave://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and choose the folder.

## Permissions

| Permission | Why |
|---|---|
| `contextMenus` | The right-click items. |
| `activeTab`, `scripting` | Swapping the favicon for the marked one on the tab you are viewing when you protect it. |
| `favicon` | Reading the browser's cached favicon to draw the badge on. |
| `<all_urls>` (optional, off by default) | Turned on from the extension's options page. Lets the favicon pin also appear on background tabs protected from the tab strip, and come back after a protected tab reloads. |

The protection itself needs none of these; only the favicon pin does. The extension makes no network requests and stores nothing; the protection lives on the tab itself. See [PRIVACY.md](PRIVACY.md).

## Limits

- Without the optional all-sites access, the favicon pin appears only on the tab you are viewing when you protect it, and a full reload clears it (the tab stays protected; the toolbar badge stays correct).
- Protection lasts until the tab closes or the browser restarts.
- Protecting a tab that has already been discarded reloads it straight away (its earlier state, such as a video position, is already gone), so the favicon pin shows that it worked.
- The tab-strip menu item needs a browser version that supports the `tab` context menu; on older versions only the page menu, toolbar icon, and shortcut are available.
- The tab-strip item's wording cannot change per tab (Chromium has no "menu is opening" event); the favicon badge shows the state.
- YouTube's player replaces the right-click menu; right-click twice on the video, right-click outside it, or use the shortcut.
- No favicon badge on browser pages, the Web Store, or PDFs; the browser blocks scripts there.

## Icon

Lucide [`pin`](https://lucide.dev/icons/pin) (ISC licence, see `icons/LUCIDE-LICENSE.txt`). `icons/icon-source.svg` is the toolbar tile; re-render the PNGs with ImageMagick:

```bash
for s in 16 32 48 128; do magick -background none -density 1200 icon-source.svg -resize ${s}x${s} icon-$s.png; done
```

## Licence

MIT, see `LICENSE`.
