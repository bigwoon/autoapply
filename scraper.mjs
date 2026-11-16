import { chromium } from 'playwright';

/**
 * Job Board Scrapers (Greenhouse, Lever, Ashby, Jobicy, RemoteOK, Arbeitnow, Dice)
 * Sources from direct ATS APIs + general global open job feeds + Dice tech board.
 */

export const TOP_TECH_COMPANIES = [
  // Big Tech & Cloud / SaaS Giants
  'stripe', 'airbnb', 'dropbox', 'pinterest', 'figma', 'gitlab', 'affirm', 'gusto', 'databricks',
  'coinbase', 'robinhood', 'datadog', 'samsara', 'lyft', 'brex', 'elastic', 'palantir', 'spotify',
  'linear', 'ramp', 'sentry', 'replit', 'cursor', 'discord', 'notion', 'canva', 'doordash', 'instacart',
  'hubspot', 'cloudflare', 'mongodb', 'snowflake', 'vercel', 'supabase', 'retool', 'reddit', 'box',
  'okta', 'duolingo', 'roblox', 'webflow', 'airtable', 'intercom', 'openai', 'anthropic', 'scaleai',
  'cohere', 'huggingface', 'perplexity', 'chime', 'klaviyo', 'toast', 'square', 'postman', 'automattic',
  'coursera', 'twitch', 'canonical', 'deel', 'synthesia', 'sourcegraph', 'glean', 'anduril', 'plaid',
  'benchling', 'carta', 'checkr', 'flexport', 'gemini', 'monzo', 'nuro', 'opendoor', 'rippling',
  'rubrik', 'servicetitan', 'snap', 'sofi', 'tanium', 'verkada', 'zapier'
];

/**
 * Scrape Greenhouse jobs for a given company slug
 */
export async function scrapeGreenhouse(companySlug) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${companySlug}/jobs?content=true`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Greenhouse API error ${res.status}`);
  }
  const data = await res.json();
  if (!data.jobs) return [];

  return data.jobs.map(job => {
    const directFormUrl = `https://boards.greenhouse.io/embed/job_app?for=${companySlug}&token=${job.id}`;
    const rawUrl = job.absolute_url || directFormUrl;
    const isExternal = /myworkdayjobs|taleo|icims|successfactors|brassring/i.test(rawUrl);
    
    return {
      id: `gh-${job.id}`,
      originalId: String(job.id),
      title: job.title,
      company: companySlug,
      location: job.location?.name || 'Remote/Unspecified',
      department: job.departments?.[0]?.name || 'General',
      applyUrl: isExternal ? rawUrl : directFormUrl,
      externalUrl: rawUrl,
      ats: 'greenhouse',
      quickApply: !isExternal,
      applyType: isExternal ? 'external' : 'quick',
      source: 'Greenhouse ATS',
      updatedAt: job.updated_at
    };
  });
}

/**
 * Scrape Lever jobs for a given company slug
 */
export async function scrapeLever(companySlug) {
  const url = `https://api.lever.co/v0/postings/${companySlug}?mode=json`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Lever API error ${res.status}`);
  }
  const jobs = await res.json();
  if (!Array.isArray(jobs)) return [];

  return jobs.map(job => {
    const directApplyUrl = job.applyUrl || `${job.hostedUrl}/apply`;
    return {
      id: `lv-${job.id}`,
      originalId: job.id,
      title: job.text,
      company: companySlug,
      location: job.categories?.location || 'Remote/Unspecified',
      department: job.categories?.team || job.categories?.department || 'General',
      applyUrl: directApplyUrl,
      externalUrl: job.hostedUrl,
      ats: 'lever',
      quickApply: true,
      applyType: 'quick',
      source: 'Lever ATS',
      updatedAt: new Date(job.createdAt).toISOString()
    };
  });
}

/**
 * Scrape Ashby jobs for a given company slug
 */
export async function scrapeAshby(companySlug) {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${companySlug}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Ashby API error ${res.status}`);
  }
  const data = await res.json();
  if (!data.jobs || !Array.isArray(data.jobs)) return [];

  return data.jobs.map(job => ({
    id: `ashby-${job.id}`,
    originalId: job.id,
    title: job.title,
    company: companySlug,
    location: job.locationName || 'Remote/Unspecified',
    department: job.departmentName || 'General',
    applyUrl: `https://jobs.ashbyhq.com/${companySlug}/${job.id}/application`,
    ats: 'ashby',
    quickApply: true,
    applyType: 'quick',
    source: 'Ashby ATS'
  }));
}

