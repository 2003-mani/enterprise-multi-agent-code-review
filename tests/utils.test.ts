import { describe, it, expect, vi } from 'vitest';

import {
    withRetry,
    withTimeout,
} from '../src/utils/error-handler.js';

import {
    RateLimiter,
} from '../src/utils/rate-limiter.js';

describe('Error Handler Utilities', () => {
    describe('withRetry', () => {
        it('should return the result when the operation succeeds', async () => {
            const operation = vi.fn().mockResolvedValue('success');

            const result = await withRetry(operation, 2, 1);

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('should retry a failed operation and eventually succeed', async () => {
            const operation = vi
                .fn()
                .mockRejectedValueOnce(new Error('temporary failure'))
                .mockResolvedValueOnce('success');

            const result = await withRetry(operation, 2, 1);

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(2);
        });

        it('should throw after all retries are exhausted', async () => {
            const operation = vi
                .fn()
                .mockRejectedValue(new Error('permanent failure'));

            await expect(
                withRetry(operation, 2, 1)
            ).rejects.toThrow();

            expect(operation).toHaveBeenCalledTimes(3);
        });
    });

    describe('withTimeout', () => {
        it('should return the operation result when it completes in time', async () => {
            const operation = () =>
                new Promise<string>((resolve) => {
                    setTimeout(() => resolve('completed'), 5);
                });

            const result = await withTimeout(
                operation,
                100,
                'Operation timed out'
            );

            expect(result).toBe('completed');
        });

        it('should reject when the operation exceeds the timeout', async () => {
            const operation = () =>
                new Promise<string>((resolve) => {
                    setTimeout(() => resolve('too late'), 100);
                });

            await expect(
                withTimeout(
                    operation,
                    10,
                    'Operation timed out'
                )
            ).rejects.toThrow('Operation timed out');
        });
    });
});

describe('RateLimiter', () => {
    it('should allow requests within the configured limits', () => {
        const limiter = new RateLimiter({
            maxRequestsPerMinute: 5,
            maxTokensPerMinute: 1000,
            maxConcurrent: 2,
        });

        expect(limiter.canProceed(100)).toBe(true);
    });

    it('should track requests and tokens within the sliding window', async () => {
        const limiter = new RateLimiter({
            maxRequestsPerMinute: 2,
            maxTokensPerMinute: 1000,
            maxConcurrent: 5,
        });

        await limiter.acquire(100);
        await limiter.acquire(200);

        const status = limiter.getStatus();

        expect(status.requestsInWindow).toBe(2);
        expect(status.tokensInWindow).toBe(300);
        expect(status.availableRequests).toBe(0);
        expect(status.availableTokens).toBe(700);

        limiter.release();
        limiter.release();
    });

    it('should track concurrent requests', async () => {
        const limiter = new RateLimiter({
            maxRequestsPerMinute: 5,
            maxTokensPerMinute: 1000,
            maxConcurrent: 1,
        });

        await limiter.acquire(100);

        expect(limiter.canProceed(100)).toBe(false);

        limiter.release();

        expect(limiter.canProceed(100)).toBe(true);
    });
});