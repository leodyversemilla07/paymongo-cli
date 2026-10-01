import { readFile, stat } from 'node:fs/promises';
import { ConfigError, ValidationError } from '../../utils/errors.js';

const MAX_JSON_BYTES = 1024 * 1024;

/** Read bounded JSON input without exposing its contents in parsing errors. */
export async function readJsonInput(path?: string): Promise<unknown> {
  if (path === undefined) return undefined;
  let contents: string;
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size > MAX_JSON_BYTES) {
      throw new ValidationError('JSON input must be a regular file of at most 1 MiB');
    }
    contents = await readFile(path, 'utf8');
    if (Buffer.byteLength(contents) > MAX_JSON_BYTES) {
      throw new ValidationError('JSON input must be at most 1 MiB');
    }
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ConfigError(`Unable to read JSON file: ${path}`);
  }
  try {
    return JSON.parse(contents) as unknown;
  } catch {
    throw new ValidationError(`Invalid JSON file: ${path}`);
  }
}