/**
 * Global Open Feed 1: Jobicy (Aggregates tech roles from across hundreds of startups & companies)
 */
export async function scrapeJobicy(onLog = console.log) {
  try {
    const res = await fetch('https://jobicy.com/api/v2/remote-jobs?count=100', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.jobs || !Array.isArray(data.jobs)) return [];

    return data.jobs.map(j => ({
      id: `jobicy-${j.id}`,
      originalId: String(j.id),
      title: j.jobTitle,
      company: j.companyName || 'Tech Employer',
      location: j.jobGeo || 'Remote',
      department: j.jobIndustry || 'Engineering',
      applyUrl: j.url,
      ats: 'jobicy',
      quickApply: false,
      applyType: 'external',
      source: 'Global Web (Jobicy)',
      updatedAt: j.pubDate
    }));
  } catch (err) {
    onLog(`[Feed] Jobicy feed skipped: ${err.message}`);
    return [];
  }
}

/**
 * Global Open Feed 2: RemoteOK (Live jobs from tech startups worldwide)
 */
export async function scrapeRemoteOK(onLog = console.log) {
  try {
    const res = await fetch('https://remoteok.com/api', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data.slice(1).map(j => ({
      id: `rok-${j.id}`,
      originalId: String(j.id),
      title: j.position,
      company: j.company || 'Tech Company',
      location: j.location || 'Remote',
      department: (j.tags || []).slice(0, 3).join(', ') || 'Software',
      applyUrl: j.apply_url || j.url,
      ats: 'remoteok',
      quickApply: false,
      applyType: 'external',
      source: 'Global Web (RemoteOK)',
      updatedAt: j.date
    }));
  } catch (err) {
    onLog(`[Feed] RemoteOK feed skipped: ${err.message}`);
    return [];
  }
}

/**
 * Global Open Feed 3: Arbeitnow (Active engineering and developer postings)
 */
export async function scrapeArbeitnow(onLog = console.log) {
  try {
    const res = await fetch('https://www.arbeitnow.com/api/job-board-api', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.data || !Array.isArray(data.data)) return [];

    return data.data.map(j => ({
      id: `abn-${j.slug}`,
      originalId: j.slug,
      title: j.title,
      company: j.company_name || 'Employer',
      location: j.location || (j.remote ? 'Remote' : 'Unspecified'),
      department: (j.tags || []).slice(0, 3).join(', ') || 'Software',
      applyUrl: j.url,
      ats: 'arbeitnow',
      quickApply: false,
      applyType: 'external',
      source: 'Global Web (Arbeitnow)',
      updatedAt: new Date(j.created_at * 1000).toISOString()
    }));
  } catch (err) {
    onLog(`[Feed] Arbeitnow feed skipped: ${err.message}`);
    return [];
  }
}

/**
 * Major Tech Board 4: Dice (Live Software & Tech Postings)
 */
export async function scrapeDice(keyword = 'Software Engineer', onLog = console.log) {
  try {
    onLog(`[Dice Scraper] Querying live Dice postings for "${keyword}"...`);
    const browser = await chromium.launch({ 
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });
    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    });
    
    const searchUrl = `https://www.dice.com/jobs?q=${encodeURIComponent(keyword)}&countryCode=US`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(2500);

    const jobs = await page.evaluate(() => {
      const results = [];
      const seenUrls = new Set();
      const titleLinks = Array.from(document.querySelectorAll('a'))
        .filter(a => a.href.includes('/job-detail/') && a.innerText.trim().length > 3);

      for (const a of titleLinks) {
        if (seenUrls.has(a.href)) continue;
        seenUrls.add(a.href);

        const title = a.innerText.trim();
        const card = a.closest('[data-testid="job-search-result-card"]') || a.closest('div.relative') || a.parentElement?.parentElement;
        
        let company = 'Company on Dice';
        let location = 'United States';
        let quickApply = false;

        if (card) {
          const text = card.innerText;
          quickApply = /easy apply/i.test(text);

          const compLink = card.querySelector('a[href*="/company-profile/"], [data-cy*="company"]');
          if (compLink && compLink.innerText.trim()) {
            company = compLink.innerText.trim();
          }

          const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
          const locLine = lines.find(l => l.includes(',') && !l.includes('$') && (l.includes('Remote') || l.includes('Today') || l.includes('ago') || /[A-Z]{2}/.test(l)));
          if (locLine) location = locLine.replace(/•.*$/, '').trim();
        }

        results.push({
          id: `dice-${a.href.split('/job-detail/')[1]?.split('?')[0] || Math.random().toString(36).substring(2, 8)}`,
          title,
          company,
          location,
          department: 'Engineering',
          applyUrl: a.href,
          quickApply,
          applyType: quickApply ? 'quick' : 'external',
          source: 'Dice Tech Board',
          ats: 'dice'
        });
      }
      return results;
    });

    await browser.close();
    onLog(`[Dice Scraper] Found ${jobs.length} roles from Dice!`);
    return jobs;
  } catch (err) {
    onLog(`[Dice Scraper] Skipped: ${err.message}`);
    return [];
  }
}

