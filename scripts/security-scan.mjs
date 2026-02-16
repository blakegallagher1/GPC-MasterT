#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const SEVERITY_RANK = { info: 0, low: 1, moderate: 2, medium: 2, high: 3, critical: 4, warning: 1, error: 3 };

const rootDir = process.cwd();
const policyPath = resolve(rootDir, 'security/security-scan-policy.json');
const outputPath = resolve(rootDir, 'artifacts/security/security-scan-report.json');
const summaryPath = resolve(rootDir, 'artifacts/security/security-scan-summary.md');

function runJsonCommand(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', cwd: rootDir });
  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();
  let parsed;

  if (stdout) {
    try {
      parsed = JSON.parse(stdout);
    } catch {
      parsed = { parseError: true, raw: stdout };
    }
  }

  return { status: result.status ?? 1, stdout, stderr, json: parsed };
}

function toRank(severity) {
  return SEVERITY_RANK[String(severity || '').toLowerCase()] ?? -1;
}

function isIgnoreActive(ignore) {
  const expiry = new Date(ignore.expiresOn);
  return Number.isFinite(expiry.getTime()) && expiry.getTime() >= Date.now();
}

function isIgnored(finding, ignores, tool) {
  for (const ignore of ignores) {
    if (ignore.tool !== tool) continue;
    if (!isIgnoreActive(ignore)) continue;

    if (tool === 'npm-audit' && ignore.id === finding.id) {
      return true;
    }

    if (tool === 'semgrep' && ignore.ruleId === finding.ruleId) {
      if (!ignore.path || finding.path === ignore.path) {
        return true;
      }
    }
  }
  return false;
}

function getExpiredIgnores(ignores) {
  return ignores.filter((entry) => !isIgnoreActive(entry));
}

function normalizeNpmFindings(auditJson) {
  const vulnerabilities = auditJson?.vulnerabilities ?? {};
  const findings = [];

  for (const [pkgName, vulnerability] of Object.entries(vulnerabilities)) {
    const via = Array.isArray(vulnerability.via) ? vulnerability.via : [];
    for (const viaEntry of via) {
      if (typeof viaEntry !== 'object' || !viaEntry) continue;
      findings.push({
        id: viaEntry.source ? String(viaEntry.source) : String(viaEntry.url || viaEntry.name || pkgName),
        advisory: viaEntry.title || viaEntry.name || pkgName,
        package: pkgName,
        severity: String(viaEntry.severity || vulnerability.severity || 'unknown').toLowerCase(),
        url: viaEntry.url || null,
      });
    }

    if (via.length === 0 && vulnerability.severity) {
      findings.push({
        id: `pkg:${pkgName}`,
        advisory: pkgName,
        package: pkgName,
        severity: String(vulnerability.severity).toLowerCase(),
        url: null,
      });
    }
  }

  const unique = new Map();
  for (const finding of findings) {
    const key = `${finding.id}:${finding.package}:${finding.severity}`;
    if (!unique.has(key)) unique.set(key, finding);
  }

  return [...unique.values()];
}

function normalizeSemgrepFindings(semgrepJson) {
  const results = semgrepJson?.results ?? [];
  return results.map((result) => ({
    ruleId: result.check_id,
    path: result.path,
    severity: String(result.extra?.severity || 'INFO').toLowerCase(),
    message: result.extra?.message || '',
    start: result.start?.line ?? null,
    end: result.end?.line ?? null,
  }));
}

const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
const ignores = policy.ignores || [];
const expiredIgnores = getExpiredIgnores(ignores);

const npmAudit = runJsonCommand('npm', ['audit', '--json']);
const semgrep = runJsonCommand('npx', ['--yes', 'semgrep', '--config', 'p/nodejs', '--config', 'p/typescript', '--json', '.']);

const npmFindings = normalizeNpmFindings(npmAudit.json);
const semgrepFindings = normalizeSemgrepFindings(semgrep.json);

const npmThreshold = toRank(policy.thresholds?.npmAudit?.minimumSeverity || 'high');
const semgrepThreshold = (policy.thresholds?.semgrep?.severities || ['ERROR']).map((s) => String(s).toLowerCase());

const npmRelevant = npmFindings.filter((finding) => toRank(finding.severity) >= npmThreshold);
const semgrepRelevant = semgrepFindings.filter((finding) => semgrepThreshold.includes(finding.severity));

const npmIgnored = npmRelevant.filter((finding) => isIgnored(finding, ignores, 'npm-audit'));
const npmFailing = npmRelevant.filter((finding) => !isIgnored(finding, ignores, 'npm-audit'));
const semgrepIgnored = semgrepRelevant.filter((finding) => isIgnored(finding, ignores, 'semgrep'));
const semgrepFailing = semgrepRelevant.filter((finding) => !isIgnored(finding, ignores, 'semgrep'));

const report = {
  timestamp: new Date().toISOString(),
  policy,
  commandStatus: {
    npmAudit: npmAudit.status,
    semgrep: semgrep.status,
  },
  totals: {
    npmAuditFailing: npmFailing.length,
    npmAuditIgnored: npmIgnored.length,
    semgrepFailing: semgrepFailing.length,
    semgrepIgnored: semgrepIgnored.length,
    expiredIgnores: expiredIgnores.length,
  },
  findings: {
    npmAudit: {
      failing: npmFailing,
      ignored: npmIgnored,
    },
    semgrep: {
      failing: semgrepFailing,
      ignored: semgrepIgnored,
    },
  },
  expiredIgnores,
  parseWarnings: {
    npmAuditParseError: Boolean(npmAudit.json?.parseError),
    semgrepParseError: Boolean(semgrep.json?.parseError),
  },
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

const summaryLines = [
  '# Security Scan Summary',
  '',
  `- npm audit failing findings (>= ${policy.thresholds?.npmAudit?.minimumSeverity || 'high'}): ${npmFailing.length}`,
  `- npm audit ignored findings: ${npmIgnored.length}`,
  `- semgrep failing findings (${(policy.thresholds?.semgrep?.severities || ['ERROR']).join(', ')}): ${semgrepFailing.length}`,
  `- semgrep ignored findings: ${semgrepIgnored.length}`,
  `- expired ignores: ${expiredIgnores.length}`,
  '',
  `Machine-readable report: \`${outputPath.replace(`${rootDir}/`, '')}\``,
];

if (expiredIgnores.length > 0) {
  summaryLines.push('', '## Expired ignores', ...expiredIgnores.map((entry) => `- ${entry.tool}: ${entry.id || entry.ruleId} expired on ${entry.expiresOn}`));
}

writeFileSync(summaryPath, `${summaryLines.join('\n')}\n`);
console.log(summaryLines.join('\n'));

const hasFailures = npmFailing.length > 0 || semgrepFailing.length > 0 || expiredIgnores.length > 0;
process.exit(hasFailures ? 1 : 0);
