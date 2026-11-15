/**
 * Job Board Scrapers (Greenhouse, Lever, Ashby)
 * Direct ATS JSON ingestion - fast, clean, and never blocked by bot shields.
 */

export const TOP_TECH_COMPANIES = [
  // AI & Frontier Tech
  'openai', 'anthropic', 'scaleai', 'cohere', 'huggingface', 'perplexity',
  // Fintech & Payments
  'stripe', 'coinbase', 'robinhood', 'ramp', 'brex', 'plaid', 'affirm', 'chime', 'klaviyo', 'gusto', 'toast', 'square',
  // Cloud, Infrastructure & DevTools
  'cloudflare', 'datadog', 'gitlab', 'notion', 'figma', 'discord', 'postman', 'elastic', 'mongodb', 'snowflake', 'databricks', 'vercel', 'supabase', 'retool',
  // Consumer Tech & SaaS
  'reddit', 'pinterest', 'dropbox', 'hubspot', 'asana', 'box', 'okta', 'duolingo', 'samsara', 'instacart', 'doordash', 'uber', 'airbnb', 'roblox', 'spotify', 'canva', 'webflow', 'airtable', 'intercom'
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
    const applyUrl = job.absolute_url || '';
    const isExternal = /myworkdayjobs|taleo|icims|successfactors|brassring/i.test(applyUrl);
    return {
      id: `gh-${job.id}`,
      originalId: String(job.id),
      title: job.title,
      company: companySlug,
      location: job.location?.name || 'Remote/Unspecified',
      department: job.departments?.[0]?.name || 'General',
      applyUrl,
      ats: 'greenhouse',
      quickApply: !isExternal,
      applyType: isExternal ? 'external' : 'quick',
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
  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data.map(job => {
    const applyUrl = job.applyUrl || '';
    const isExternal = /myworkdayjobs|taleo|icims|successfactors|brassring/i.test(applyUrl);
    return {
      id: `lv-${job.id}`,
      originalId: job.id,
      title: job.text,
      company: companySlug,
      location: job.categories?.location || 'Remote/Unspecified',
      department: job.categories?.team || job.categories?.department || 'General',
      applyUrl,
      ats: 'lever',
      quickApply: !isExternal,
      applyType: isExternal ? 'external' : 'quick',
      createdAt: job.createdAt
    };
  });
}

/**
 * Scrape Ashby jobs for a given company slug
 */
export async function scrapeAshby(companySlug) {
  const url = `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0'
    },
    body: JSON.stringify({
      operationName: 'ApiJobBoardWithTeams',
      variables: { organizationHostedJobsPageName: companySlug },
      query: `query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
        jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) {
          jobPostings {
            id
            title
            locationName
            departmentName
          }
        }
      }`
    })
  });

  if (!res.ok) return [];
  const data = await res.json();
  const postings = data?.data?.jobBoard?.jobPostings;
  if (!Array.isArray(postings)) return [];

  return postings.map(job => ({
    id: `ashby-${job.id}`,
    originalId: job.id,
    title: job.title,
    company: companySlug,
    location: job.locationName || 'Remote/Unspecified',
    department: job.departmentName || 'General',
    applyUrl: `https://jobs.ashbyhq.com/${companySlug}/${job.id}/application`,
    ats: 'ashby',
    quickApply: true,
    applyType: 'quick'
  }));
}

/**
 * Unified multi-company, multi-ATS scraper with parallel concurrency pooling
 */
export async function scrapeCompanies(companies, onLog = console.log) {
  const allJobs = [];
  const slugs = [...new Set(companies.map(c => c.trim().toLowerCase()).filter(Boolean))];

  onLog(`[Scraper] Initiating parallel scan across ${slugs.length} company boards...`);

  // Run in chunks of 8 concurrent requests for optimal speed without network saturation
  const CHUNK_SIZE = 8;
  for (let i = 0; i < slugs.length; i += CHUNK_SIZE) {
    const chunk = slugs.slice(i, i + CHUNK_SIZE);

    const chunkPromises = chunk.map(async slug => {
      const companyJobs = [];
      // 1. Try Greenhouse
      try {
        const gh = await scrapeGreenhouse(slug);
        if (gh.length > 0) companyJobs.push(...gh);
      } catch {}

      // 2. Try Lever
      try {
        const lv = await scrapeLever(slug);
        if (lv.length > 0) companyJobs.push(...lv);
      } catch {}

      // 3. Try Ashby
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

