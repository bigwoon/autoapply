import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SESSIONS_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) {
  try { fs.mkdirSync(SESSIONS_DIR, { recursive: true }); } catch {}
}

export const SESSION_FILES = {
  dice: path.join(SESSIONS_DIR, 'dice-session.json'),
  ziprecruiter: path.join(SESSIONS_DIR, 'ziprecruiter-session.json'),
  indeed: path.join(SESSIONS_DIR, 'indeed-session.json')
};

/**
 * Checks the status of saved platform sessions
 */
export function getSessionStatus() {
  return {
    dice: {
      connected: fs.existsSync(SESSION_FILES.dice),
      updatedAt: fs.existsSync(SESSION_FILES.dice) ? fs.statSync(SESSION_FILES.dice).mtime.toISOString() : null
    },
    ziprecruiter: {
      connected: fs.existsSync(SESSION_FILES.ziprecruiter),
      updatedAt: fs.existsSync(SESSION_FILES.ziprecruiter) ? fs.statSync(SESSION_FILES.ziprecruiter).mtime.toISOString() : null
    },
    indeed: {
      connected: fs.existsSync(SESSION_FILES.indeed),
      updatedAt: fs.existsSync(SESSION_FILES.indeed) ? fs.statSync(SESSION_FILES.indeed).mtime.toISOString() : null
    }
  };
}

/**
 * Launches an interactive, visible browser window for the user to log in.
 * Once logged in, the storageState (cookies, localStorage, session tokens) is persisted.
 */
export async function launchLoginSession(platform = 'dice', onLog = console.log) {
  let url = 'https://www.dice.com/dashboard/login?redirectUrl=%2Fhome-feed';
  if (platform === 'ziprecruiter') {
    url = 'https://www.ziprecruiter.com/jobseeker/home';
  } else if (platform === 'indeed') {
    url = 'https://secure.indeed.com/account/login';
  }

  const sessionFile = SESSION_FILES[platform];
  onLog(`\n[Connect ${platform.toUpperCase()}] Opening real browser window for login...`);
  onLog(`  -> Please complete login (or Google sign-in) in the open browser.`);

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });

  let context;
  if (fs.existsSync(sessionFile)) {
    try {
      context = await browser.newContext({
        storageState: sessionFile,
        viewport: { width: 1280, height: 850 }
      });
    } catch {
      context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
    }
  } else {
    context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  }

  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => onLog(`Nav info: ${e.message}`));

  // Wait for the user to successfully reach the target authenticated dashboard
  // For Dice: /home-feed or /dashboard
  // For ZipRecruiter: /jobseeker/home or /candidate
  let connected = false;
  const startTime = Date.now();
  const MAX_WAIT_MS = 180000; // 3 minutes timeout

  while (Date.now() - startTime < MAX_WAIT_MS) {
    await page.waitForTimeout(2000);
    const currentUrl = page.url();

    if (platform === 'dice') {
      if (currentUrl.includes('/home-feed') || currentUrl.includes('/dashboard/jobs') || currentUrl.includes('/dashboard')) {
        connected = true;
        break;
      }
    } else if (platform === 'ziprecruiter') {
      if (currentUrl.includes('/jobseeker/home') || currentUrl.includes('/candidate/suggested') || currentUrl.includes('/jobseeker/')) {
        connected = true;
        break;
      }
    } else if (platform === 'indeed') {
      if ((currentUrl.includes('indeed.com') && !currentUrl.includes('/account/login') && !currentUrl.includes('/auth') && !currentUrl.includes('challenge')) || currentUrl.includes('indeed.com/m/')) {
        connected = true;
        break;
      }
    }

    // Check if user manually closed browser window
    if (browser.isConnected && browser.contexts().length === 0) {
      break;
    }
  }

  if (connected) {
    await context.storageState({ path: sessionFile });
    onLog(`  ✓ Successfully connected and saved ${platform.toUpperCase()} authentication session!`);
  } else {
    onLog(`  ⚠ Login was not completed or timed out.`);
  }

  await browser.close().catch(() => {});
  return { connected, platform };
}

/**
 * Scrapes fresh personalized jobs from Dice Home Feed using saved session
 */
