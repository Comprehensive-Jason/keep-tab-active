// Grants or revokes the optional "<all_urls>" access behind the favicon pin.
// permissions.request needs a user gesture, which the button click provides.
const ALL_SITES = { origins: ["<all_urls>"] };
const status = document.getElementById("status");
const button = document.getElementById("toggle");

async function render() {
  const granted = await chrome.permissions.contains(ALL_SITES);
  status.textContent = granted ? "on (all sites)" : "off (only the tab in view)";
  button.textContent = granted ? "Turn off" : "Allow access to all sites";
  button.hidden = false;
}

button.addEventListener("click", async () => {
  if (await chrome.permissions.contains(ALL_SITES)) {
    await chrome.permissions.remove(ALL_SITES);
  } else {
    await chrome.permissions.request(ALL_SITES);
  }
  render();
});

render();
