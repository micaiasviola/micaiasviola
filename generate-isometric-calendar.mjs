#!/usr/bin/env node

// Corrected Isometric Commit Calendar Generator
// Mirrors lowlighter/metrics isocalendar plugin logic

import fs from 'fs';

const GITHUB_GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const GITHUB_USER = process.env.GITHUB_USER || process.env.USER || '';
const OUTPUT_FILE = process.env.OUTPUT_FILE || './dist/isometric-calendar.svg';

if (!GITHUB_TOKEN) {
  console.error('GITHUB_TOKEN environment variable is required');
  process.exit(1);
}
if (!GITHUB_USER) {
  console.error('GITHUB_USER environment variable is required');
  process.exit(1);
}

const query = `query IsocalendarCalendar($login:String!, $from:DateTime!, $to:DateTime!) {
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
  const res = await fetch(GITHUB_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GraphQL request failed: ${res.status} ${res.statusText} - ${text}`);
  }
  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

async function fetchCalendarWeeks(start, end) {
  const calendar = { weeks: [] };
  for (let from = new Date(start); from < end;) {
    let to = new Date(from);
    // fetch 28 days window to be safe (plugin uses 4 weeks chunks)
    to.setUTCDate(to.getUTCDate() + 28);
    if (to > end) to = new Date(end);

    // adjust to include the full previous day boundary if needed
    const dto = new Date(to);
    dto.setUTCHours(dto.getUTCHours() - 1);
    dto.setUTCMinutes(59);
    dto.setUTCSeconds(59);
    dto.setUTCMilliseconds(999);

    const vars = { login: GITHUB_USER, from: from.toISOString(), to: dto.toISOString() };
    // fetch
    const d = await graphql(vars);
    if (!d || !d.user || !d.user.calendar || !d.user.calendar.contributionCalendar) break;
    const weeks = d.user.calendar.contributionCalendar.weeks || [];
    calendar.weeks.push(...weeks);

    // next from
    from = new Date(to);
  }
  return calendar;
}

function computeStats(calendar) {
  let average = 0, max = 0;
  const streak = { max: 0, current: 0 };
  const values = [];
  for (const week of calendar.weeks) {
    for (const day of week.contributionDays) {
      const cnt = day.contributionCount || 0;
      values.push(cnt);
      max = Math.max(max, cnt);
      streak.current = cnt ? streak.current + 1 : 0;
      streak.max = Math.max(streak.max, streak.current);
    }
  }
  average = values.length ? (values.reduce((a,b)=>a+b,0)/values.length).toFixed(2).replace(/[.]0+$/,'') : '0';
  return { streak, max, average };
}

function generateSVG(calendar, stats, duration='all-time') {
  const size = 6;
  const scale = 4;
  // set viewBox height similar to plugin: full-year -> 270, half-year -> 170, else compute
  const viewBoxHeight = duration === 'full-year' ? 270 : (duration === 'half-year' ? 170 : Math.max(170, Math.ceil(calendar.weeks.length * 0.8)));

  const reference = Math.max(...calendar.weeks.flatMap(w => w.contributionDays.map(d => d.contributionCount)), 1);

  let svg = `<?xml version="1.0" encoding="utf-8"?>\n`;
  svg += `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" style="margin-top: -130px;" viewBox="0,0 480,${viewBoxHeight}">`;
  svg += `\n  <defs>`;
  svg += `\n    <filter id="brightness1"><feComponentTransfer><feFuncR type=\"linear\" slope=\"0.6\"/><feFuncG type=\"linear\" slope=\"0.6\"/><feFuncB type=\"linear\" slope=\"0.6\"/></feComponentTransfer></filter>`;
  svg += `\n    <filter id="brightness2"><feComponentTransfer><feFuncR type=\"linear\" slope=\"0.2\"/><feFuncG type=\"linear\" slope=\"0.2\"/><feFuncB type=\"linear\" slope=\"0.2\"/></feComponentTransfer></filter>`;
  svg += `\n  </defs>`;
  svg += `\n  <g transform=\"scale(4) translate(12, 0)\">`;

  let i = 0;
  for (const week of calendar.weeks) {
    svg += `\n    <g transform=\"translate(${i * 1.7}, ${i})\">`;
    let j = 0;
    for (const day of week.contributionDays) {
      const ratio = (day.contributionCount || 0) / reference;
      const color = day.color || '#ebedf0';
      svg += `\n      <g transform=\"translate(${j * -1.7}, ${j + (1 - ratio) * size})\">`;
      svg += `\n        <path fill=\"${color}\" d=\"M1.7,2 0,1 1.7,0 3.4,1 z\" />`;
      svg += `\n        <path fill=\"${color}\" filter=\"url(#brightness1)\" d=\"M0,1 1.7,2 1.7,${2 + ratio * size} 0,${1 + ratio * size} z\" />`;
      svg += `\n        <path fill=\"${color}\" filter=\"url(#brightness2)\" d=\"M1.7,2 3.4,1 3.4,${1 + ratio * size} 1.7,${2 + ratio * size} z\" />`;
      svg += `\n      </g>`;
      j++;
    }
    svg += `\n    </g>`;
    i++;
  }

  svg += `\n  </g>`;
  // Optionally add stats as text
  svg += `\n  <g transform=\"translate(8,12)\">`;
  svg += `\n    <text x=\"0\" y=\"0\" font-family=\"Arial,Helvetica,sans-serif\" font-size=\"10\" fill=\"#24292e\">Streak: ${stats.streak.current || 0} / Max: ${stats.streak.max}</text>`;
  svg += `\n    <text x=\"0\" y=\"14\" font-family=\"Arial,Helvetica,sans-serif\" font-size=\"10\" fill=\"#24292e\">Max/day: ${stats.max}  Avg: ${stats.average}</text>`;
  svg += `\n  </g>`;

  svg += `\n</svg>`;
  return svg;
}

(async function main(){
  try {
    const now = new Date();
    // For all-time, start from 2005-01-01 aligned to sunday
    const start = new Date(now);
    start.setUTCFullYear(2005);
    start.setUTCMonth(0);
    start.setUTCDate(1);
    if (start.getUTCDay() !== 0) start.setUTCDate(start.getUTCDate() - start.getUTCDay());
    start.setUTCHours(0,0,0,0);

    const calendar = await fetchCalendarWeeks(start, now);
    const stats = computeStats(calendar);
    const svg = generateSVG(calendar, stats, 'all-time');
    fs.writeFileSync(OUTPUT_FILE, svg, 'utf8');
    console.log('✅ SVG generated:', OUTPUT_FILE);
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
})();
