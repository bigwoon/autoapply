import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrapeCompanies, scrapeGeneralWeb, TOP_TECH_COMPANIES } from './scraper.mjs';
import { applyToJob } from './auto-apply.mjs';
import { extractTextFromPdf, parseResumeText, parseResumeSmart } from './resume-parser.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PROFILE_PATH = path.join(__dirname, 'profile.json');
const HISTORY_PATH = path.join(__dirname, 'history.json');
const STORED_RESUME_PATH = path.join(__dirname, 'stored_resume.pdf');
const SETTINGS_PATH = path.join(__dirname, 'settings.json');

function getSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch {}
  return {};
}

// In-memory state for UI log streaming
let liveLogs = [];
let isRunning = false;
let stopRequested = false;

function addLog(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  liveLogs.push(line);
  if (liveLogs.length > 200) liveLogs.shift();
  console.log(line);
}

// 1. Get Profile
app.get('/api/profile', (req, res) => {
  try {
    if (!fs.existsSync(PROFILE_PATH)) {
      return res.json({});
    }
    const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Save Profile
app.post('/api/profile', (req, res) => {
  try {
    fs.writeFileSync(PROFILE_PATH, JSON.stringify(req.body, null, 2), 'utf8');
    addLog('Profile settings updated successfully.');
    res.json({ success: true, message: 'Profile saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Settings (API keys)
app.get('/api/settings', (req, res) => {
  const settings = getSettings();
  // Mask the key for the UI
  if (settings.geminiApiKey) {
    settings.geminiApiKeyMasked = settings.geminiApiKey.slice(0, 6) + '...' + settings.geminiApiKey.slice(-4);
  }
  res.json(settings);
});

app.post('/api/settings', (req, res) => {
  try {
    const current = getSettings();
    const updated = { ...current, ...req.body };
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(updated, null, 2), 'utf8');
    addLog('Settings saved.');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resume Status
app.get('/api/resume', (req, res) => {
  try {
    const exists = fs.existsSync(STORED_RESUME_PATH);
    let filename = 'resume.pdf';
    let size = 0;
    if (exists) {
      const stats = fs.statSync(STORED_RESUME_PATH);
      size = (stats.size / 1024).toFixed(1); // KB
      if (fs.existsSync(PROFILE_PATH)) {
        const prof = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
        if (prof.resumeFileName) filename = prof.resumeFileName;
      }
    }
    res.json({ hasResume: exists, filename, sizeKb: size, path: exists ? STORED_RESUME_PATH : null });
  } catch (err) {
    res.json({ hasResume: false, error: err.message });
  }
});

// Upload & Store Resume with Smart Parsing
app.post('/api/upload-resume', async (req, res) => {
  try {
    const { filename, data } = req.body;
    if (!data) return res.status(400).json({ error: 'No resume data received' });

    const buffer = Buffer.from(data, 'base64');
    fs.writeFileSync(STORED_RESUME_PATH, buffer);

    // Extract text and parse fields from the PDF
    const rawText = await extractTextFromPdf(buffer);
    const settings = getSettings();
    const extracted = await parseResumeSmart(rawText, settings.geminiApiKey || null);
    const engine = extracted._parserEngine || 'local-regex';
    delete extracted._parserEngine;

    // Update profile.json with the stored resume path and extracted fields
    let profile = {};
    if (fs.existsSync(PROFILE_PATH)) {
      profile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
    }
    profile.resumePath = STORED_RESUME_PATH;
    profile.resumeFileName = filename || 'resume.pdf';

    // Merge non-empty extracted fields
    for (const [key, val] of Object.entries(extracted)) {
      if (val) profile[key] = val;
    }

    fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2), 'utf8');

    addLog(`✓ Stored and parsed resume: ${profile.resumeFileName} (${(buffer.length / 1024).toFixed(1)} KB) [engine: ${engine}]`);
    if (Object.keys(extracted).length > 0) {
      addLog(`  -> Auto-extracted fields: ${Object.keys(extracted).join(', ')}`);
    }

    res.json({ 
      success: true, 
      filename: profile.resumeFileName, 
      sizeKb: (buffer.length / 1024).toFixed(1),
      extractedFields: extracted,
      parserEngine: engine
    });
  } catch (err) {
    addLog(`✗ Failed to save/parse resume: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// 3. Get Top Companies
app.get('/api/companies', (req, res) => {
  res.json({ topCompanies: TOP_TECH_COMPANIES });
});

// 4. Scrape Jobs (Supports Position & Role Filter + General Web Sourcing)
app.post('/api/scrape', async (req, res) => {
  let { companies, position, useTopCompanies = false, mode = 'general' } = req.body;
  
  const positionLabel = position && position.trim() ? `for position: "${position.trim()}"` : '(all positions)';

  try {
    let rawJobs = [];

    if (mode === 'custom' && Array.isArray(companies) && companies.length > 0) {
      addLog(`Starting custom job scrape across ${companies.length} specific companies ${positionLabel}`);
      rawJobs = await scrapeCompanies(companies, addLog);
    } else {
      addLog(`Starting high-volume general job scrape across global feeds & verified tech networks ${positionLabel}`);
      rawJobs = await scrapeGeneralWeb(addLog);
    }

    let matchedJobs = rawJobs;

    if (position && position.trim()) {
      // Split on commas or words (e.g. "Full Stack", "Software Engineer")
      const keywords = position.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
      matchedJobs = rawJobs.filter(job => {
        const title = String(job.title || '').toLowerCase();
        const dept = String(job.department || '').toLowerCase();
        return keywords.some(kw => {
          // Check substring or token matching
          if (title.includes(kw) || dept.includes(kw)) return true;
          const words = kw.split(/\s+/);
          return words.every(w => title.includes(w) || dept.includes(w));
        });
      });
      addLog(`✓ Filtered from ${rawJobs.length} total roles down to ${matchedJobs.length} matching "${position}"!`);
    } else {
      addLog(`Scraping finished. Total general roles found: ${rawJobs.length}`);
    }

    res.json({ 
      success: true, 
      count: matchedJobs.length, 
      totalScraped: rawJobs.length, 
      position: position || null,
      jobs: matchedJobs 
    });
  } catch (err) {
    addLog(`Scraping failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// 4. Trigger Auto-Apply (Single or Batch, Quick Apply vs Apply Externally)
app.post('/api/apply', async (req, res) => {
  const { jobs, dryRun = true, mode } = req.body;
  if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
    return res.status(400).json({ error: 'No jobs provided' });
  }

  if (isRunning) {
    return res.status(409).json({ error: 'An application run is already in progress' });
  }

  isRunning = true;
  stopRequested = false;
  addLog(`Starting application run on ${jobs.length} jobs (Dry-Run: ${dryRun}, Mode: ${mode || 'auto-detect'})...`);

  // Run in background so HTTP response returns immediately
  (async () => {
    const history = fs.existsSync(HISTORY_PATH) ? JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')) : [];

    for (let i = 0; i < jobs.length; i++) {
      if (stopRequested) {
        addLog(`🛑 Application batch stopped by user request at job ${i + 1}/${jobs.length}.`);
        break;
      }

      // Re-read profile on every iteration so edits & resume uploads are immediately reflected
      let currentProfile = {};
      try {
        if (fs.existsSync(PROFILE_PATH)) {
          currentProfile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
        }
      } catch (err) {
        addLog(`Warning: Failed to read profile: ${err.message}`);
      }

      const job = jobs[i];
      const jobMode = mode || (job.quickApply ? 'quick' : 'external');
      addLog(`\n[${i + 1}/${jobs.length}] [${jobMode === 'quick' ? '⚡ QUICK APPLY' : '↗ APPLY EXTERNALLY'}] ${job.title} at ${job.company}`);
      addLog(`  -> Applying as: ${currentProfile.fullName || currentProfile.firstName || 'Candidate'} (${currentProfile.email || 'No Email'})`);
      
      const result = await applyToJob(job.applyUrl, currentProfile, { dryRun, mode: jobMode, onLog: addLog });
      
      let statusStr = 'Failed';
      if (result.success) {
        if (jobMode === 'external') statusStr = 'Opened in Browser';
        else statusStr = dryRun ? 'Dry-Run Completed' : 'Quick Applied';
      }

      history.unshift({
        id: job.id,
        title: job.title,
        company: job.company,
        applyUrl: job.applyUrl,
        timestamp: new Date().toISOString(),
        dryRun,
        mode: jobMode,
        status: statusStr,
        screenshot: result.screenshot || null,
        confirmed: result.confirmed || false,
        error: result.error || null
      });

      fs.writeFileSync(HISTORY_PATH, JSON.stringify(history.slice(0, 500), null, 2), 'utf8');

      // 4-second breather between applications
      if (i < jobs.length - 1 && jobMode !== 'external') {
        addLog('Pausing 4s before next application...');
        for (let s = 0; s < 4; s++) {
          if (stopRequested) break;
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    addLog('\n=== APPLICATION RUN COMPLETED ===');
    isRunning = false;
    stopRequested = false;
  })().catch(err => {
    addLog(`Fatal batch error: ${err.message}`);
    isRunning = false;
    stopRequested = false;
  });

  res.json({ success: true, message: `Application run initiated on ${jobs.length} jobs.` });
});

// Stop Running Application Batch
app.post('/api/apply/stop', (req, res) => {
  if (!isRunning) {
    return res.json({ success: true, message: 'No run currently active.' });
  }
  stopRequested = true;
  addLog('User requested STOP of the active application batch.');
  res.json({ success: true, message: 'Stop signal sent.' });
});

// 5. Get Logs & State
app.get('/api/logs', (req, res) => {
  res.json({ isRunning, logs: liveLogs });
});

// 6. Clear Logs
app.post('/api/logs/clear', (req, res) => {
  liveLogs = [];
  res.json({ success: true });
});

// 7. Get History
app.get('/api/history', (req, res) => {
  try {
    const history = fs.existsSync(HISTORY_PATH) ? JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')) : [];
    res.json(history);
  } catch {
    res.json([]);
  }
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 AutoApply Dashboard running at: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});

