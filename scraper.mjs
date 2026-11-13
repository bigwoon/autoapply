/**
 * Job Board Scrapers (Greenhouse, Lever, Ashby)
 * Direct ATS JSON ingestion - fast, clean, and never blocked by bot shields.
 */

export const TOP_TECH_COMPANIES = [
  'stripe', 'figma', 'discord', 'cloudflare', 'datadog',
  'coinbase', 'reddit', 'openai', 'anthropic', 'scale',
  'airbnb', 'uber', 'doordash', 'pinterest', 'instacart',
  'robinhood', 'square', 'dropbox', 'hubspot', 'gitlab',
  'postman', 'notion', 'ramp', 'brex', 'plaid'
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

  return data.jobs.map(job => ({
    id: `gh-${job.id}`,
    originalId: String(job.id),
    title: job.title,
    company: companySlug,
    location: job.location?.name || 'Remote/Unspecified',
    department: job.departments?.[0]?.name || 'General',
    applyUrl: job.absolute_url,
    ats: 'greenhouse',
    updatedAt: job.updated_at
  }));
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

  return data.map(job => ({
    id: `lv-${job.id}`,
    originalId: job.id,
    title: job.text,
    company: companySlug,
    location: job.categories?.location || 'Remote/Unspecified',
    department: job.categories?.team || job.categories?.department || 'General',
    applyUrl: job.applyUrl,
    ats: 'lever',
    createdAt: job.createdAt
  }));
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
    ats: 'ashby'
  }));
}

/**
 * Unified multi-company, multi-ATS scraper
 */
export async function scrapeCompanies(companies, onLog = console.log) {
  const allJobs = [];

  for (const company of companies) {
    const slug = company.trim().toLowerCase();
    if (!slug) continue;
    onLog(`[Scraper] Checking ${slug}...`);

    let found = false;
    // 1. Try Greenhouse
    try {
      const ghJobs = await scrapeGreenhouse(slug);
      if (ghJobs.length > 0) {
        onLog(`  ✓ Found ${ghJobs.length} jobs on Greenhouse for ${slug}`);
        allJobs.push(...ghJobs);
        found = true;
      }
    } catch {}

    // 2. Try Lever
    try {
      const lvJobs = await scrapeLever(slug);
      if (lvJobs.length > 0) {
        onLog(`  ✓ Found ${lvJobs.length} jobs on Lever for ${slug}`);
        allJobs.push(...lvJobs);
        found = true;
      }
    } catch {}

    // 3. Try Ashby
    try {
      const ashbyJobs = await scrapeAshby(slug);
      if (ashbyJobs.length > 0) {
        onLog(`  ✓ Found ${ashbyJobs.length} jobs on Ashby for ${slug}`);
        allJobs.push(...ashbyJobs);
        found = true;
      }
    } catch {}

    if (!found) {
      onLog(`  ℹ No open roles found for "${slug}" across Greenhouse, Lever, or Ashby.`);
    }
  }

  return allJobs;
}

