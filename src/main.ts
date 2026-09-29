import * as dotenv from 'dotenv';
import { mkdir, writeFile } from 'fs/promises';

import { CodeReviewOrchestrator } from './orchestrator.js';
import { ReportGenerator } from './utils/report-generator.js';

// Load environment variables
dotenv.config();

/**
 * Main entry point for the Claude Multi-Agent Code Review System
 *
 * Usage:
 *   npm run dev <owner> <repo> <pr-number>
 */
async function main() {
  const [owner, repo, prStr] = process.argv.slice(2);

  // Validate command-line arguments
  if (!owner || !repo || !prStr) {
    console.error(
      'Usage: npm run dev <owner> <repo> <pr-number>'
    );
    process.exit(1);
  }

  const prNumber = Number(prStr);

  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    console.error(
      'Error: pr-number must be a positive integer.'
    );
    process.exit(1);
  }

  // Validate authentication
  const hasAnthropicApiKey = Boolean(
    process.env.ANTHROPIC_API_KEY
  );

  const hasAwsCredentials =
    Boolean(process.env.AWS_ACCESS_KEY_ID) &&
    Boolean(process.env.AWS_SECRET_ACCESS_KEY);

  if (!hasAnthropicApiKey && !hasAwsCredentials) {
    console.error(
      'Error: No authentication configured.\n\n' +
      'Configure either:\n' +
      '1. ANTHROPIC_API_KEY for Anthropic API authentication, or\n' +
      '2. AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY for AWS Bedrock authentication.'
    );
    process.exit(1);
  }

  if (hasAwsCredentials && !hasAnthropicApiKey) {
    if (!process.env.AWS_REGION) {
      console.error(
        'Error: AWS_REGION is required when using AWS Bedrock authentication.'
      );
      process.exit(1);
    }

    console.log('🔐 Using AWS Bedrock authentication');
  } else {
    console.log('🔐 Using Anthropic API authentication');
  }

  // Validate model
  if (!process.env.ANTHROPIC_MODEL) {
    console.error(
      'Error: ANTHROPIC_MODEL is not set.'
    );
    console.error(
      'For Anthropic API use: claude-sonnet-4-5-20250929'
    );
    console.error(
      'For AWS Bedrock use: us.anthropic.claude-sonnet-4-5-20250929-v1:0'
    );
    process.exit(1);
  }

  // Validate GitHub token - NEW CODE START
  const githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    console.error(
      'Error: GITHUB_TOKEN is not set.\n\n' +
      'Create a GitHub Personal Access Token with read access, then set it in .env:\n' +
      'GITHUB_TOKEN=ghp_your_token_here\n\n' +
      'Usage: npm run dev -- <owner> <repo> <pr-number>'
    );
    process.exit(1);
  }
  // NEW CODE END

  console.log(`🤖 Model: ${process.env.ANTHROPIC_MODEL}`);
  console.log(
    `🔍 Reviewing ${owner}/${repo} pull request #${prNumber}...`
  );

  try {
    // Create orchestrator
    const orchestrator = new CodeReviewOrchestrator({
      model: process.env.ANTHROPIC_MODEL
    });

    // Review the pull request
    const report = await orchestrator.reviewPullRequest(
      owner,
      repo,
      prNumber
    );

    // Generate reports
    const generator = new ReportGenerator();

    const markdown = generator.generateMarkdownReport(report);
    const html = generator.generateHTMLReport(report);
    const json = generator.generateJSONReport(report);

    // Create reports directory
    await mkdir('reports', { recursive: true });

    const baseName = `${owner}-${repo}-pr-${prNumber}`;

    await writeFile(
      `reports/${baseName}.md`,
      markdown,
      'utf8'
    );

    await writeFile(
      `reports/${baseName}.html`,
      html,
      'utf8'
    );

    await writeFile(
      `reports/${baseName}.json`,
      json,
      'utf8'
    );

    console.log('\n✅ Code review completed successfully!');
    console.log('\nReports generated:');
    console.log(`  📄 reports/${baseName}.md`);
    console.log(`  🌐 reports/${baseName}.html`);
    console.log(`  📦 reports/${baseName}.json`);
  } catch (error) {
    console.error('\n❌ Code review failed:');

    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }

    process.exit(1);
  }
}

main();