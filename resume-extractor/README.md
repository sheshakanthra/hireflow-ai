# ResumeAI Extractor

A lightweight, single-folder web app that uses the **Anthropic Claude API** to parse a resume and extract structured details — no build tools, no frameworks, no dependencies to install.

---

## Features

- **Upload or paste** a resume (`.txt`, `.pdf`, `.doc`, `.docx`)
- Extracts: name, title, contact info, technical & soft skills, work experience, education, and GPA
- Generates **AI insights** about the candidate's strengths and best-fit roles
- Clean, responsive UI with dark-mode support
- Zero build step — open `index.html` directly in a browser (with a local server for CORS)

---

## Project structure

```
resume-extractor/
├── index.html   # App shell & markup
├── style.css    # All styles (CSS variables, dark mode, responsive)
├── app.js       # API calls, file handling, result rendering
└── README.md    # This file
```

---

## Quick start

### 1. Get an Anthropic API key

Sign up at [console.anthropic.com](https://console.anthropic.com) and create an API key.

### 2. Add your API key

**Option A — edit source (simplest):**

Open `app.js` and replace the placeholder on line 12:

```js
const ANTHROPIC_API_KEY = 'sk-ant-...'; // ← your key here
```

**Option B — localStorage (no source edit needed):**

Open the browser console on the app page and run:

```js
localStorage.setItem('anthropic_api_key', 'sk-ant-...');
```

The app reads this automatically on every load.

### 3. Serve locally

Browsers block direct `file://` API calls due to CORS. Use any static server:

**Python (built-in):**
```bash
cd resume-extractor
python3 -m http.server 8080
# → open http://localhost:8080
```

**Node.js (npx):**
```bash
npx serve resume-extractor
# → open the printed URL
```

**VS Code:** Install the *Live Server* extension, right-click `index.html` → *Open with Live Server*.

---

## Usage

1. Open the app in your browser.
2. Either **drag & drop** a resume file onto the upload zone, or **paste** the resume text into the text area.
3. Click **Analyze resume**.
4. Structured results appear below: profile, contact info, skills, experience, education, and AI insights.

> **Note on PDF files:** The browser reads PDF as raw bytes. Plain-text PDFs (digitally created) parse well. Scanned/image-only PDFs will not extract text — copy-paste the text instead in that case.

---

## Customising

| What | Where |
|---|---|
| Change the Claude model | `app.js` → `model` field in the fetch body |
| Adjust extracted fields | `app.js` → `SYSTEM_PROMPT` constant |
| Tweak colours / typography | `style.css` → `:root` CSS variables |
| Add new result sections | `app.js` → add a `renderXxx()` function and call it in `renderResults()` |

---

## API key security

- **Never commit your API key to a public repository.**
- For a production deployment, proxy the Anthropic API through your own backend so the key is never exposed in client-side code.
- The `anthropic-dangerous-direct-browser-access: true` header is required for direct browser → Anthropic calls; it signals you accept the responsibility of keeping the key safe.

---

## License

MIT — free to use, modify, and distribute.
