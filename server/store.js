import { promises as fs } from "node:fs";
import path from "node:path";

export const DATA_DIR = path.resolve(process.env.DATA_DIR || "data");

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Minimal, dependency-free JSON store with serialized writes and atomic renames.
 * Good enough for early-stage volume; swap for a real database later.
 */
export class JsonStore {
  constructor(name, initial) {
    this.file = path.join(DATA_DIR, `${name}.json`);
    this.initial = initial;
    this._queue = Promise.resolve();
  }

  async read() {
    try {
      const raw = await fs.readFile(this.file, "utf8");
      return JSON.parse(raw);
    } catch (err) {
      if (err.code === "ENOENT") return structuredClone(this.initial);
      throw err;
    }
  }

  async write(data) {
    await ensureDir(DATA_DIR);
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmp, this.file);
    return data;
  }

  update(mutator) {
    const run = this._queue.then(async () => {
      const data = await this.read();
      const result = await mutator(data);
      await this.write(data);
      return result;
    });
    this._queue = run.catch(() => {});
    return run;
  }
}

export function makeId(prefix = "") {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return prefix ? `${prefix}_${id}` : id;
}
