import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockQuery,
}));

import { CodeReviewOrchestrator } from '../src/orchestrator.js';

const validReport = {
  pullRequest: {
    owner: 'owner',
    repo: 'repo',
    number: 1,
  },
  fileReviews: [
    {
      file: 'src/example.ts',
      codeQuality: {
        file: 'src/example.ts',
        issues: [],
        overallScore: 85,
        summary: 'Good code quality',
      },
      testCoverage: {
        file: 'src/example.ts',
        hasTests: true,
        testFiles: ['tests/example.test.ts'],
        untestedPaths: [],
        coverageEstimate: 90,
        summary: 'Good test coverage',
      },
      refactorings: {
        file: 'src/example.ts',
        suggestions: [],
        summary: 'No major refactoring required',
      },
    },
  ],
  summary: {
    totalFiles: 1,
    overallScore: 85,
    criticalIssues: 0,
    highPriorityTests: 0,
    refactoringOpportunities: 0,
  },
  recommendations: [],
  metadata: {
    analyzedAt: '2026-09-29T00:00:00.000Z',
    duration: 1000,
    agentVersions: {
      'code-quality-analyzer': '1.0',
      'test-coverage-analyzer': '1.0',
      'refactoring-suggester': '1.0',
    },
  },
};

describe('CodeReviewOrchestrator', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('Configuration', () => {
    it('should initialize with default options', () => {
      const orchestrator = new CodeReviewOrchestrator();

      expect(orchestrator).toBeInstanceOf(CodeReviewOrchestrator);
    });

    it('should accept custom rate limit configuration', () => {
      const orchestrator = new CodeReviewOrchestrator({
        rateLimitConfig: {
          maxRequests: 5,
          maxTokens: 1000,
          maxConcurrent: 1,
        },
      });

      expect(orchestrator).toBeInstanceOf(CodeReviewOrchestrator);
    });
  });

  describe('reviewPullRequest', () => {
    it('should return a validated ReviewReport from structured output', async () => {
      mockQuery.mockReturnValue(
        (async function* () {
          yield {
            type: 'result',
            structured_output: validReport,
          };
        })()
      );

      const orchestrator = new CodeReviewOrchestrator({
        rateLimitConfig: {
          maxRequests: 100,
          maxTokens: 100000,
          maxConcurrent: 1,
        },
      });

      const result = await orchestrator.reviewPullRequest(
        'owner',
        'repo',
        1
      );

      expect(result).toEqual(validReport);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should reject when structured output is missing', async () => {
      mockQuery.mockReturnValue(
        (async function* () {
          yield {
            type: 'result',
          };
        })()
      );

      const orchestrator = new CodeReviewOrchestrator({
        rateLimitConfig: {
          maxRequests: 100,
          maxTokens: 100000,
          maxConcurrent: 1,
        },
        maxRetries: 0,
      });

      await expect(
        orchestrator.reviewPullRequest('owner', 'repo', 1)
      ).rejects.toThrow('Operation failed after 0 retries');
    });

    it('should reject invalid ReviewReport output', async () => {
      mockQuery.mockReturnValue(
        (async function* () {
          yield {
            type: 'result',
            structured_output: {
              invalid: true,
            },
          };
        })()
      );

      const orchestrator = new CodeReviewOrchestrator({
        rateLimitConfig: {
          maxRequests: 100,
          maxTokens: 100000,
          maxConcurrent: 1,
        },
        maxRetries: 0,
      });

      await expect(
        orchestrator.reviewPullRequest('owner', 'repo', 1)
      ).rejects.toThrow('Operation failed after 0 retries');
    });

    it('should pass the pull request details to the query', async () => {
      mockQuery.mockReturnValue(
        (async function* () {
          yield {
            type: 'result',
            structured_output: validReport,
          };
        })()
      );

      const orchestrator = new CodeReviewOrchestrator({
        rateLimitConfig: {
          maxRequests: 100,
          maxTokens: 100000,
          maxConcurrent: 1,
        },
      });

      await orchestrator.reviewPullRequest(
        'test-owner',
        'test-repo',
        123
      );

      const call = mockQuery.mock.calls[0];
      const prompt = call[0].prompt;

      expect(prompt).toContain('test-owner');
      expect(prompt).toContain('test-repo');
      expect(prompt).toContain('123');
    });
  });

  describe('Integration', () => {
    it.skip('should review a real small PR', async () => {
      // Requires real API credentials and MCP servers.
    });
  });
});