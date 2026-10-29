import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, parseConfig } from '../src/config.js';

describe('parseConfig', () => {
  it('fills defaults', () => {
    expect(parseConfig({})).toEqual(DEFAULT_CONFIG);
  });

  it('reads all fields', () => {
    expect(
      parseConfig({ base: 'origin/dev', threshold: 80, failOnLow: true, include: ['src/**'], exclude: [], maxFiles: 5 }),
    ).toEqual({ base: 'origin/dev', threshold: 80, failOnLow: true, include: ['src/**'], exclude: [], maxFiles: 5 });
  });

  it('rejects bad values', () => {
    expect(() => parseConfig([])).toThrow('JSON object');
    expect(() => parseConfig({ threshold: 120 })).toThrow('between 0 and 100');
    expect(() => parseConfig({ threshold: '80' })).toThrow('threshold must be a number');
    expect(() => parseConfig({ include: 'src' })).toThrow('array of strings');
    expect(() => parseConfig({ maxFiles: 0 })).toThrow('positive integer');
  });
});
