#!/usr/bin/env node

import fs from 'fs';

const GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const GITHUB_USER = process.env.GITHUB_USER || process.env.USER || '';
const OUTPUT_FILE = process.env.OUTPUT_FILE || './dist/isometric-calendar.svg';

if (!GITHUB_TOKEN || !GITHUB_USER) {
  console.error('GITHUB_TOKEN and GITHUB_USER env vars required');
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

async function fetchCalendarWeeks(start, end) {
  const allWeeks = [];
  for (let from = new Date(start); from < end;) {
    let to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 28);
    if (to > end) to = new Date(end);

    console.log(`Fetching: ${from.toISOString().split('T')[0]} to ${to.toISOString().split('T')[0]}`);
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
  const total = counts.reduce((a,b)=>a+b,0);
  const avg = counts.length ? (total/counts.length).toFixed(1).replace(/\.0$/, '') : '0';
  return { maxStreak, maxCount, avg, total };
}

function generateSVG(weeks, stats) {
  const size = 6;
  const reference = Math.max(...weeks.flatMap(w => w.contributionDays.map(d => d.contributionCount || 0)), 1);
  const height = Math.max(170, Math.ceil(weeks.length * 0.8));

  let svg = `<?xml version="1.0" encoding="utf-8"?>\n`;
  svg += `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 ${height * 4}">`;
  svg += `\n  <defs>`;
  svg += `\n    <filter id="brightness1"><feComponentTransfer><feFuncR type="linear" slope="0.6"/><feFuncG type="linear" slope="0.6"/><feFuncB type="linear" slope="0.6"/></feComponentTransfer></filter>`;
  svg += `\n    <filter id="brightness2"><feComponentTransfer><feFuncR type="linear" slope="0.2"/><feFuncG type="linear" slope="0.2"/><feFuncB type="linear" slope="0.2"/></feComponentTransfer></filter>`;
  svg += `\n  </defs>`;
  svg += `\n  <g transform="scale(4) translate(12, 0)">`;

  let i = 0;
  for (const week of weeks) {
    svg += `\n    <g transform="translate(${i * 1.7}, ${i})">`;
    let j = 0;
    for (const day of week.contributionDays) {
      const ratio = (day.contributionCount || 0) / reference;
      const color = day.color || '#ebedf0';
      svg += `\n      <g transform="translate(${j * -1.7}, ${j + (1 - ratio) * size})">`;
      svg += `\n        <path fill="${color}" d="M1.7,2 0,1 1.7,0 3.4,1 z"/>`;
      svg += `\n        <path fill="${color}" filter="url(#brightness1)" d="M0,1 1.7,2 1.7,${2 + ratio * size} 0,${1 + ratio * size} z"/>`;
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

(async function main() {
  try {
    const now = new Date();
    const start = new Date(now);
    start.setUTCFullYear(2005);
    start.setUTCMonth(0);
    start.setUTCDate(1);
    if (start.getUTCDay() !== 0) start.setUTCDate(start.getUTCDate() - start.getUTCDay());

    console.log('Fetching calendar data...');
    const weeks = await fetchCalendarWeeks(start, now);
    console.log(`Fetched ${weeks.length} weeks`);

    const stats = computeStats(weeks);
    console.log(`Stats:`, stats);

    const svg = generateSVG(weeks, stats);
    fs.writeFileSync(OUTPUT_FILE, svg, 'utf8');
    console.log('✅ Generated:', OUTPUT_FILE);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
