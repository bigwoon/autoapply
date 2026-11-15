import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

/**
 * Extracts raw text from a PDF Buffer
 */
export async function extractTextFromPdf(pdfBuffer) {
  try {
    const parser = new PDFParse({ data: pdfBuffer });
    await parser.load();
    const result = await parser.getText();
    await parser.destroy();
    if (typeof result === 'string') return result;
    if (result && typeof result.text === 'string') return result.text;
    if (Array.isArray(result?.pages)) {
      return result.pages.map(p => p.text || '').join('\n');
    }
    return '';
  } catch (err) {
    console.error('[Resume Parser] Failed to extract text from PDF:', err.message);
    return '';
  }
}

// =====================================================================
// ENGINE A: Local Regex/NLP Parser (always runs, no API key needed)
// =====================================================================

/**
 * Parses raw resume text into structured profile fields using regex heuristics
 */
export function parseResumeText(rawText) {
  if (!rawText || typeof rawText !== 'string') return {};

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const result = {};

  // 1. Email
  const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) result.email = emailMatch[0].trim();

  // 2. Phone Number
  const phoneMatch = rawText.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  if (phoneMatch) result.phone = phoneMatch[0].trim();

  // 3. LinkedIn
  const linkedinMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)/i);
  if (linkedinMatch) {
    result.linkedin = linkedinMatch[0].startsWith('http') ? linkedinMatch[0] : `https://${linkedinMatch[0]}`;
  }

  // 4. GitHub
  const githubMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)/i);
  if (githubMatch) {
    result.github = githubMatch[0].startsWith('http') ? githubMatch[0] : `https://${githubMatch[0]}`;
  }

  // 5. Portfolio / Personal Website
  const urlMatches = rawText.matchAll(/(https?:\/\/[^\s,|]+)/gi);
  for (const match of urlMatches) {
    const url = match[0];
    if (!/linkedin|github|twitter|facebook|instagram/i.test(url)) {
      result.portfolio = url;
      break;
    }
  }

  // 6. Name (strip honorifics like Dr., Mr., Ms.)
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    let line = lines[i];
    // Strip common honorifics
    line = line.replace(/^(Dr\.?|Mr\.?|Ms\.?|Mrs\.?|Prof\.?)\s+/i, '').trim();
    if (/^[A-Za-zÀ-ÿ\s.-]{3,40}$/.test(line) && !/resume|curriculum|vitae|page|developer|engineer|manager|staff|senior|lead/i.test(line)) {
      const parts = line.split(/\s+/).filter(Boolean);
      if (parts.length >= 2 && parts.length <= 4) {
        // Normalize ALL CAPS to Title Case
        const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
        const isAllCaps = parts.every(p => p === p.toUpperCase() && p.length > 1);
        if (isAllCaps) {
          result.fullName = parts.map(titleCase).join(' ');
          result.firstName = titleCase(parts[0]);
          result.lastName = parts.slice(1).map(titleCase).join(' ');
        } else {
          result.fullName = parts.join(' ');
          result.firstName = parts[0];
          result.lastName = parts.slice(1).join(' ');
        }
        break;
      }
    }
  }

  // 7. Location (City, State)
  const locationMatch = rawText.match(/\b([A-Z][a-zA-Z ]{2,30}),\s*([A-Z]{2})\b/);
  if (locationMatch) {
    result.currentLocation = `${locationMatch[1].trim()}, ${locationMatch[2]}`;
  }

  // 8. Summary / Objective
  const summaryMatch = rawText.match(/(?:Summary|Professional Summary|About Me|Objective|Profile)[:\s]+([^]{50,500}?)(?:\n\s*(?:TECHNICAL|SKILLS|EXPERIENCE|WORK|EDUCATION|PROJECTS)[:\s]|\n\n)/i);
  if (summaryMatch) {
    result.coverLetter = summaryMatch[1].replace(/\s+/g, ' ').trim();
  }

  // 9. Years of Experience
  const yoeMatch = rawText.match(/(\d+)\+?\s*years?(?:\s*of)?\s*(?:experience|building|engineering|working)/i);
  if (yoeMatch) {
    result.yearsOfExperience = yoeMatch[1];
  }

  // 10. Education
  const eduPatterns = [
    /(?:B\.?S\.?|B\.?A\.?|Bachelor|M\.?S\.?|M\.?A\.?|Master|MBA|Ph\.?D\.?|Doctor)\s*(?:(?:of|in)\s+[A-Za-z\s,]+)?[-–—]?\s*([A-Za-z\s]+(?:University|College|Institute|School|Berkeley|Stanford|MIT|UCLA|Harvard|NYU|CMU|Georgia Tech|Caltech)[A-Za-z\s]*)/i,
    /(?:University|College|Institute)\s+of\s+[A-Za-z\s]+/i
  ];
  for (const pattern of eduPatterns) {
    const eduMatch = rawText.match(pattern);
    if (eduMatch) {
      result.educationSchool = (eduMatch[1] || eduMatch[0]).trim().replace(/\s*[-–—]\s*$/, '');
      break;
    }
  }

  // 11. Degree type
  const degreeMatch = rawText.match(/(Ph\.?D\.?|Master(?:'s)?|MBA|M\.?S\.?|M\.?A\.?|Bachelor(?:'s)?|B\.?S\.?|B\.?A\.?)\s*(?:(?:of|in)\s+([A-Za-z\s,]+?)(?:\s*[-–—]|\s*\n|\s*\())/i);
  if (degreeMatch) {
    result.degree = degreeMatch[1];
    if (degreeMatch[2]) result.major = degreeMatch[2].trim();
  }

  // 12. Technical Skills
  const COMMON_SKILLS = [
    'JavaScript', 'TypeScript', 'Python', 'Java', 'C\\+\\+', 'C#', 'Go', 'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'Scala', 'R',
    'React', 'Node\\.js', 'Next\\.js', 'Vue', 'Angular', 'Svelte', 'Express', 'Django', 'Flask', 'FastAPI', 'Spring Boot', 'GraphQL', 'REST',
    'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'DynamoDB', 'SQLite', 'BigQuery', 'Elasticsearch',
    'Docker', 'Kubernetes', 'Terraform', 'AWS', 'GCP', 'Azure', 'Git', 'CI\\/CD', 'Jenkins', 'GitHub Actions',
    'Kafka', 'Spark', 'Hadoop',
    'PyTorch', 'TensorFlow', 'scikit-learn',
    'Figma', 'Tableau', 'Power BI'
  ];
  const matchedSkills = [];
  for (const skill of COMMON_SKILLS) {
    if (new RegExp(`\\b${skill}\\b`, 'i').test(rawText)) {
      // Store the clean display name (un-escaped)
      matchedSkills.push(skill.replace(/\\\+/g, '+').replace(/\\\./g, '.').replace(/\\\//g, '/'));
    }
  }
  if (matchedSkills.length > 0) {
    result.skills = matchedSkills;
  }

  // 13. Work experience entries (company + title pairs)
  const workEntries = [];
  const workPattern = /^(.+?)\s*[-–—@|]\s*(.+?)\s*(?:\(|\||[-–—])\s*(\d{4})\s*[-–—]\s*(Present|\d{4})/gmi;
  let workMatch;
  while ((workMatch = workPattern.exec(rawText)) !== null) {
    workEntries.push({
      title: workMatch[1].trim(),
      company: workMatch[2].trim(),
      startYear: workMatch[3],
      endYear: workMatch[4]
    });
  }
  if (workEntries.length > 0) {
    result.workExperience = workEntries;
  }

  return result;
}

// =====================================================================
// ENGINE B: AI-Powered Deep Parser (free Gemini API)
// =====================================================================

const RESUME_SCHEMA = {
  firstName: 'string',
  lastName: 'string',
  fullName: 'string',
  email: 'string',
  phone: 'string',
  currentLocation: 'string (City, State format)',
  linkedin: 'string (full URL)',
  github: 'string (full URL)',
  portfolio: 'string (full URL)',
  yearsOfExperience: 'string (number only)',
  coverLetter: 'string (2-3 sentence professional summary)',
  workAuthorization: 'string (Yes/No if mentioned, empty if not)',
  needsSponsorship: 'string (Yes/No if mentioned, empty if not)',
  salaryExpectation: 'string (number only if mentioned)',
  degree: 'string (e.g., B.S., M.S., Ph.D., MBA)',
  major: 'string (field of study)',
  educationSchool: 'string (university name)',
  graduationYear: 'string',
  skills: 'string[] (array of technical skills, tools, and frameworks)',
  workExperience: 'array of { title, company, startYear, endYear, bullets: string[] }'
};

/**
 * Uses Google Gemini API (free tier) to parse resume text into structured JSON
 */
export async function parseResumeWithAI(rawText, apiKey) {
  if (!apiKey || !rawText) return null;

  const prompt = `You are a professional resume parser used by job application platforms like Handshake, Simplify, and Sonara.

Extract ALL structured information from the following resume text into a JSON object.

Required JSON schema:
${JSON.stringify(RESUME_SCHEMA, null, 2)}

Rules:
- Return ONLY valid JSON, no markdown fences, no explanations.
- For workExperience, extract each position with company, title, years, and bullet point accomplishments.
- For skills, extract every technical skill, programming language, framework, tool, and platform mentioned.
- Normalize phone numbers to a standard format.
- If a field is not found in the resume, use an empty string "" or empty array [].
- For coverLetter, use the professional summary or about section. If none exists, write a 2-sentence professional summary based on the resume content.

Resume text:
---
${rawText.slice(0, 8000)}
---

JSON output:`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[AI Parser] Gemini API error ${res.status}:`, errBody);
      return null;
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    // Strip markdown fences if present
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('[AI Parser] Failed:', err.message);
    return null;
  }
}

/**
 * Combined parser: tries AI first (if key available), falls back to local regex
 */
export async function parseResumeSmart(rawText, aiApiKey) {
  // Always run local parser as baseline
  const localResult = parseResumeText(rawText);

  // If AI key is available, run AI parser and merge (AI takes priority)
  if (aiApiKey) {
    console.log('[Resume Parser] AI key detected — running Gemini deep parse...');
    const aiResult = await parseResumeWithAI(rawText, aiApiKey);
    if (aiResult) {
      console.log('[Resume Parser] ✓ AI parse successful. Merging with local extraction.');
      // Merge: AI result takes priority, but keep local values where AI returned empty
      const merged = { ...localResult };
      for (const [key, val] of Object.entries(aiResult)) {
        if (val && (typeof val === 'string' ? val.trim() : (Array.isArray(val) ? val.length > 0 : true))) {
          merged[key] = val;
        }
      }
      merged._parserEngine = 'gemini-ai';
      return merged;
    }
    console.log('[Resume Parser] AI parse failed or returned empty. Using local parser.');
  }

  localResult._parserEngine = 'local-regex';
  return localResult;
}
