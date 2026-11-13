import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Builds field matching regex rules based on the user's profile
 */
function buildFieldRules(profile) {
  return [
    { match: /first.*name/i, value: profile.firstName },
    { match: /last.*name/i, value: profile.lastName },
    { match: /full.*name|^name$/i, value: profile.fullName || `${profile.firstName} ${profile.lastName}` },
    { match: /email/i, value: profile.email },
    { match: /phone|mobile|tel/i, value: profile.phone },
    { match: /location|city|address/i, value: profile.currentLocation },
    { match: /linkedin/i, value: profile.linkedin },
    { match: /github/i, value: profile.github },
    { match: /portfolio|website|url/i, value: profile.portfolio },
    { match: /salary|compensation|expected/i, value: profile.salaryExpectation },
    { match: /years.*experience/i, value: profile.yearsOfExperience },
    { match: /notice.*period/i, value: profile.noticePeriod },
    { match: /cover.*letter|summary|about.*yourself/i, value: profile.coverLetter }
  ];
}

/**
 * Applies to a single job application URL using Playwright
 */
export async function applyToJob(applyUrl, profile, options = { dryRun: true, onLog: console.log }) {
  const onLog = options.onLog || console.log;
  onLog(`\n[Auto-Apply] Launching browser for: ${applyUrl}`);
  
  const rules = buildFieldRules(profile);
  const browser = await chromium.launch({
    headless: false, // User can see the browser action
    args: ['--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();
  
  try {
    onLog(`  -> Navigating to page...`);
    await page.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500); // Allow React/dynamic forms to mount

    // 1. Text Inputs and Textareas
    const textInputs = await page.$$('input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input:not([type]), textarea');
    onLog(`  -> Found ${textInputs.length} text/textarea fields`);

    for (const input of textInputs) {
      try {
        const isVisible = await input.isVisible();
        if (!isVisible) continue;

        const id = (await input.getAttribute('id')) || '';
        const name = (await input.getAttribute('name')) || '';
        const placeholder = (await input.getAttribute('placeholder')) || '';
        const ariaLabel = (await input.getAttribute('aria-label')) || '';
        const labelText = await page.evaluate(el => {
          const lbl = el.closest('label') || document.querySelector(`label[for="${el.id}"]`);
          return lbl ? lbl.innerText : '';
        }, input);

        const descriptor = `${id} ${name} ${placeholder} ${ariaLabel} ${labelText}`.toLowerCase();

        for (const rule of rules) {
          if (rule.value && rule.match.test(descriptor)) {
            const currentVal = await input.inputValue();
            if (!currentVal) {
              await input.scrollIntoViewIfNeeded();
              await input.click();
              await input.fill(rule.value);
              // Dispatch events for React/Angular/Vue
              await page.evaluate(el => {
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              }, input);
              onLog(`    ✓ Filled [${name || id || placeholder || 'field'}]: "${rule.value}"`);
            }
            break;
          }
        }
      } catch (err) {
        // Individual field filling non-fatal error
      }
    }

    // 2. Resume / File Uploads
    const resumePath = path.resolve(profile.resumePath || './resume.pdf');
    if (fs.existsSync(resumePath)) {
      const fileInputs = await page.$$('input[type="file"]');
      for (const fileInput of fileInputs) {
        try {
          const accept = (await fileInput.getAttribute('accept')) || '';
          const id = (await fileInput.getAttribute('id')) || '';
          const name = (await fileInput.getAttribute('name')) || '';
          if (accept.includes('pdf') || /resume|cv|attachment/i.test(`${id} ${name}`)) {
            await fileInput.setInputFiles(resumePath);
            onLog(`    ✓ Attached resume from: ${resumePath}`);
          }
        } catch {}
      }
    } else {
      onLog(`    ⚠ Notice: Resume file not found at ${resumePath}. Place your resume.pdf there to auto-upload.`);
    }

    // 3. Dropdown (Select) Elements
    const selects = await page.$$('select');
    for (const select of selects) {
      try {
        const isVisible = await select.isVisible();
        if (!isVisible) continue;

        const descriptor = await page.evaluate(el => {
          const lbl = el.closest('label') || document.querySelector(`label[for="${el.id}"]`);
          return `${el.id} ${el.name} ${lbl ? lbl.innerText : ''}`.toLowerCase();
        }, select);

        let desiredValue = null;
        if (/authorized|eligib/i.test(descriptor)) {
          desiredValue = profile.workAuthorization; // "Yes"
        } else if (/sponsor|visa/i.test(descriptor)) {
          desiredValue = profile.needsSponsorship; // "No"
        } else if (/gender/i.test(descriptor)) {
          desiredValue = profile.gender;
        } else if (/veteran/i.test(descriptor)) {
          desiredValue = profile.veteran;
        } else if (/disability/i.test(descriptor)) {
          desiredValue = profile.disability;
        }

        if (desiredValue) {
          const options = await select.$$eval('option', opts => opts.map(o => ({ value: o.value, text: o.text.trim() })));
          const match = options.find(o => new RegExp(`^${desiredValue}`, 'i').test(o.text) || o.text.toLowerCase().includes(desiredValue.toLowerCase()));
          if (match) {
            await select.selectOption(match.value);
            onLog(`    ✓ Selected dropdown option for [${descriptor.slice(0, 30)}]: "${match.text}"`);
          }
        }
      } catch {}
    }

    // 4. Radio / Checkboxes for Work Auth / Compliance
    const radioInputs = await page.$$('input[type="radio"]');
    for (const radio of radioInputs) {
      try {
        const labelText = await page.evaluate(el => {
          const lbl = el.closest('label') || document.querySelector(`label[for="${el.id}"]`);
          return lbl ? lbl.innerText : '';
        }, radio);

        if (profile.workAuthorization && /authorized/i.test(labelText) && /^yes/i.test(labelText.trim())) {
          await radio.check();
          onLog(`    ✓ Checked radio: "${labelText.trim()}"`);
        }
        if (profile.needsSponsorship && /sponsorship/i.test(labelText) && /^no/i.test(labelText.trim())) {
          await radio.check();
          onLog(`    ✓ Checked radio: "${labelText.trim()}"`);
        }
      } catch {}
    }

    onLog(`  -> Completed form mapping.`);

    // 5. Submit or Dry-Run
    if (options.dryRun) {
      onLog(`  [DRY-RUN] Form filled successfully. Pausing 8 seconds for your review before closing...`);
      await page.waitForTimeout(8000);
      return { success: true, dryRun: true, message: 'Form filled successfully in Dry-Run mode.' };
    } else {
      onLog(`  [AUTOPILOT SUBMIT] Finding Submit button...`);
      const submitBtn = await page.$('button[type="submit"], input[type="submit"], button:has-text("Submit Application"), button:has-text("Apply Now")');
      if (submitBtn) {
        await submitBtn.scrollIntoViewIfNeeded();
        await submitBtn.click();
        await page.waitForNavigation({ timeout: 8000 }).catch(() => {});
        onLog(`  ✓ Application successfully submitted!`);
        return { success: true, dryRun: false, message: 'Application submitted!' };
      } else {
        onLog(`  ⚠ Could not find standard submit button. Keeping open for review.`);
        await page.waitForTimeout(5000);
        return { success: false, message: 'Submit button not located.' };
      }
    }
  } catch (err) {
    onLog(`  ✗ Error during application: ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

