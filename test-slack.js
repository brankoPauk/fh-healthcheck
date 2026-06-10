// One-off: verify the Slack webhook works by posting a sample alert.
const fs = require('fs');
const https = require('https');
const CFG = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'));
const url = (CFG.slackWebhookUrl || '').trim();
if (!url) { console.error('No slackWebhookUrl in config.json'); process.exit(1); }

const body = JSON.stringify({
  attachments: [{
    color: '#e01e5a',
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🔔 Monitor connected (test)' } },
      { type: 'section', text: { type: 'mrkdwn', text: `*${CFG.siteName}*\nThis is a one-time test message. Real alerts post here *only when the health check fails*.` } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: 'FormationHub synthetic monitor • every 15 min' }] }
    ]
  }]
});
const u = new URL(url);
const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
  (res) => { let d=''; res.on('data', c => d+=c); res.on('end', () => console.log('Slack response:', res.statusCode, d)); });
req.on('error', e => { console.error('ERROR:', e.message); process.exit(1); });
req.write(body); req.end();
