import { formatIssue, runCustomLints } from "./custom-lint-rules.mjs";

const issues = await runCustomLints(process.cwd());

if (issues.length === 0) {
  console.log("Custom lint checks passed.");
  process.exit(0);
}

console.error(`Custom lint checks found ${issues.length} issue(s):`);
for (const issue of issues) {
  console.error(formatIssue(issue));
}
process.exit(1);