/**
 * Unified multi-company, multi-ATS and global web scraper
 */
export async function scrapeCompanies(companies, onLog = console.log) {
  const allJobs = [];
  const slugs = [...new Set(companies.map(c => c.trim().toLowerCase()).filter(Boolean))];

  onLog(`[Scraper] Initiating parallel scan across ${slugs.length} company boards...`);

  // Run in chunks of 10 concurrent requests
  const CHUNK_SIZE = 10;
  for (let i = 0; i < slugs.length; i += CHUNK_SIZE) {
    const chunk = slugs.slice(i, i + CHUNK_SIZE);

    const chunkPromises = chunk.map(async slug => {
      const companyJobs = [];
      try {
        const gh = await scrapeGreenhouse(slug);
        if (gh.length > 0) companyJobs.push(...gh);
      } catch {}

      try {
        const lv = await scrapeLever(slug);
        if (lv.length > 0) companyJobs.push(...lv);
      } catch {}

      try {
        const ashby = await scrapeAshby(slug);
        if (ashby.length > 0) companyJobs.push(...ashby);
      } catch {}

      return { slug, jobs: companyJobs };
    });

    const results = await Promise.allSettled(chunkPromises);
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.jobs.length > 0) {
        allJobs.push(...r.value.jobs);
        onLog(`  ✓ ${r.value.slug}: Found ${r.value.jobs.length} roles`);
      }
    }
  }

  return allJobs;
}

/**
 * General Web + Global Scraper:
 * Scrapes across Dice + global open feeds PLUS top high-volume ATS boards for massive coverage
 */
export async function scrapeGeneralWeb(keyword = 'Software Engineer', onLog = console.log) {
  onLog(`[General Web Scraper] Sourcing tech positions across Dice, web feeds & 50+ ATS networks for "${keyword}"...`);
  
  const [atsJobs, diceJobs, jobicyJobs, remoteokJobs, arbeitnowJobs] = await Promise.all([
    scrapeCompanies(TOP_TECH_COMPANIES.slice(0, 45), onLog),
    scrapeDice(keyword, onLog),
    scrapeJobicy(onLog),
    scrapeRemoteOK(onLog),
    scrapeArbeitnow(onLog)
  ]);

  onLog(`  -> ATS Boards: Found ${atsJobs.length} roles`);
  onLog(`  -> Dice Board: Found ${diceJobs.length} roles`);
  onLog(`  -> Jobicy Feed: Found ${jobicyJobs.length} roles`);
  onLog(`  -> RemoteOK Feed: Found ${remoteokJobs.length} roles`);
  onLog(`  -> Arbeitnow Feed: Found ${arbeitnowJobs.length} roles`);

  const combined = [...atsJobs, ...diceJobs, ...jobicyJobs, ...remoteokJobs, ...arbeitnowJobs];
  onLog(`[General Web Scraper] Aggregated ${combined.length} total live opportunities!`);
  return combined;
}
