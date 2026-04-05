<div align="center">

<img src="./assets/NASGElogo.jpg" alt="NASGE" width="200">

# NASGE — Not A Steam Guide Editor

**A creator-friendly WYSIWYG browser extension for editing Steam community guides**

[![Version](https://img.shields.io/badge/version-0.9.7-blue.svg)](https://github.com/JohnS3248/NASGE/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
<!-- [![Chrome Web Store](https://img.shields.io/chrome-web-store/v/EXTENSION_ID?label=Chrome%20Web%20Store&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/EXTENSION_ID) -->

**[简体中文](README.md) | English**

</div>

---

<!-- TODO: Highlights 截图表格 — 需要准备截图后替换 -->
<!-- 参考 Refined GitHub: https://github.com/refined-github/refined-github#highlights -->

| | |
|:---:|:---:|
| ![WYSIWYG Editor](https://placehold.co/480x300/1b2838/ffffff?text=WYSIWYG+Editor) | ![Chapter Navigation](https://placehold.co/480x300/1b2838/ffffff?text=Chapter+Navigation) |
| **WYSIWYG BBCode Editor** — Edit with rich text, publish as BBCode | **Chapter Management** — Drag-and-drop reorder, batch sync |
| ![Image Pool](https://placehold.co/480x300/1b2838/ffffff?text=Image+Pool) | ![Themes](https://placehold.co/480x300/1b2838/ffffff?text=Themes) |
| **Image Pool** — Browse & insert from Steam's guide image library | **Multi-theme** — steam-dark · midnight · classic |

---

<details>
<summary><strong>Table of Contents</strong></summary>

- [Why NASGE?](#why-nasge)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Tech Stack](#tech-stack)
- [Development](#development)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [License](#license)

</details>

## Why NASGE?

Steam's built-in guide editor is a plain-text BBCode editor with no preview, no image management, and no draft system. Writing a well-formatted guide means constantly switching between editing and previewing, manually typing BBCode tags, and risking lost work with no auto-save.

**NASGE replaces that workflow** with a full WYSIWYG editor that opens in its own tab — you write in rich text, and NASGE handles the BBCode conversion and Steam sync behind the scenes.

## Features

- **WYSIWYG Editing** — Full rich-text editor powered by TipTap. Bold, italic, headings, lists, links, tables, spoiler tags, blockquotes — all rendered visually, converted to BBCode on publish
- **Chapter Management** — View all chapters in a sidebar, drag to reorder, pull from / push to Steam with one click
- **Image Pool** — Browse your guide's uploaded images in a floating panel. Search, filter by tags, insert with one click. Upload new images directly from the editor
- **Review Mode** — Write and publish Steam game reviews with the same WYSIWYG experience. Recommend/not-recommend, visibility, language settings all in one panel
- **Multi-theme** — Three built-in themes: steam-dark, midnight, classic. Follows your preference across sessions
- **Drafts & Archives** — Auto-saved local drafts with manual archive snapshots. Never lose work again
- **Offline Mode** — Create and edit drafts without a Steam connection. Sync when you're ready
- **i18n** — Bilingual interface (简体中文 / English), auto-detects browser language
- **BBCode Roundtrip Fidelity** — `BBCode → HTML → BBCode` produces semantically equivalent output. Your formatting is preserved, not "normalized"

## Installation

### Chrome Web Store (Recommended)

<!-- TODO: Chrome Web Store 上架后替换链接 -->
> Coming soon — the extension is preparing for its first public release.

### Manual Install (Developer)

1. Clone the repository
   ```bash
   git clone https://github.com/JohnS3248/NASGE.git
   cd NASGE
   npm install
   ```
2. Build the extension
   ```bash
   npm run build
   ```
3. Load in Chrome
   - Open `chrome://extensions`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked** → select the `dist/` folder

## Usage

1. Navigate to any Steam guide editing page (`steamcommunity.com/sharedfiles/manageguide/...`)
2. Click the NASGE extension icon → **Edit Guide**
3. A new tab opens with the WYSIWYG editor
4. Edit your guide → click **Push** to sync chapters back to Steam

**Offline mode**: Click the extension icon → **Open Editor (Offline Mode)** to work on drafts without Steam.

## Tech Stack

| Category | Technology |
|----------|------------|
| UI Framework | React 19 |
| Rich-text Editor | TipTap 3 (ProseMirror) |
| State Management | Zustand 5 |
| Styling | Tailwind CSS 4 |
| Language | TypeScript 5 (strict mode) |
| Build | Vite 7 + @crxjs/vite-plugin |
| i18n | i18next + react-i18next |
| Extension | Chrome Manifest V3 |

## Development

```bash
# Install dependencies
npm install

# Dev server (editor UI iteration only, not a loadable extension)
npm run dev

# Watch mode (load dist/ as unpacked extension for real testing)
npm run dev:extension

# Type check
npm run type-check

# Run tests
npm run test

# Production build
npm run build
```

### Architecture

```
src/
├── editor/          # Main editor app (opens in its own tab)
│   ├── components/  # React components
│   ├── extensions/  # Custom TipTap extensions (steamImage, spoiler, etc.)
│   ├── stores/      # Zustand stores
│   ├── services/    # Steam API bridge, image upload, chapter sync
│   └── utils/       # BBCode converter, utilities
├── content/         # Content scripts injected into steamcommunity.com
├── background/      # Service worker (message relay)
├── popup/           # Extension popup UI
├── i18n/            # Internationalization resources
└── shared/          # Shared types, logger, message protocol
```

Communication flow: **Editor tab** ↔ `chrome.runtime` ↔ **Background SW** ↔ **Content script** ↔ **Steam page DOM**

## Contributing

1. Fork the repo & create a branch (`git checkout -b feat/my-feature`)
2. `npm install && npm run dev:extension`
3. Load `dist/` as unpacked extension in Chrome
4. Make changes → `npm run build` → verify manually
5. Submit a PR

Bug reports and feature requests are welcome on [GitHub Issues](https://github.com/JohnS3248/NASGE/issues).

<!-- See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines. -->

## Roadmap

- [x] WYSIWYG BBCode editor with roundtrip fidelity
- [x] Chapter management & Steam sync
- [x] Image pool & upload
- [x] Review mode
- [x] Multi-theme support (steam-dark / midnight / classic)
- [x] Draft & archive system
- [x] i18n (zh-CN + en-US)
- [ ] Onboarding tour for new users
- [ ] Chrome Web Store listing
- [ ] Firefox support
- [ ] More languages (contributions welcome!)

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

**[Report Bug](https://github.com/JohnS3248/NASGE/issues)** · **[Request Feature](https://github.com/JohnS3248/NASGE/issues)**

</div>
