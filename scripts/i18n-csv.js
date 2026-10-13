#!/usr/bin/env node
// Converts the WERGONIC_I18N_STRINGS object in i18n.js to/from a CSV file so
// translations can be handed to a proofreader in a spreadsheet and merged
// back afterwards.
//
// Usage:
//   node scripts/i18n-csv.js export [csvPath]   i18n.js -> CSV (default: i18n-strings.csv)
//   node scripts/i18n-csv.js import [csvPath]   CSV -> i18n.js (default: i18n-strings.csv)

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.join(__dirname, '..');
const I18N_JS_PATH = path.join(REPO_ROOT, 'i18n.js');
const DEFAULT_CSV_PATH = path.join(REPO_ROOT, 'i18n-strings.csv');
const LANGS = ['en', 'zh', 'sv'];

// Known key-prefix -> section comment, in the order they should appear.
// Unrecognized prefixes fall back to a generic "── <prefix> ──" header,
// appended after the known sections in order of first appearance.
const SECTION_HEADERS = {
    common: '\u2500\u2500 Shared \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
    field: '\u2500\u2500 field-record.html (simple field-user page) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
    mgr: '\u2500\u2500 device-manager.html (advanced multi-device console) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
    dash: '\u2500\u2500 dashboard.html (session A/B comparison view) - EN/SV only \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
    land: '\u2500\u2500 session-comparison-landscape.html (kiosk dashboard) - EN/SV only \u2500\u2500\u2500\u2500'
};
const SECTION_ORDER = ['common', 'field', 'mgr', 'dash', 'land'];

function keyPrefix(key) {
    const dot = key.indexOf('.');
    return dot === -1 ? key : key.slice(0, dot);
}

// ── Extract the WERGONIC_I18N_STRINGS object literal from i18n.js ──────────
function findObjectLiteralBounds(source, marker) {
    const markerIdx = source.indexOf(marker);
    if (markerIdx === -1) throw new Error(`Could not find "${marker}" in i18n.js`);
    const braceStart = source.indexOf('{', markerIdx);
    if (braceStart === -1) throw new Error('Could not find opening brace after marker');

    let depth = 0;
    let inString = null;   // "'" or '"' while inside a string literal
    let inLineComment = false;
    let escaped = false;

    for (let i = braceStart; i < source.length; i++) {
        const ch = source[i];

        if (inLineComment) {
            if (ch === '\n') inLineComment = false;
            continue;
        }
        if (inString) {
            if (escaped) { escaped = false; continue; }
            if (ch === '\\') { escaped = true; continue; }
            if (ch === inString) inString = null;
            continue;
        }
        if (ch === "'" || ch === '"') { inString = ch; continue; }
        if (ch === '/' && source[i + 1] === '/') { inLineComment = true; continue; }
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return { start: braceStart, end: i + 1 };
        }
    }
    throw new Error('Unbalanced braces while scanning WERGONIC_I18N_STRINGS');
}

function loadStringsObject() {
    const source = fs.readFileSync(I18N_JS_PATH, 'utf8');
    const { start, end } = findObjectLiteralBounds(source, 'const WERGONIC_I18N_STRINGS');
    const objectText = source.slice(start, end);
    const strings = vm.runInNewContext(`(${objectText})`);
    return { source, start, end, strings };
}

// ── CSV encode/decode (RFC4180-ish, quotes every field for safety) ─────────
function csvEscape(value) {
    return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
}

function toCsv(strings) {
    const header = ['key', ...LANGS].map(csvEscape).join(',');
    const rows = Object.keys(strings).map(key => {
        const entry = strings[key];
        return [key, ...LANGS.map(l => entry[l] || '')].map(csvEscape).join(',');
    });
    return '\uFEFF' + [header, ...rows].join('\r\n') + '\r\n';
}

