/**
 * FormationHub synthetic health check.
 * Flow: home -> select state -> Start Application -> fill full form -> Continue
 *       -> validate we reached /checkout with a working Stripe payment form.
 * Never submits payment. Reports result to Slack (if configured) + monitor.log.
 *
 * Exit code 0 = healthy, 1 = problem.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');

const DIR = __dirname;
const CFG = JSON.parse(fs.readFileSync(path.join(DIR, 'config.json'), 'utf8'));
const LOG = path.join(DIR, 'monitor.log');
const SHOT_DIR = path.join(DIR, 'screenshots');
if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR);

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
function log(line) {
  const msg = `[${now()}] ${line}`;
  console.log(msg);
  fs.appendFileSync(LOG, msg + '\n');
}

function postSlack(ok, steps, durationMs, errMsg, shotPath) {
  return new Promise((resolve) => {
    // Prefer the env var (GitHub Actions secret) over config.json so the webhook
    // never has to be committed to the repo.
    const url = (process.env.SLACK_WEBHOOK_URL || CFG.slackWebhookUrl || '').trim();
    if (!url) return resolve(false);
    const color = ok ? '#2eb67d' : '#e01e5a';
    const header = ok
      ? `:white_check_mark: ${CFG.siteName} — HEALTHY`
      : `:rotating_light: ${CFG.siteName} — PROBLEM`;
    const lines = steps.map(s => `${s.ok ? ':white_check_mark:' : ':x:'} ${s.name}${s.ms != null ? ` _(${s.ms}ms)_` : ''}`).join('\n');
    let detail = `*State:* ${CFG.state}   *Total:* ${durationMs}ms`;
    if (!ok && errMsg) detail += `\n*Error:* ${errMsg}`;
    if (!ok && shotPath) detail += `\n*Screenshot:* ${shotPath}`;
    const body = JSON.stringify({
      attachments: [{
        color,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: ok ? '✅ HEALTHY' : '🚨 PROBLEM' } },
          { type: 'section', text: { type: 'mrkdwn', text: `*${CFG.siteName}*\n${detail}` } },
          { type: 'section', text: { type: 'mrkdwn', text: lines } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: `Checked at ${now()} UTC` }] }
        ]
      }]
    });
    const u = new URL(url);
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { res.on('data', () => {}); res.on('end', () => resolve(res.statusCode === 200)); });
    req.on('error', (e) => { log('Slack post error: ' + e.message); resolve(false); });
    req.write(body); req.end();
  });
}

(async () => {
  const t0 = Date.now();
  const steps = [];
  const mark = (name, ok, since) => steps.push({ name, ok, ms: since != null ? Date.now() - since : null });
  let browser, page, shotPath = '';
  const d = CFG.testData;

  try {
    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });
    page.setDefaultTimeout(30000);

    // Manual test hook: trigger the workflow with force_fail=true to verify the Slack alert path.
    if (process.env.FORCE_FAIL === 'true') {
      await page.goto(CFG.homeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      throw new Error('Forced test failure (FORCE_FAIL=true) — verifying the alert path, not a real outage.');
    }

    // 1) Home loads
    let s = Date.now();
    await page.goto(CFG.homeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('select#state-select', { timeout: 30000 });
    mark('Home page loaded + state dropdown present', true, s);

    // 2) Select state + Start Application. The SPA navigation is occasionally flaky, so retry
    //    the select+click a few times (re-loading home if needed) before the form appears.
    s = Date.now();
    let formOpen = false;
    for (let attempt = 1; attempt <= 3 && !formOpen; attempt++) {
      try {
        await page.selectOption('select#state-select', { label: CFG.state });
        await page.waitForTimeout(400);
        await page.click('button:has-text("Start Application")');
        await page.waitForSelector('#businessName', { timeout: 20000 });
        formOpen = true;
      } catch (_) {
        if (attempt < 3) {
          await page.goto(CFG.homeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await page.waitForSelector('select#state-select', { timeout: 30000 });
        }
      }
    }
    if (!formOpen) throw new Error('Application form (#businessName) did not open after 3 attempts from the home page.');
    mark('Selected state, opened application form', true, s);

    // 3) Fill the whole form
    s = Date.now();
    await page.fill('#businessName', `${d.businessNamePrefix} ${Date.now().toString().slice(-6)}`);
    await page.selectOption('#activityPrimaryActivity', { index: d.activityIndex }).catch(() => {});
    // Selecting an activity reveals a dependent required dropdown ("Specific Products/Services",
    // first option "Please select", no id). Pick the first real option.
    await page.waitForTimeout(1200);
    const depDropdown = page.locator('select', { has: page.locator('option', { hasText: 'Please select' }) });
    if (await depDropdown.count()) await depDropdown.first().selectOption({ index: 1 }).catch(() => {});
    await page.fill('#representativeFirstName', d.firstName);
    await page.fill('#representativeLastName', d.lastName);
    await page.selectOption('#representativeTitle', { label: d.title })
      .catch(async () => { await page.selectOption('#representativeTitle', { index: 1 }); });
    await page.fill('#customerEmail', d.email);
    await page.fill('#customerPhone', d.phone);

    const repAddr = page.locator('input[placeholder="Enter Address"]').first();
    await repAddr.fill(d.street);
    await page.waitForTimeout(1200);
    const sugg = page.locator('.pac-item, [role="option"]').first();
    if (await sugg.count()) { await sugg.click().catch(() => {}); await page.waitForTimeout(400); }

    await page.fill('#representativeCity', d.city);
    await page.selectOption('#representativeState', { label: d.repState }).catch(() => {});
    await page.fill('#representativeZip', d.zip);

    await page.check('#isPhysicalSameAsRepresentative-Yes').catch(() => {});
    await page.waitForTimeout(300);
    await page.check('#isMailingAddressSame-Yes').catch(() => {});
    await page.check('#managedByMembers-Yes').catch(() => {});
    await page.check('#members_0_ownerType-individual').catch(() => {});
    await page.fill('#members_0_firstName', d.firstName).catch(() => {});
    await page.fill('#members_0_lastName', d.lastName).catch(() => {});
    await page.check('#questionsFirstLLC-Yes').catch(() => {});
    await page.check('#questionsHaveEmployee-No').catch(() => {});
    await page.check('#questionsStartedDoingBusiness-No').catch(() => {});
    await page.check('#acceptCreditCardPayments-No').catch(() => {});
    await page.check('#agreeWithTerms').catch(() => {});
    mark('Filled all form fields + checkboxes', true, s);

    // 4) Continue -> checkout. The form auto-saves (orderId appears in URL); clicking too
    //    early shows "Please wait for your form to save". Wait for save, then click with retry.
    s = Date.now();
    await page.waitForFunction(() => location.search.includes('orderId'), null, { timeout: 30000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    let reachedCheckout = false;
    for (let attempt = 1; attempt <= 4 && !reachedCheckout; attempt++) {
      await page.click('button:has-text("Continue")');
      try {
        await page.waitForURL('**/checkout**', { timeout: 12000 });
        reachedCheckout = true;
      } catch (_) {
        // still on form — likely "please wait to save" banner; give it time and retry
        await page.waitForTimeout(2500);
      }
    }
    if (!reachedCheckout) throw new Error('Did not reach /checkout after 4 Continue attempts (form save/validation issue).');
    mark('Reached checkout URL', true, s);

    // 5) Validate the payment form actually renders. NO submission.
    //    Wait for: "Payment method" heading, the Stripe card-input iframe, and the Submit button.
    s = Date.now();
    await page.getByText(/Payment method/i).first().waitFor({ state: 'visible', timeout: 20000 });
    // Stripe Elements mounts a card-input iframe (title "Secure payment input frame").
    await page.waitForSelector('iframe[title*="Secure payment input"], iframe[name^="__privateStripeFrame"]', { timeout: 20000 });
    // The actual card number field lives inside a Stripe frame — confirm it's interactable.
    const cardFrame = page.frameLocator('iframe[title*="Secure payment input"]').first();
    await cardFrame.locator('input[name="number"], input[autocomplete="cc-number"], input').first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => { throw new Error('Stripe card-number field did not render inside payment iframe.'); });
    await page.getByRole('button', { name: /Submit Application/i }).waitFor({ state: 'visible', timeout: 15000 });
    mark('Payment form rendered (Stripe card field + Submit) — no payment submitted', true, s);

    const dur = Date.now() - t0;
    log(`HEALTHY - all ${steps.length} steps passed in ${dur}ms. URL=${page.url()}`);
    await browser.close();

    if (CFG.notifyOn === 'always') await postSlack(true, steps, dur);
    process.exit(0);

  } catch (err) {
    const dur = Date.now() - t0;
    const failedStep = (steps.find(x => !x.ok) || {}).name || (steps.length ? `after "${steps[steps.length - 1].name}"` : 'startup');
    // record the failing step explicitly
    steps.push({ name: `FAILED ${failedStep}`, ok: false, ms: null });
    try {
      if (page) {
        shotPath = path.join(SHOT_DIR, `fail-${now().replace(/[: ]/g, '-')}.png`);
        await page.screenshot({ path: shotPath, fullPage: true });
      }
    } catch (_) {}
    log(`PROBLEM - ${err.message} | failed near: ${failedStep} | ${dur}ms | shot=${shotPath}`);
    if (browser) await browser.close().catch(() => {});
    await postSlack(false, steps, dur, err.message, shotPath); // always alert on failure
    process.exit(1);
  }
})();
