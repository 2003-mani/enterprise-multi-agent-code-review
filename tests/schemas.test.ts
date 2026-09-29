import { describe, expect, it } from 'vitest';
import {
  CodeQualityResultSchema,
  CodeQualityResultJSONSchema,
  TestCoverageResultSchema,
  TestCoverageResultJSONSchema,
  RefactoringSuggestionSchema,
  RefactoringSuggestionJSONSchema
} from '../src/types/analysis-results';

describe('Analysis Result Schemas', () => {
  describe('CodeQualityResultSchema', () => {
    it('accepts valid data', () => {
      const result = CodeQualityResultSchema.safeParse({
        file: 'src/example.ts',
        issues: [
          {
            line: 10,
            severity: 'high',
            category: 'security',
            description: 'Potential security issue',
            suggestion: 'Use validated input'
          }
        ],
        overallScore: 85,
        summary: 'Good overall quality'
      });

      expect(result.success).toBe(true);
    });

    it('rejects invalid severity and score', () => {
      const result = CodeQualityResultSchema.safeParse({
        file: 'src/example.ts',
        issues: [
          {
            line: 10,
            severity: 'invalid',
            category: 'security',
            description: 'Issue',
            suggestion: 'Fix it'
          }
        ],
        overallScore: 150,
        summary: 'Invalid result'
      });

      expect(result.success).toBe(false);
    });

    it('accepts an empty issues list and boundary score', () => {
      const result = CodeQualityResultSchema.safeParse({
        file: 'src/example.ts',
        issues: [],
        overallScore: 100,
        summary: 'No issues found'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('TestCoverageResultSchema', () => {
    it('accepts valid data', () => {
      const result = TestCoverageResultSchema.safeParse({
        file: 'src/example.ts',
        hasTests: true,
        testFiles: ['tests/example.test.ts'],
        untestedPaths: [
          {
            type: 'branch',
            location: 'line 25',
            priority: 'medium',
            reasoning: 'Error branch is not tested',
            suggestedTest: 'Add a test for the error condition'
          }
        ],
        coverageEstimate: 80,
        summary: 'Most paths are covered'
      });

      expect(result.success).toBe(true);
    });

    it('rejects invalid coverage percentage and path type', () => {
      const result = TestCoverageResultSchema.safeParse({
        file: 'src/example.ts',
        hasTests: true,
        testFiles: [],
        untestedPaths: [
          {
            type: 'invalid',
            location: 'line 25',
            priority: 'medium',
            reasoning: 'Missing coverage',
            suggestedTest: 'Add a test'
          }
        ],
        coverageEstimate: -10,
        summary: 'Invalid result'
      });

      expect(result.success).toBe(false);
    });

    it('accepts zero coverage with no tests', () => {
      const result = TestCoverageResultSchema.safeParse({
        file: 'src/example.ts',
        hasTests: false,
        testFiles: [],
        untestedPaths: [],
        coverageEstimate: 0,
        summary: 'No tests available'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('RefactoringSuggestionSchema', () => {
    it('accepts valid data', () => {
      const result = RefactoringSuggestionSchema.safeParse({
        file: 'src/example.ts',
        suggestions: [
          {
            type: 'extract-function',
            location: 'lines 10-25',
            impact: 'high',
            description: 'Extract repeated logic into a function',
            before: 'Repeated code',
            after: 'Shared helper function',
            benefits: 'Improves maintainability'
          }
        ],
        summary: 'Several refactoring opportunities identified'
      });

      expect(result.success).toBe(true);
    });

    it('rejects invalid refactoring type and impact', () => {
      const result = RefactoringSuggestionSchema.safeParse({
        file: 'src/example.ts',
        suggestions: [
          {
            type: 'invalid',
            location: 'line 10',
            impact: 'critical',
            description: 'Invalid suggestion',
            before: 'Before',
            after: 'After',
            benefits: 'Benefits'
          }
        ],
        summary: 'Invalid result'
      });

      expect(result.success).toBe(false);
    });

    it('accepts an empty suggestions list', () => {
      const result = RefactoringSuggestionSchema.safeParse({
        file: 'src/example.ts',
        suggestions: [],
        summary: 'No refactoring required'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('JSON Schema exports', () => {
    it('exports valid JSON schemas for all analysis results', () => {
      const schemas = [
        CodeQualityResultJSONSchema,
        TestCoverageResultJSONSchema,
        RefactoringSuggestionJSONSchema
      ];

      for (const schema of schemas) {
        expect(schema).toBeDefined();
        expect(schema).toBeTypeOf('object');
        expect(schema).toHaveProperty('type', 'object');
        expect(schema).toHaveProperty('properties');
      }
    });

    it('exports required fields in the Code Quality JSON schema', () => {
      expect(CodeQualityResultJSONSchema).toHaveProperty('required');

      const required = CodeQualityResultJSONSchema.required as string[];

      expect(required).toEqual(
        expect.arrayContaining([
          'file',
          'issues',
          'overallScore',
          'summary'
        ])
      );
    });

    it('exports required fields in the Test Coverage JSON schema', () => {
      expect(TestCoverageResultJSONSchema).toHaveProperty('required');

      const required = TestCoverageResultJSONSchema.required as string[];

      expect(required).toEqual(
        expect.arrayContaining([
          'file',
          'hasTests',
          'testFiles',
          'untestedPaths',
          'coverageEstimate',
          'summary'
        ])
      );
    });

    it('exports required fields in the Refactoring JSON schema', () => {
      expect(RefactoringSuggestionJSONSchema).toHaveProperty('required');

      const required = RefactoringSuggestionJSONSchema.required as string[];

      expect(required).toEqual(
        expect.arrayContaining([
          'file',
          'suggestions',
          'summary'
        ])
      );
    });
  });
});