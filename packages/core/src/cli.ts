#!/usr/bin/env node

import { anonymize, anonymizeBatch, deanonymize } from "./anonymize.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const args = process.argv.slice(2);

function usage(): void {
  console.log(`
whiteout — Anonymize documents from the command line

Usage:
  whiteout <file>                     Anonymize a file, print to stdout
  whiteout <file> -o <output>         Anonymize and write to output file
  whiteout <file> --alias-table <csv> Also write the alias table as CSV
  whiteout --restore <file> --table <csv>  Restore original text from alias table
  whiteout --stdin                    Read from stdin

Options:
  --touchstone <url>   Touchstone server URL (default: http://localhost:8420)
  --offline            Force offline mode (local detection only)
  --style <style>      Alias style: "realistic" (default) or "generic"
  --decoy <ratio>      Decoy ratio 0-50 (default: 35)
  -o, --output <file>  Write output to file instead of stdout
  --alias-table <file> Write alias table as CSV
  --restore <file>     Restore (de-anonymize) a file using an alias table
  --table <csv>        Alias table CSV for restoration
  --stdin              Read input from stdin
  -h, --help           Show this help
`);
}

async function main(): Promise<void> {
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    usage();
    process.exit(0);
  }

  // Restore mode
  if (args.includes("--restore")) {
    const fileIdx = args.indexOf("--restore") + 1;
    const tableIdx = args.indexOf("--table") + 1;

    if (!fileIdx || !tableIdx || !args[fileIdx] || !args[tableIdx]) {
      console.error("Usage: whiteout --restore <file> --table <csv>");
      process.exit(1);
    }

    const text = readFileSync(args[fileIdx], "utf-8");
    const csv = readFileSync(args[tableIdx], "utf-8");
    const table = parseCsvTable(csv);
    const restored = deanonymize(text, table);

    const outIdx = args.indexOf("-o") !== -1 ? args.indexOf("-o") + 1 : args.indexOf("--output") + 1;
    if (outIdx && args[outIdx]) {
      writeFileSync(args[outIdx], restored);
      console.error(`Restored → ${args[outIdx]}`);
    } else {
      process.stdout.write(restored);
    }
    return;
  }

  // Anonymize mode
  const touchstoneIdx = args.indexOf("--touchstone") + 1;
  const styleIdx = args.indexOf("--style") + 1;
  const decoyIdx = args.indexOf("--decoy") + 1;
  const outIdx = args.indexOf("-o") !== -1 ? args.indexOf("-o") + 1 : args.indexOf("--output") + 1;
  const aliasIdx = args.indexOf("--alias-table") + 1;
  const offline = args.includes("--offline");
  const fromStdin = args.includes("--stdin");

  let text: string;
  if (fromStdin) {
    text = readFileSync("/dev/stdin", "utf-8");
  } else {
    const inputFile = args.find(
      (a) =>
        !a.startsWith("-") &&
        a !== args[touchstoneIdx] &&
        a !== args[styleIdx] &&
        a !== args[decoyIdx] &&
        a !== (outIdx ? args[outIdx] : null) &&
        a !== (aliasIdx ? args[aliasIdx] : null)
    );
    if (!inputFile || !existsSync(inputFile)) {
      console.error(`File not found: ${inputFile ?? "(none)"}`);
      process.exit(1);
    }
    text = readFileSync(inputFile, "utf-8");
  }

  const result = await anonymize(text, {
    touchstoneUrl: offline
      ? null
      : touchstoneIdx
        ? args[touchstoneIdx]
        : undefined,
    aliasStyle: (styleIdx ? args[styleIdx] : "realistic") as
      | "realistic"
      | "generic",
    decoyRatio: decoyIdx ? parseInt(args[decoyIdx]) / 100 : 0.35,
  });

  // Output anonymized text
  if (outIdx && args[outIdx]) {
    writeFileSync(args[outIdx], result.text);
    console.error(`Anonymized → ${args[outIdx]}`);
  } else {
    process.stdout.write(result.text);
  }

  // Output alias table
  if (aliasIdx && args[aliasIdx]) {
    const rows = ["Original,Alias,Type,Confidence"];
    for (const e of result.entities) {
      const alias = e.acceptedAlias ?? e.proposedAlias;
      rows.push(
        `"${e.text.replace(/"/g, '""')}","${alias.replace(/"/g, '""')}","${e.type}","${e.confidence}"`
      );
    }
    writeFileSync(args[aliasIdx], rows.join("\n"));
    console.error(`Alias table → ${args[aliasIdx]}`);
  }

  // Summary to stderr
  console.error(
    `[whiteout] ${result.entities.length} entities, lang=${result.language}`
  );
}

function parseCsvTable(csv: string): Record<string, string> {
  const table: Record<string, string> = {};
  const lines = csv.split("\n").slice(1); // skip header
  for (const line of lines) {
    if (!line.trim()) continue;
    // Simple CSV parse (handles quoted fields)
    const match = line.match(/^"([^"]*(?:""[^"]*)*)","([^"]*(?:""[^"]*)*)"/);
    if (match) {
      const original = match[1].replace(/""/g, '"');
      const alias = match[2].replace(/""/g, '"');
      table[original] = alias;
    }
  }
  return table;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
