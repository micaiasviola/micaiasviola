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

    // Fetch README from GitHub using gh api (requires gh CLI authenticated)
    console.log('Fetching README via gh api');
    const readmeJsonRaw = execSync('gh api repos/micaiasviola/micaiasviola/contents/README.md', { encoding: 'utf8' });
    const readmeJson = JSON.parse(readmeJsonRaw);
    const sha = readmeJson.sha;
    let content = Buffer.from(readmeJson.content, 'base64').toString('utf8');

    // Replace multiple possible locations of the stats lines
    // Patterns to replace (left column badges and the plain list near commits section)
    content = content.replace(/(📌\s*Current streak:)\s*.*/i, `$1 ${streak} days`);
    content = content.replace(/(⭐\s*Best streak:)\s*.*/i, `$1 ${max} days`);
    content = content.replace(/(Average per day at:)\s*.*(\n|$)/i, `$1 ~${avg} per day$2`);

    // Also replace list-style lines like: "- Current streak: 1 day"
    content = content.replace(/(-\s*Current streak:)\s*.*/i, `$1 ${streak} days`);
    content = content.replace(/(-\s*Best streak:)\s*.*/i, `$1 ${max} days`);
    content = content.replace(/(-\s*Average per day at:)\s*.*/i, `$1 ~${avg} per day`);

    // If none of the above matched (guard), try a broader replace for 'Current streak: ...' global
    content = content.replace(/(Current streak:)\s*.*(?=\n)/ig, `Current streak: ${streak} days`);
    content = content.replace(/(Best streak:)\s*.*(?=\n)/ig, `Best streak: ${max} days`);
    content = content.replace(/(Average per day at:)\s*.*(?=\n)/ig, `Average per day at: ~${avg} per day`);

    // Commit updated README
    const updatedBase64 = Buffer.from(content, 'utf8').toString('base64');
    console.log('Updating README on GitHub (committing)');
    const putCmd = `gh api repos/micaiasviola/micaiasviola/contents/README.md --method PUT -f message='chore: sync calendar stats (auto)' -f content='${updatedBase64}' -f sha='${sha}'`;
    console.log('Running:', putCmd);
    const putOut = execSync(putCmd, { encoding: 'utf8' });
    console.log('README updated. API response:', putOut.substring(0, 300));

    console.log('Done.');
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
})();
