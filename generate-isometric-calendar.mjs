#!/usr/bin/env node

/**
 * Isometric Commit Calendar Generator
 * Fetches GitHub contribution data and generates an isometric SVG visualization
 * Based on lowlighter/metrics isocalendar plugin
 */

import * as fs from 'fs';

const GITHUB_GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_USER = process.env.GITHUB_USER || '';
const OUTPUT_FILE = process.env.OUTPUT_FILE || './isometric-calendar.svg';
const WINDOW_DAYS = 28;

/**
 * Query GitHub GraphQL for contribution calendar
 */
async function queryContributionCalendar(from, to) {
  const query = `
    query($userName:String!, $from:DateTime!, $to:DateTime!) {
      user(login: $userName) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
                contributionLevel
              }
            }
          }
        }
      }
    }
  `;

  const variables = {
    userName: GITHUB_USER,
    from: from.toISOString(),
    to: to.toISOString(),
  };

  const response = await fetch(GITHUB_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
  }

  return data.data.user.contributionsCollection.contributionCalendar;
}

/**
 * Map contribution level to color
 */
function getColorForLevel(level) {
  const colorMap = {
    NONE: '#ebedf0',
    'FIRST_QUARTILE': '#c6e48b',
    'SECOND_QUARTILE': '#7bc96f',
    'THIRD_QUARTILE': '#239a3b',
    'FOURTH_QUARTILE': '#196127',
  };
  return colorMap[level] || '#ebedf0';
}

/**
 * Fetch all contribution data
 */
async function fetchAllContributions() {
  console.log(`Fetching contribution data for user: ${GITHUB_USER}`);
  
  const now = new Date();
  const allWeeks = [];
  let from = new Date(now);
  from.setUTCFullYear(2005); // GitHub contributions started in 2011, go back further to be safe
  from.setUTCMonth(0);
  from.setUTCDate(1);
  
  // Align to Sunday
  if (from.getUTCDay() !== 0) {
    from.setUTCDate(from.getUTCDate() - from.getUTCDay());
  }

  let to = new Date(from);
  to.setUTCDate(to.getUTCDate() + WINDOW_DAYS * 7);

  while (from < now) {
    if (to > now) {
      to = new Date(now);
    }

    console.log(`Fetching contributions from ${from.toISOString().split('T')[0]} to ${to.toISOString().split('T')[0]}`);

    try {
      const calendar = await queryContributionCalendar(from, to);
      
      // Add contribution days with their computed colors
      if (calendar.weeks) {
        for (const week of calendar.weeks) {
          const processedWeek = {
            contributionDays: week.contributionDays.map(day => ({
              ...day,
              color: getColorForLevel(day.contributionLevel),
            })),
          };
          allWeeks.push(processedWeek);
        }
      }

      from = new Date(to);
      to = new Date(from);
      to.setUTCDate(to.getUTCDate() + WINDOW_DAYS * 7);
    } catch (error) {
      console.error(`Error fetching contributions: ${error.message}`);
      break;
    }
  }

  console.log(`Total weeks fetched: ${allWeeks.length}`);
  return allWeeks;
}

/**
 * Calculate statistics from contribution data
 */
function calculateStatistics(weeks) {
  let maxStreak = 0;
  let currentStreak = 0;
  let maxContributions = 0;
  const contributions = [];

  for (const week of weeks) {
    for (const day of week.contributionDays) {
      const count = day.contributionCount || 0;
      contributions.push(count);
      maxContributions = Math.max(maxContributions, count);

      if (count > 0) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }
  }

  const average = contributions.length > 0
    ? (contributions.reduce((a, b) => a + b, 0) / contributions.length).toFixed(2)
    : '0';

  return {
    maxStreak,
    maxContributions,
    average: parseFloat(average).toString().replace(/\.0+$/, ''),
    totalContributions: contributions.reduce((a, b) => a + b, 0),
  };
}

/**
 * Generate isometric SVG
 */
