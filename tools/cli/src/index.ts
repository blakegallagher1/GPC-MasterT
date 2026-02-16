#!/usr/bin/env node
import { run } from "./cli.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "../../..");
process.exitCode = run(process.argv, repoRoot);
