export interface PlanStep {
  id: string;
  summary: string;
  acceptanceChecks: string[];
  dependsOn: string[];
}

export interface ExecutionPlan {
  goal: string;
  createdAt: string;
  steps: PlanStep[];
}

export class GoalPlanner {
  decompose(goal: string): ExecutionPlan {
    const normalized = goal.trim();
    if (!normalized) {
      throw new Error("Goal is required for decomposition");
    }

    const segments = normalized
      .split(/\n+|(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter(Boolean);

    const stepInputs = segments.length > 1 ? segments : this.fallbackSplit(normalized);

    const steps = stepInputs.map((segment, index) => {
      const id = `step-${index + 1}`;
      return {
        id,
        summary: this.cleanSummary(segment),
        acceptanceChecks: [
          `Evidence exists that ${this.lowerFirst(this.cleanSummary(segment))}.`,
          "Automated or scripted check passes for this substep.",
        ],
        dependsOn: index === 0 ? [] : [`step-${index}`],
      };
    });

    return {
      goal: normalized,
      createdAt: new Date().toISOString(),
      steps,
    };
  }

  private fallbackSplit(goal: string): string[] {
    const tokens = goal.split(/\s+/).filter(Boolean);
    if (tokens.length < 8) {
      return [goal];
    }

    const chunkSize = Math.ceil(tokens.length / 3);
    const chunks: string[] = [];
    for (let i = 0; i < tokens.length; i += chunkSize) {
      chunks.push(tokens.slice(i, i + chunkSize).join(" "));
    }
    return chunks;
  }

  private cleanSummary(input: string): string {
    return input.replace(/^[-*\d.)\s]+/, "").replace(/[.\s]+$/, "");
  }

  private lowerFirst(input: string): string {
    return input.length > 1 ? `${input[0].toLowerCase()}${input.slice(1)}` : input.toLowerCase();
  }
}