function generateSVG(weeks, stats) {
  console.log('Generating SVG...');

  const size = 6;
  const scale = 4;
  const padding = 12;
  
  // Calculate dimensions
  const weekCount = weeks.length;
  const viewBoxWidth = 480;
  const viewBoxHeight = Math.ceil((weekCount * 1.7 + 5) * scale);

  let svg = `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}">
    <defs>
      <style>
        .iso-text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 12px; fill: #24292e; }
        .iso-stat-label { font-size: 11px; fill: #666; }
        .iso-stat-value { font-size: 14px; font-weight: bold; fill: #24292e; }
      </style>
      <filter id="brightness1">
        <feComponentTransfer>
          <feFunc type="linear" slope="0.6" />
          <feFunc type="linear" slope="0.6" />
          <feFunc type="linear" slope="0.6" />
        </feComponentTransfer>
      </filter>
      <filter id="brightness2">
        <feComponentTransfer>
          <feFunc type="linear" slope="0.2" />
          <feFunc type="linear" slope="0.2" />
          <feFunc type="linear" slope="0.2" />
        </feComponentTransfer>
      </filter>
    </defs>`;

  // Add title
  svg += `\n    <!-- Title -->
    <text x="${viewBoxWidth / 2}" y="20" class="iso-text" text-anchor="middle" style="font-size: 16px; font-weight: bold;">📅 Isometric Contribution Calendar</text>`;

  // Add statistics box
  svg += `\n    <!-- Statistics -->
    <g>
      <text x="10" y="40" class="iso-stat-label">Current Streak</text>
      <text x="10" y="52" class="iso-stat-value">${stats.maxStreak} days</text>
      
      <text x="120" y="40" class="iso-stat-label">Max Contributions</text>
      <text x="120" y="52" class="iso-stat-value">${stats.maxContributions}</text>
      
      <text x="230" y="40" class="iso-stat-label">Avg per Day</text>
      <text x="230" y="52" class="iso-stat-value">${stats.average}</text>
      
      <text x="340" y="40" class="iso-stat-label">Total Contributions</text>
      <text x="340" y="52" class="iso-stat-value">${stats.totalContributions}</text>
    </g>`;

  // Generate isometric calendar
  svg += `\n    <!-- Isometric Calendar -->
    <g transform="scale(${scale}) translate(${padding}, 60)">`;

  let maxContributions = Math.max(...weeks.flatMap(w => w.contributionDays.map(d => d.contributionCount)));
  if (maxContributions === 0) maxContributions = 1;

  let i = 0;
  for (const week of weeks) {
    svg += `\n      <g transform="translate(${i * 1.7}, ${i})">`;
    let j = 0;
    for (const day of week.contributionDays) {
      const ratio = (day.contributionCount || 0) / maxContributions;
      svg += `
        <g transform="translate(${j * -1.7}, ${j + (1 - ratio) * size})">
          <path fill="${day.color}" d="M1.7,2 0,1 1.7,0 3.4,1 z" />
          <path fill="${day.color}" filter="url(#brightness1)" d="M0,1 1.7,2 1.7,${2 + ratio * size} 0,${1 + ratio * size} z" />
          <path fill="${day.color}" filter="url(#brightness2)" d="M1.7,2 3.4,1 3.4,${1 + ratio * size} 1.7,${2 + ratio * size} z" />
        </g>`;
      j++;
    }
    svg += `\n      </g>`;
    i++;
  }

  svg += `\n    </g>\n  </svg>`;

  return svg;
}

/**
 * Main execution
 */
async function main() {
  try {
    if (!GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN environment variable is required');
    }
    if (!GITHUB_USER) {
      throw new Error('GITHUB_USER environment variable is required');
    }

    console.log('Starting isometric calendar generation...');
    
    const weeks = await fetchAllContributions();
    const stats = calculateStatistics(weeks);
    const svg = generateSVG(weeks, stats);

    fs.writeFileSync(OUTPUT_FILE, svg, 'utf-8');
    console.log(`✅ Successfully generated isometric calendar: ${OUTPUT_FILE}`);
    console.log(`   - Weeks: ${weeks.length}`);
    console.log(`   - Current Streak: ${stats.maxStreak} days`);
    console.log(`   - Max Contributions: ${stats.maxContributions}`);
    console.log(`   - Average per Day: ${stats.average}`);
    console.log(`   - Total Contributions: ${stats.totalContributions}`);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
