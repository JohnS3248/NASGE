# Privacy Statement

This document explains how the NASGE browser extension handles user data.

**[中文版](PRIVACY.md)**

---

## Data Collection

**NASGE does not collect any user data.** No analytics, no telemetry, no tracking, no external servers.

## Local Storage

NASGE uses the browser's `localStorage` and `chrome.storage` to save the following data locally:

- Guide and review drafts
- Archive snapshots
- Editor settings (theme, layout, language preference, etc.)
- Image library tags

All data is stored in the user's local browser and is never automatically uploaded to any server.

## Permissions

| Permission | Purpose |
|------------|---------|
| `storage` | Save drafts, archives, and user settings locally |
| `activeTab` | Interact with the current Steam page when the user clicks the extension icon |
| `scripting` | Inject content scripts into Steam pages for the guide/review editing bridge |

### Host Permissions

| Domain | Purpose |
|--------|---------|
| `steamcommunity.com` | Read/write guide content, upload images, manage chapters |
| `store.steampowered.com` | Read/write game reviews |

## Image Uploads

When the user uploads images, they are sent directly to Steam's own upload endpoint (`steamcommunity.com`). NASGE does not proxy, store, or forward images to any third-party server.

## Network Communication

NASGE only communicates with the Steam domains listed above. No data is sent to NASGE developers or any third party.

## Third-Party Services

None. NASGE does not use any analytics services (e.g., Google Analytics), crash reporting, CDNs, or external APIs.

## Open Source

The full source code of NASGE is hosted on [GitHub](https://github.com/JohnS3248/NASGE). Anyone can audit the code to verify the statements above.

## Contact

For privacy-related questions, please file an issue on [GitHub Issues](https://github.com/JohnS3248/NASGE/issues).
