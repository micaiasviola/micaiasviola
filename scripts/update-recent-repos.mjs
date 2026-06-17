#!/usr/bin/env node
/**
 * Script used to automatically update the README with the 4 most recently updated public repositories.
 * Purpose: Keep the profile fresh with real-time activity.
 */
import fs from 'fs';
import path from 'path';

async function updateRecentRepos() {
    const username = 'micaiasviola';
    const apiUrl = `https://api.github.com/users/${username}/repos?sort=pushed&direction=desc&per_page=100`;
    const token = process.env.GITHUB_TOKEN;

    try {
        console.log('Fetching repositories from GitHub API...');
        const response = await fetch(apiUrl, {
            headers: token ? { 'Authorization': `token ${token}` } : {}
        });

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        }

        const repos = await response.json();
        
        // Filter for public and non-fork repositories.
        // The workflow runs with GITHUB_TOKEN, so the API also returns private repos;
        // we must exclude them since github-readme-stats cannot render private repo cards.
        const recentRepos = repos
            .filter(repo => !repo.fork && !repo.private && repo.name !== username)
            .slice(0, 4);

        if (recentRepos.length < 4) {
            console.warn('Found fewer than 4 public repositories.');
        }

        console.log('Top 4 recent repositories:', recentRepos.map(r => r.name).join(', '));

        // Generate the new HTML table content
        // Using the Tokyonight theme as requested
        const generateCard = (repo) => `<td><a href="${repo.html_url}"><img src="https://github-readme-stats.vercel.app/api/pin/?username=${username}&repo=${repo.name}&theme=tokyonight&border_radius=10" alt="${repo.name}" /></a></td>`;

        const newTable = `
  <table>
    <tr>
      ${generateCard(recentRepos[0])}
      ${generateCard(recentRepos[1])}
    </tr>
    <tr>
      ${generateCard(recentRepos[2])}
      ${generateCard(recentRepos[3])}
    </tr>
  </table>`;

        // Update README.md
        const readmePath = path.resolve('README.md');
        if (!fs.existsSync(readmePath)) {
            throw new Error('README.md not found in the current directory.');
        }

        let readmeContent = fs.readFileSync(readmePath, 'utf8');

        const markerStart = '<!-- RECENT_REPOS_START -->';
        const markerEnd = '<!-- RECENT_REPOS_END -->';

        const startIndex = readmeContent.indexOf(markerStart);
        const endIndex = readmeContent.indexOf(markerEnd);

        if (startIndex === -1 || endIndex === -1) {
            throw new Error('Could not find markers <!-- RECENT_REPOS_START --> and <!-- RECENT_REPOS_END --> in README.md');
        }

        console.log('Updating README.md content between markers...');
        const updatedContent = 
            readmeContent.substring(0, startIndex + markerStart.length) +
            newTable +
            readmeContent.substring(endIndex);

        fs.writeFileSync(readmePath, updatedContent);
        console.log('Successfully updated README.md');

    } catch (error) {
        console.error('Error during update:', error.message);
        process.exit(1);
    }
}

updateRecentRepos();
