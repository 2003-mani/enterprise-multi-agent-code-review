import {
  query,
  type Options
} from '@anthropic-ai/claude-agent-sdk';

import {
  codeQualityAnalyzer,
  testCoverageAnalyzer,
  refactoringSuggester
} from './agents/index.js';

import { ORCHESTRATOR_PROMPT } from './prompts/index.js';

import {
  ReviewReportSchema,
  ReviewReportJSONSchema,
  type ReviewReport
} from './types/index.js';

import { mcpServersConfig } from './config/mcp.config.js';

import {
  RateLimiter,
  DEFAULT_RATE_LIMITS,
  type RateLimiterConfig
} from './utils/rate-limiter.js';

import {
  withRetry,
  withTimeout
} from './utils/error-handler.js';

/**
 * Orchestrator configuration options
 */
export interface OrchestratorOptions {
  model?: string;
  maxTurns?: number;

  /**
   * Maximum time allowed for a complete review operation.
   * Default: 120000 ms (2 minutes)
   */
  timeoutMs?: number;

  /**
   * Estimated token usage for each review request.
   * Used by the rate limiter.
   */
  estimatedTokens?: number;

  /**
   * Optional rate limiter configuration.
   */
  rateLimitConfig?: Partial<RateLimiterConfig>;

  /**
   * Maximum number of retry attempts after the initial attempt.
   */
  maxRetries?: number;

  /**
   * Base delay used for exponential backoff.
   */
  retryDelayMs?: number;
}

/**
 * Main Code Review Orchestrator
 *
 * Coordinates the Claude Agent SDK, GitHub MCP,
 * and three specialized subagents to analyze
 * pull requests and generate structured reports.
 */
export class CodeReviewOrchestrator {
  private options: OrchestratorOptions;
  private rateLimiter: RateLimiter;

  constructor(options: OrchestratorOptions = {}) {
    this.options = options;

    this.rateLimiter = new RateLimiter({
      ...DEFAULT_RATE_LIMITS,
      ...(options.rateLimitConfig ?? {})
    });
  }

  /**
   * Review a pull request using parallel subagent analysis.
   *
   * Production protections:
   * - Rate limiting
   * - Retry with exponential backoff
   * - Timeout protection
   * - Structured output validation
   */
  async reviewPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewReport> {
    const prompt = `${ORCHESTRATOR_PROMPT}

Review this pull request:

Repository owner: ${owner}
Repository: ${repo}
Pull request number: ${prNumber}

Use the GitHub MCP server to obtain the pull request information
and relevant files.

Then coordinate all three specialized subagents:
1. code-quality-analyzer
2. test-coverage-analyzer
3. refactoring-suggester

Run the analyses in parallel where possible.

After collecting their results, aggregate everything into a single
ReviewReport and return it as structured output.
`;

    /**
     * Claude Agent SDK configuration.
     */
    const options: Options = {
      model: this.options.model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929',
      maxTurns: this.options.maxTurns || 20,
      settingSources: ['project'],
      agents: {
        'code-quality-analyzer': codeQualityAnalyzer,
        'test-coverage-analyzer': testCoverageAnalyzer,
        'refactoring-suggester': refactoringSuggester
      },
      allowedTools: [
        'Task',
        'mcp__github__pull_request_read',
        'mcp__eslint__lint'
      ],
      mcpServers: mcpServersConfig,
      outputFormat: {
        type: 'json_schema',
        schema: ReviewReportJSONSchema
      }
    };

    /**
     * Run one complete review attempt.
     *
     * Rate limiting is applied around the Claude operation.
     */
    const executeReview = async (): Promise<ReviewReport> => {
      const estimatedTokens =
        this.options.estimatedTokens ?? 10000;

      /**
       * Wait until the request can proceed.
       */
      await this.rateLimiter.acquire(estimatedTokens);

      try {
        /**
         * Collect the structured output returned by
         * the Claude Agent SDK.
         */
        let structuredOutput: unknown;

        for await (const message of query({
          prompt,
          options
        })) {
          if (
            message.type === 'result' &&
            'structured_output' in message &&
            message.structured_output
          ) {
            structuredOutput = message.structured_output;
          }
        }

        /**
         * Make sure Claude returned structured output.
         */
        if (!structuredOutput) {
          throw new Error(
            'Orchestrator did not return structured output'
          );
        }

        /**
         * Validate the result against the Zod schema.
         */
        const validation =
          ReviewReportSchema.safeParse(structuredOutput);

        if (!validation.success) {
          throw new Error(
            `Invalid ReviewReport: ${validation.error.message}`
          );
        }

        return validation.data;
      } finally {
        /**
         * Always release the rate limiter slot,
         * even if the query fails.
         */
        this.rateLimiter.release();
      }
    };

    /**
     * Apply timeout protection and retry logic.
     *
     * Flow:
     *
     * RateLimiter
     *      ↓
     * Claude Agent SDK query
     *      ↓
     * Timeout protection
     *      ↓
     * Retry on failure
     */
    const runWithProtection = async (): Promise<ReviewReport> => {
      const timeoutMs =
        this.options.timeoutMs ?? 120000;

      const maxRetries =
        this.options.maxRetries ?? 2;

      const retryDelayMs =
        this.options.retryDelayMs ?? 1000;

      return withRetry(
        () =>
          withTimeout(
            executeReview,
            timeoutMs,
            `Pull request review timed out after ${timeoutMs}ms`
          ),
        maxRetries,
        retryDelayMs
      );
    };

    return runWithProtection();
  }
}