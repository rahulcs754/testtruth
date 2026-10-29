import { existsSync, readFileSync } from 'node:fs';
import type { Config } from './types.js';

export const DEFAULT_CONFIG: Config = {
  threshold: 60,
  failOnLow: false,
  include: [],
  exclude: [],
  maxFiles: 30,
};

export function parseConfig(raw: unknown): Config {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('testtruth.json must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  const config: Config = { ...DEFAULT_CONFIG };

  if (obj.base !== undefined) config.base = expect(obj.base, 'string', 'base');
  if (obj.threshold !== undefined) {
    const t = expect(obj.threshold, 'number', 'threshold');
    if (t < 0 || t > 100) throw new Error('threshold must be between 0 and 100');
    config.threshold = t;
  }
  if (obj.failOnLow !== undefined) config.failOnLow = expect(obj.failOnLow, 'boolean', 'failOnLow');
  if (obj.include !== undefined) config.include = stringArray(obj.include, 'include');
  if (obj.exclude !== undefined) config.exclude = stringArray(obj.exclude, 'exclude');
  if (obj.maxFiles !== undefined) {
    const m = expect(obj.maxFiles, 'number', 'maxFiles');
    if (!Number.isInteger(m) || m < 1) throw new Error('maxFiles must be a positive integer');
    config.maxFiles = m;
  }
  return config;
}

export function loadConfig(path: string): Config {
  if (!existsSync(path)) return { ...DEFAULT_CONFIG };
  return parseConfig(JSON.parse(readFileSync(path, 'utf8')));
}

function expect<T extends 'string' | 'number' | 'boolean'>(
  value: unknown,
  type: T,
  key: string,
): T extends 'string' ? string : T extends 'number' ? number : boolean {
  if (typeof value !== type) throw new Error(`${key} must be a ${type}`);
  return value as never;
}

function stringArray(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    throw new Error(`${key} must be an array of strings`);
  }
  return value;
}
