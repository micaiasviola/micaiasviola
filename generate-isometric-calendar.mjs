#!/usr/bin/env node

/**
 * Isometric Commit Calendar Generator
 * Follows lowlighter/metrics isocalendar plugin specification exactly
 */

import fs from 'fs';

const GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const GITHUB_USER = process.env.GITHUB_USER || process.env.USER || '';
const OUTPUT_FILE = process.env.OUTPUT_FILE || './dist/isometric-calendar.svg';
const DURATION = process.env.DURATION || 'half-year';

if (!GITHUB_TOKEN || !GITHUB_USER) {
  console.error('❌ GITHUB_TOKEN and GITHUB_USER env vars required');
  process.exit(1);
}

const GRAPHQL_QUERY = `query IsocalendarCalendar($login:String!, $from:DateTime!, $to:DateTime!) {
  user(login: $login) {
    calendar: contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        weeks {
          contributionDays {
            contributionCount
            color
            date
          }
        }
      }
    }
  }
}`;

async function graphql(variables) {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: GRAPHQL_QUERY, variables })
  });
  if (!res.ok) throw new Error(`GraphQL: ${res.status}`);
  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

/**
 * Fetch calendar weeks from GitHub in 28-day chunks
 */
async function fetchCalendarWeeks(start, end) {
  const allWeeks = [];
  for (let from = new Date(start); from < end;) {
    let to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 28);
    if (to > end) to = new Date(end);

    console.log(`  Fetching: ${from.toISOString().split('T')[0]} to ${to.toISOString().split('T')[0]}`);
    const d = await graphql({
      login: GITHUB_USER,
      from: from.toISOString(),
      to: to.toISOString()
    });
    
    const weeks = d?.user?.calendar?.contributionCalendar?.weeks || [];
    allWeeks.push(...weeks);
    from = new Date(to);
  }
  return allWeeks;
}

/**
 * Compute statistics
 */
function computeStats(weeks) {
  let maxStreak = 0, currentStreak = 0, maxCount = 0;
  const counts = [];
  
  for (const week of weeks) {
    for (const day of week.contributionDays) {
      const cnt = day.contributionCount || 0;
      counts.push(cnt);
      maxCount = Math.max(maxCount, cnt);
      currentStreak = cnt ? currentStreak + 1 : 0;
      maxStreak = Math.max(maxStreak, currentStreak);
    }
  }
  
  const total = counts.reduce((a, b) => a + b, 0);
  const avg = counts.length ? (total / counts.length).toFixed(1).replace(/\.0$/, '') : '0';
  
  return { maxStreak, maxCount, avg, total };
}

/**
 * Generate SVG following lowlighter/metrics specification
 */
function generateSVG(weeks, stats, duration) {
  const size = 6;
  
  // Determine viewBox height based on duration (official plugin values)
  const viewBoxHeight = duration === 'full-year' ? 270 : 170;
  
  // Calculate reference (max contributions) for scaling
  const reference = Math.max(...weeks.flatMap(w => w.contributionDays.map(d => d.contributionCount || 0)), 1);

  let svg = `<?xml version="1.0" encoding="utf-8"?>\n`;
  svg += `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 ${viewBoxHeight}">`;
  
  // Filters for 3D shading
  svg += `\n  <defs>`;
  svg += `\n    <filter id="brightness1"><feComponentTransfer><feFuncR type="linear" slope="0.6"/><feFuncG type="linear" slope="0.6"/><feFuncB type="linear" slope="0.6"/></feComponentTransfer></filter>`;
  svg += `\n    <filter id="brightness2"><feComponentTransfer><feFuncR type="linear" slope="0.2"/><feFuncG type="linear" slope="0.2"/><feFuncB type="linear" slope="0.2"/></feComponentTransfer></filter>`;
  svg += `\n  </defs>`;
  
  // Stats text overlay
  svg += `\n  <g style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif; font-size: 12px; fill: #24292e;">`;
  svg += `\n    <text x="8" y="16">Streak: ${stats.maxStreak || 0} days</text>`;
  svg += `\n    <text x="150" y="16">Max: ${stats.maxCount}/day</text>`;
  svg += `\n    <text x="280" y="16">Avg: ${stats.avg}</text>`;
  svg += `\n  </g>`;
  
  // Main isometric calendar grid
  svg += `\n  <g transform="scale(4) translate(12, 0)">`;

  let i = 0;
  for (const week of weeks) {
    svg += `\n    <g transform="translate(${i * 1.7}, ${i})">`;
    let j = 0;
    for (const day of week.contributionDays) {
      // Ratio determines cube height
      const ratio = (day.contributionCount || 0) / reference;
      const color = day.color || '#ebedf0';
      
      // Day cube positioning: translate by day index and contribution ratio
      svg += `\n      <g transform="translate(${j * -1.7}, ${j + (1 - ratio) * size})">`;
      
      // Three visible faces of the isometric cube
      // Top face (diamond)
      svg += `\n        <path fill="${color}" d="M1.7,2 0,1 1.7,0 3.4,1 z"/>`;
      
      // Left face (shaded with brightness1)
      svg += `\n        <path fill="${color}" filter="url(#brightness1)" d="M0,1 1.7,2 1.7,${2 + ratio * size} 0,${1 + ratio * size} z"/>`;
      
      // Right face (shaded with brightness2)
      svg += `\n        <path fill="${color}" filter="url(#brightness2)" d="M1.7,2 3.4,1 3.4,${1 + ratio * size} 1.7,${2 + ratio * size} z"/>`;
      
      svg += `\n      </g>`;
      j++;
    }
    svg += `\n    </g>`;
    i++;
  }

  svg += `\n  </g>`;
  svg += `\n</svg>`;
  
  return svg;
}

/**
 * Main execution
 */
(async function main() {
  try {
    console.log(`🚀 Generating isometric calendar (${DURATION})...`);
    
    const now = new Date();
    const start = new Date(now);
    
    // Calculate start date based on duration
    if (DURATION === 'full-year') {
      start.setUTCFullYear(now.getUTCFullYear() - 1);
    } else {
      // half-year: 180 days back
      start.setUTCDate(start.getUTCDate() - 180);
    }
    
    // Align to Sunday
    if (start.getUTCDay() !== 0) {
      start.setUTCDate(start.getUTCDate() - start.getUTCDay());
    }
    
    start.setUTCHours(0, 0, 0, 0);

    console.log(`📅 Fetching data from ${start.toISOString().split('T')[0]} to now...`);
    const weeks = await fetchCalendarWeeks(start, now);
    console.log(`   ✓ Fetched ${weeks.length} weeks`);

    const stats = computeStats(weeks);
    console.log(`📊 Statistics:`);
    console.log(`   Streak: ${stats.maxStreak} days`);
    console.log(`   Max: ${stats.maxCount} contributions/day`);
    console.log(`   Avg: ${stats.avg} contributions/day`);
    console.log(`   Total: ${stats.total} contributions`);

    const svg = generateSVG(weeks, stats, DURATION);
    fs.writeFileSync(OUTPUT_FILE, svg, 'utf8');
    
    console.log(`✅ SVG generated: ${OUTPUT_FILE}`);
    console.log(`   File size: ${(svg.length / 1024 / 1024).toFixed(2)}MB`);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
