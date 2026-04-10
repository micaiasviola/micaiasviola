#!/usr/bin/env node
import { execSync } from 'child_process';

(async function main(){
  try {
    const svgUrl = 'https://raw.githubusercontent.com/micaiasviola/micaiasviola/main/dist/isometric-calendar.svg';
    console.log('Fetching SVG from', svgUrl);
    const svgResp = await fetch(svgUrl);
    if (!svgResp.ok) throw new Error('Failed to fetch SVG: ' + svgResp.status);
    const svg = await svgResp.text();

    // Try to extract named stats first
    const streakMatch = svg.match(/Streak:\s*([0-9]+)\s*days/i);
    const maxMatch = svg.match(/Max:\s*([0-9]+)\/day/i);
    const avgMatch = svg.match(/Avg:\s*([0-9.]+)/i);

    let streak = streakMatch ? streakMatch[1] : null;
    let max = maxMatch ? maxMatch[1] : null;
    let avg = avgMatch ? avgMatch[1] : null;

    // Fallback: grab first three <text> nodes if named matches not present
    if (!streak || !max || !avg) {
      const texts = Array.from(svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)).map(m=>m[1].trim());
      // Heuristic: look for numbers inside
      for (const t of texts) {
        if (!streak) {
          const m = t.match(/(\d+)\s*days?/i);
          if (m) { streak = m[1]; continue; }
        }
        if (!max) {
          const m = t.match(/(\d+)\s*\/?day/i);
          if (m) { max = m[1]; continue; }
        }
        if (!avg) {
          const m = t.match(/([0-9]+(?:\.[0-9]+)?)/);
          if (m) { avg = m[1]; continue; }
        }
      }
    }

    streak = streak || '0';
    max = max || '0';
    avg = avg || '0';

    console.log('Parsed stats -> streak:', streak, 'max:', max, 'avg:', avg);

    // Fetch README from GitHub via REST API using token (works in Actions)
    console.log('Fetching README via GitHub REST API');
    const readmeApiUrl = 'https://api.github.com/repos/micaiasviola/micaiasviola/contents/README.md';
    const readmeToken = process.env.GITHUB_TOKEN || '';
    const readmeRes = await fetch(readmeApiUrl, {
      headers: {
        'Authorization': `token ${readmeToken}`,
        'User-Agent': 'update-readme-stats-script',
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    if (!readmeRes.ok) {
      const body = await readmeRes.text();
      throw new Error('Failed to fetch README: ' + readmeRes.status + ' ' + body);
    }
    const readmeJson = await readmeRes.json();
    const sha = readmeJson.sha;
    let content = Buffer.from(readmeJson.content, 'base64').toString('utf8');

    // Replace multiple possible locations of the stats lines
    // Patterns for new format: "- 📌 Streak: **X dias**"
    content = content.replace(/(📌\s*Streak:)\s*\*\*[^*]+\*\*/i, `$1 **${streak} dias**`);
    content = content.replace(/(⭐\s*Best:)\s*\*\*[^*]+\*\*/i, `$1 **${max} dias**`);
    content = content.replace(/(⚡\s*Média:)\s*\*\*[^*]+\*\*/i, `$1 **~${avg}\/dia**`);

    // Also try old format patterns as fallback
    content = content.replace(/(Current streak:)\s*.*(?=\n)/i, `Current streak: ${streak} days`);
    content = content.replace(/(Best streak:)\s*.*(?=\n)/i, `Best streak: ${max} days`);
    content = content.replace(/(Average per day at:)\s*.*(?=\n)/i, `Average per day at: ~${avg} per day`);

    // Commit updated README
    const updatedBase64 = Buffer.from(content, 'utf8').toString('base64');
    console.log('Updating README on GitHub (committing)');
    // Use gh auth token + GitHub REST API to avoid cli quoting issues
    let token = process.env.GITHUB_TOKEN || null;
    if (!token) {
      try {
        token = execSync('gh auth token', { encoding: 'utf8' }).toString().trim();
      } catch (e) {
        // fallback to empty and let the REST call fail with a helpful message
        token = '';
      }
    }
    const apiUrl = 'https://api.github.com/repos/micaiasviola/micaiasviola/contents/README.md';
    const payload = {
      message: 'chore: sync calendar stats (auto)',
      content: updatedBase64,
      sha
    };
    const res = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'update-readme-stats-script'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error('Failed to update README: ' + res.status + ' ' + body);
    }
    const out = await res.json();
    console.log('README updated. commit:', out.commit && out.commit.sha);

    console.log('Done.');
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
})();