export async function scrapeDiceHomeFeed(onLog = console.log) {
  const sessionFile = SESSION_FILES.dice;
  if (!fs.existsSync(sessionFile)) {
    onLog(`[Dice Feed] No active Dice session found. Connect Dice in the dashboard.`);
    return [];
  }

  onLog(`[Dice Feed] Fetching fresh live jobs from your personalized Dice Home Feed...`);
  try {
    const browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });

    const context = await browser.newContext({
      storageState: sessionFile,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();
    await page.goto('https://www.dice.com/home-feed', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const jobs = await page.evaluate(() => {
      const list = [];
      const seen = new Set();
      const links = Array.from(document.querySelectorAll('a'))
        .filter(a => a.href.includes('/job-detail/') && a.innerText.trim().length > 3);

      for (const a of links) {
        if (seen.has(a.href)) continue;
        seen.add(a.href);

        const card = a.closest('[data-testid="job-search-result-card"]') || a.closest('div.relative') || a.parentElement?.parentElement;
        const text = card ? card.innerText : '';
        const isEasy = /easy apply/i.test(text);

        const compLink = card?.querySelector('a[href*="/company-profile/"], [data-cy*="company"]');
        const company = compLink?.innerText?.trim() || 'Employer on Dice';

        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const locLine = lines.find(l => l.includes(',') && !l.includes('$') && (l.includes('Remote') || l.includes('Today') || l.includes('ago') || /[A-Z]{2}/.test(l)));

        list.push({
          id: `dice-feed-${a.href.split('/job-detail/')[1]?.split('?')[0] || Math.random().toString(36).substring(2, 8)}`,
          title: a.innerText.trim(),
          company,
          location: locLine ? locLine.replace(/•.*$/, '').trim() : 'United States',
          department: 'Engineering',
          applyUrl: a.href,
          quickApply: isEasy,
          applyType: isEasy ? 'quick' : 'external',
          source: 'Dice Home Feed (Live)',
          ats: 'dice'
        });
      }
      return list;
    });

    await browser.close();
    onLog(`[Dice Feed] Extracted ${jobs.length} fresh roles directly from your personalized feed!`);
    return jobs;
  } catch (err) {
    onLog(`[Dice Feed] Skipped: ${err.message}`);
    return [];
  }
}

/**
 * Scrapes fresh personalized jobs from ZipRecruiter Jobseeker Home using saved session
 */
export async function scrapeZipRecruiterHomeFeed(onLog = console.log) {
  const sessionFile = SESSION_FILES.ziprecruiter;
  if (!fs.existsSync(sessionFile)) {
    onLog(`[ZipRecruiter Feed] No active ZipRecruiter session found. Connect ZipRecruiter in dashboard.`);
    return [];
  }

  onLog(`[ZipRecruiter Feed] Fetching fresh live jobs from your personalized ZipRecruiter Home Feed...`);
  try {
    const browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });

    const context = await browser.newContext({
      storageState: sessionFile,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();
    await page.goto('https://www.ziprecruiter.com/jobseeker/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const jobs = await page.evaluate(() => {
      const list = [];
      const seen = new Set();
      // Look for job cards in ZipRecruiter Jobseeker feed
      const links = Array.from(document.querySelectorAll('a[href*="/jobs/"], a[href*="/c/"], a[data-job-id]'));

      for (const a of links) {
        const title = a.innerText.trim();
        if (!title || title.length < 3 || seen.has(a.href)) continue;
        if (a.href.includes('/jobseeker/home') || a.href.includes('/account')) continue;
        seen.add(a.href);

        const card = a.closest('.job_result') || a.closest('article') || a.closest('div.relative') || a.parentElement?.parentElement;
        const text = card ? card.innerText : '';
        const is1Click = /1-click apply|quick apply|easy apply/i.test(text);

        const compEl = card?.querySelector('.company_name, [data-testid="company-name"]');
        const locEl = card?.querySelector('.location, [data-testid="location"]');

        list.push({
          id: `zr-${Math.random().toString(36).substring(2, 9)}`,
          title,
          company: compEl ? compEl.innerText.trim() : 'Company on ZipRecruiter',
          location: locEl ? locEl.innerText.trim() : 'Remote / Cypress, TX',
          department: 'Engineering',
          applyUrl: a.href,
          quickApply: is1Click,
          applyType: is1Click ? 'quick' : 'external',
          source: 'ZipRecruiter Feed (Live)',
          ats: 'ziprecruiter'
        });
      }
      return list;
    });

    await browser.close();
    onLog(`[ZipRecruiter Feed] Extracted ${jobs.length} fresh roles directly from your personalized feed!`);
    return jobs;
  } catch (err) {
    onLog(`[ZipRecruiter Feed] Skipped: ${err.message}`);
    return [];
  }
}

