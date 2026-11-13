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

/**
 * Parses raw resume text into structured profile fields
 */
export function parseResumeText(rawText) {
  if (!rawText || typeof rawText !== 'string') return {};

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const result = {};

  // 1. Email Extraction
  const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) result.email = emailMatch[0].trim();

  // 2. Phone Number Extraction
  const phoneMatch = rawText.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  if (phoneMatch) result.phone = phoneMatch[0].trim();

  // 3. LinkedIn URL
  const linkedinMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)/i);
  if (linkedinMatch) {
    result.linkedin = linkedinMatch[0].startsWith('http') ? linkedinMatch[0] : `https://${linkedinMatch[0]}`;
  }

  // 4. GitHub URL
  const githubMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)/i);
  if (githubMatch) {
    result.github = githubMatch[0].startsWith('http') ? githubMatch[0] : `https://${githubMatch[0]}`;
  }

  // 5. Portfolio / Personal Website
  const urlMatches = rawText.matchAll(/(https?:\/\/[^\s]+)/gi);
  for (const match of urlMatches) {
    const url = match[0];
    if (!/linkedin|github|twitter|facebook|instagram/i.test(url)) {
      result.portfolio = url;
      break;
    }
  }

  // 6. Name Extraction (Almost always the first 1-3 lines before contact details)
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i];
    // Candidate name is usually 2-4 words, contains letters, no emails, no URLs, no digits
    if (/^[A-Za-zÀ-ÿ\s.-]{3,35}$/.test(line) && !/resume|curriculum|vitae|page|developer|engineer/i.test(line)) {
      const parts = line.split(/\s+/).filter(Boolean);
      if (parts.length >= 2 && parts.length <= 4) {
        result.fullName = line;
        result.firstName = parts[0];
        result.lastName = parts.slice(1).join(' ');
        break;
      }
    }
  }

  // 7. Location (City, State)
  const locationMatch = rawText.match(/\b([A-Z][a-zA-Z\s]+),\s*([A-Z]{2})\b/);
  if (locationMatch) {
    result.currentLocation = `${locationMatch[1].trim()}, ${locationMatch[2]}`;
  }

  // 8. Summary / Objective
  const summaryMatch = rawText.match(/(?:Summary|Professional Summary|About Me|Objective|Profile)[:\s]+([^]{50,450}?)(?:\n\s*[A-Z\s]{4,}|\n\n)/i);
  if (summaryMatch) {
    result.coverLetter = summaryMatch[1].replace(/\s+/g, ' ').trim();
  }

  return result;
}