function parseCsv(text) {
    const clean = text.replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < clean.length; i++) {
        const ch = clean[i];
        if (inQuotes) {
            if (ch === '"' && clean[i + 1] === '"') { field += '"'; i++; }
            else if (ch === '"') { inQuotes = false; }
            else { field += ch; }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ',') {
            row.push(field); field = '';
        } else if (ch === '\r') {
            // skip; \n (or end of input) closes the row
        } else if (ch === '\n') {
            row.push(field); field = '';
            rows.push(row); row = [];
        } else {
            field += ch;
        }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows.filter(r => r.length > 1 || r[0] !== '');
}

// ── Regenerate the WERGONIC_I18N_STRINGS block text from parsed CSV rows ───
function buildStringsBlock(entries) {
    const groups = new Map(); // prefix -> [{key, en, zh, sv}]
    entries.forEach(entry => {
        const prefix = keyPrefix(entry.key);
        if (!groups.has(prefix)) groups.set(prefix, []);
        groups.get(prefix).push(entry);
    });

    const orderedPrefixes = [
        ...SECTION_ORDER.filter(p => groups.has(p)),
        ...[...groups.keys()].filter(p => !SECTION_ORDER.includes(p))
    ];

    const keyColWidth = Math.max(...entries.map(e => `'${e.key}':`.length)) + 1;
    // Bare object literal only (brace-to-brace) — the caller splices this
    // back between the untouched "const WERGONIC_I18N_STRINGS = " prefix and
    // the trailing ";" + rest of the file, so no prefix/suffix belongs here.
    const lines = ['{'];

    orderedPrefixes.forEach((prefix, gi) => {
        const header = SECTION_HEADERS[prefix] || `\u2500\u2500 ${prefix} \u2500\u2500`;
        lines.push(`${gi === 0 ? '    ' : '\n    '}// ${header}`);
        groups.get(prefix).forEach(entry => {
            const keyText = `'${entry.key}':`.padEnd(keyColWidth);
            const parts = LANGS.map(l => `${l}: ${JSON.stringify(entry[l] || '')}`).join(', ');
            lines.push(`    ${keyText} { ${parts} },`);
        });
    });

    lines.push('}');
    // Drop the trailing comma on the very last entry for tidy output.
    const text = lines.join('\n').replace(/,(\n})/, '$1');
    return text;
}

// ── Commands ────────────────────────────────────────────────────────────
function exportCsv(csvPath) {
    const { strings } = loadStringsObject();
    fs.writeFileSync(csvPath, toCsv(strings));
    console.log(`Exported ${Object.keys(strings).length} strings x ${LANGS.length} languages -> ${csvPath}`);
}

function importCsv(csvPath) {
    const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
    const [header, ...dataRows] = rows;
    const langCols = LANGS.map(l => header.indexOf(l));
    if (header[0] !== 'key' || langCols.some(i => i === -1)) {
        throw new Error(`CSV header must be "key,${LANGS.join(',')}", got "${header.join(',')}"`);
    }

    const entries = dataRows.map(r => ({
        key: r[0],
        en: r[langCols[0]],
        zh: r[langCols[1]],
        sv: r[langCols[2]]
    }));

    const { source, start, end } = loadStringsObject();
    const newBlock = buildStringsBlock(entries);
    const newSource = source.slice(0, start) + newBlock + source.slice(end);
    fs.writeFileSync(I18N_JS_PATH, newSource);
    console.log(`Imported ${entries.length} strings from ${csvPath} -> ${I18N_JS_PATH}`);
}

// ── Entry point ─────────────────────────────────────────────────────────
const [, , command, csvArg] = process.argv;
const csvPath = csvArg ? path.resolve(csvArg) : DEFAULT_CSV_PATH;

if (command === 'export') exportCsv(csvPath);
else if (command === 'import') importCsv(csvPath);
else {
    console.error('Usage: node scripts/i18n-csv.js <export|import> [csvPath]');
    process.exit(1);
}
