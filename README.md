# AutoApply 🚀

> **Free, local, unlimited AI-ready job scraper and auto-apply dashboard powered by Playwright.**

AutoApply gives you the automated job-hunting powers of services like Sonara and Simplify Autopilot without subscription paywalls, weekly application credit limits, or privacy concerns. Everything runs locally on your machine.

---

## ✨ Features

- **Direct ATS Scraper:** Pulls clean, live job postings straight from **Greenhouse**, **Lever**, and **Ashby** JSON APIs. Never blocked by Cloudflare or anti-bot shields.
- **Smart Form Filler:** Automatically maps your candidate profile to complex web forms (`input`, `textarea`, `select`, `radio`), handles resume PDF uploads, and dispatches native browser events for React/Vue/Angular apps.
- **Safe Dry-Run Mode:** Test and preview your applications in real-time inside visible Chromium before deciding to auto-submit.
- **Modern Web Dashboard:** Built with Tailwind CSS, featuring target company quick-select, keyword filtering, a live execution terminal, and profile management.
- **Application History:** Automatically logs every submission and dry-run with timestamp and status.

---

## 🛠️ Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/bigwoon/autoapply.git
cd autoapply
```

### 2. Install dependencies & Playwright browser
```bash
npm install
npx playwright install chromium
```

### 3. Place your resume
Copy your PDF resume into the project root and name it `resume.pdf`:
```bash
cp /path/to/your/resume.pdf ./resume.pdf
```

### 4. Launch the Dashboard
```bash
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser!

---

## 🖥️ How It Works

1. **Profile Setup (`/profile`):**
   Fill in your personal information, contact links (LinkedIn, GitHub, Portfolio), work authorization status, and default answers.
2. **Scrape Target Companies:**
   Enter company slugs (e.g. `stripe, figma, discord, cloudflare, datadog`) and click **Scrape Jobs**. The scraper pulls hundreds of active listings in seconds.
3. **Select & Launch Autopilot:**
   Filter by keywords (e.g. `Software Engineer`), check the jobs you want to apply for, and click **Launch Autopilot**.
   - With **Dry-Run Mode** enabled: It fills all fields and pauses for 8 seconds so you can verify.
   - With **Dry-Run Mode** disabled: It locates the submit button and automatically applies.

---

## 📁 Project Architecture

```
autoapply/
├── public/
│   └── index.html      # Responsive Tailwind CSS Web Dashboard
├── auto-apply.mjs      # Playwright form automation & field mapper
├── scraper.mjs         # Greenhouse, Lever, & Ashby ATS scraper
├── server.mjs          # Express API server & log streaming
├── profile.json        # Your candidate profile & preferences
├── package.json        # Node.js configuration & scripts
└── README.md           # Documentation
```

---

## 📄 License
MIT © bigwoon
