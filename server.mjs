import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrapeCompanies, TOP_TECH_COMPANIES } from './scraper.mjs';
import { applyToJob } from './auto-apply.mjs';

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

// In-memory state for UI log streaming
let liveLogs = [];
let isRunning = false;

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

// Upload & Store Resume
app.post('/api/upload-resume', (req, res) => {
  try {
    const { filename, data } = req.body;
    if (!data) return res.status(400).json({ error: 'No resume data received' });

    const buffer = Buffer.from(data, 'base64');
    fs.writeFileSync(STORED_RESUME_PATH, buffer);

    // Update profile.json with the stored resume path
    let profile = {};
    if (fs.existsSync(PROFILE_PATH)) {
      profile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
    }
    profile.resumePath = STORED_RESUME_PATH;
    profile.resumeFileName = filename || 'resume.pdf';
    fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2), 'utf8');

    addLog(`✓ Stored and activated resume: ${profile.resumeFileName} (${(buffer.length / 1024).toFixed(1)} KB)`);
    res.json({ success: true, filename: profile.resumeFileName, sizeKb: (buffer.length / 1024).toFixed(1) });
  } catch (err) {
    addLog(`✗ Failed to save resume: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// 3. Get Top Companies
app.get('/api/companies', (req, res) => {
  res.json({ topCompanies: TOP_TECH_COMPANIES });
});

// 4. Scrape Jobs (Supports Position & Role Filter)
app.post('/api/scrape', async (req, res) => {
  let { companies, position, useTopCompanies = false } = req.body;
  
  if (useTopCompanies || (!companies && !Array.isArray(companies))) {
    companies = TOP_TECH_COMPANIES.slice(0, 15);
  } else if (!Array.isArray(companies) || companies.length === 0) {
    return res.status(400).json({ error: 'Expected array of company slugs or useTopCompanies=true' });
  }

  const positionLabel = position && position.trim() ? `for position: "${position.trim()}"` : '(all positions)';
  addLog(`Starting job scrape across ${companies.length} companies ${positionLabel}`);
  
  try {
    const rawJobs = await scrapeCompanies(companies, addLog);
    let matchedJobs = rawJobs;

    if (position && position.trim()) {
      const keywords = position.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
      matchedJobs = rawJobs.filter(job => {
        const title = (job.title || '').toLowerCase();
        const dept = (job.department || '').toLowerCase();
        return keywords.some(kw => title.includes(kw) || dept.includes(kw));
      });
      addLog(`Filtered from ${rawJobs.length} total roles down to ${matchedJobs.length} matching "${position}"!`);
    } else {
      addLog(`Scraping finished. Total jobs found: ${rawJobs.length}`);
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

// 4. Trigger Auto-Apply (Single or Batch)
app.post('/api/apply', async (req, res) => {
  const { jobs, dryRun = true } = req.body;
  if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
    return res.status(400).json({ error: 'No jobs provided' });
  }

  if (isRunning) {
    return res.status(409).json({ error: 'An application run is already in progress' });
  }

  const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
  isRunning = true;
  addLog(`Starting Autopilot run on ${jobs.length} jobs (Dry-Run: ${dryRun})...`);

  // Run in background so HTTP response returns immediately
  (async () => {
    const history = fs.existsSync(HISTORY_PATH) ? JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')) : [];

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      addLog(`\n[${i + 1}/${jobs.length}] Processing: ${job.title} at ${job.company}`);
      
      const result = await applyToJob(job.applyUrl, profile, { dryRun, onLog: addLog });
      
      history.unshift({
        id: job.id,
        title: job.title,
        company: job.company,
        applyUrl: job.applyUrl,
        timestamp: new Date().toISOString(),
        dryRun,
        status: result.success ? (dryRun ? 'Dry-Run Completed' : 'Submitted') : 'Failed',
        error: result.error || null
      });

      fs.writeFileSync(HISTORY_PATH, JSON.stringify(history.slice(0, 500), null, 2), 'utf8');

      // 4-second breather between applications
      if (i < jobs.length - 1) {
        addLog('Pausing 4s before next application...');
        await new Promise(r => setTimeout(r, 4000));
      }
    }

    addLog('\n=== AUTOPILOT BATCH FINISHED ===');
    isRunning = false;
  })().catch(err => {
    addLog(`Fatal batch error: ${err.message}`);
    isRunning = false;
  });

  res.json({ success: true, message: `Autopilot initiated on ${jobs.length} jobs.` });
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

