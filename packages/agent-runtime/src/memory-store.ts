import { mkdir, readFile, appendFile } from "node:fs/promises";
import { dirname } from "node:path";

export type MemoryKind = "task-context" | "failed-attempt" | "remediation-pattern";

export interface MemoryRecord {
  id: string;
  repo: string;
  pathScope: string;
  kind: MemoryKind;
  content: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface MemoryQuery {
  repo: string;
  pathScope?: string;
  text?: string;
  kind?: MemoryKind;
  limit?: number;
}

export class ExecutionMemoryStore {
  constructor(private readonly filePath: string) {}

  async save(record: MemoryRecord): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
  }

  async query(query: MemoryQuery): Promise<MemoryRecord[]> {
    const all = await this.readAll();
    const filtered = all.filter((record) => {
      if (record.repo !== query.repo) return false;
      if (query.pathScope && !record.pathScope.startsWith(query.pathScope)) return false;
      if (query.kind && record.kind !== query.kind) return false;
      return true;
    });

    const scored = filtered
      .map((record) => ({ record, score: this.scoreRecord(record, query) }))
      .sort((a, b) => b.score - a.score || b.record.createdAt.localeCompare(a.record.createdAt));

    return scored.slice(0, query.limit ?? 20).map((item) => item.record);
  }

  private scoreRecord(record: MemoryRecord, query: MemoryQuery): number {
    let score = 1;
    if (query.pathScope && record.pathScope === query.pathScope) score += 3;
    if (query.text) {
      const queryTokens = query.text.toLowerCase().split(/\W+/).filter(Boolean);
      const haystack = `${record.content} ${record.tags.join(" ")}`.toLowerCase();
      const tokenHits = queryTokens.filter((token) => haystack.includes(token)).length;
      score += tokenHits;
    }
    if (record.kind === "remediation-pattern") score += 1;
    return score;
  }

  private async readAll(): Promise<MemoryRecord[]> {
    try {
      const data = await readFile(this.filePath, "utf8");
      return data
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as MemoryRecord);
    } catch {
      return [];
    }
  }
}
