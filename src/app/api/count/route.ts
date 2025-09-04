
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

interface CsvRow {
    [key: string]: string;
}

interface UserCountConfig {
    udgr: number; // User data growth rate
    naud: number; // Number of additional user data
}

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const EXPECTED_MAIN_HEADERS = ['Email', 'Product Configurations'];
const USER_CONF_FILENAME = 'user.conf';
const USERID_CONF_FILENAME = 'userid.conf';
const API_PWD_FILENAME = 'apipwd.conf';
const ADDITIONAL_CSV_BASENAME = 'additional';
const PAYMENT_CSV_BASENAME = 'payment';


function parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let currentVal = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                currentVal += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            values.push(currentVal);
            currentVal = '';
        } else {
            currentVal += char;
        }
    }
    values.push(currentVal);
    return values.map(v => v.trim());
}

async function parseCsvData(text: string, filePathForLogging: string, expectedHeaders: string[]): Promise<CsvRow[]> {
    try {
        const cleanText = text.startsWith('﻿') ? text.substring(1) : text;
        const lines = cleanText.trim().split(/\r?\n/);

        if (lines.length === 0 || !lines[0]?.trim()) return [];
        const headers = parseCsvLine(lines[0]).map(h => h.trim()).filter(Boolean);
        if (headers.length === 0) return [];
        if (lines.length === 1) return [];

        const data: CsvRow[] = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line || /^\s*,*\s*$/.test(line)) continue;
            try {
                const values = parseCsvLine(line);
                if (values.length < headers.length) continue;

                const row: CsvRow = {};
                let rowHasData = false;
                headers.forEach((header, index) => {
                    const value = (values[index] ?? '').trim();
                    row[header] = value;
                    if (value) rowHasData = true;
                });

                if (rowHasData) data.push(row);
            } catch {
                // ignore line errors
            }
        }
        return data;
    } catch {
        return [];
    }
}

const getBaseName = (filePath: string): string => {
    const fileName = path.basename(filePath, '.csv');
    return fileName.match(/^([a-zA-Z0-9]+)/)?.[1] ?? '';
};


async function getUserCount() {
    // 1. Get user count config
    let userCountConfig: UserCountConfig = { udgr: 100, naud: 0 };
    try {
        const userConfPath = path.join(PUBLIC_DIR, USER_CONF_FILENAME);
        const userConfText = await fs.readFile(userConfPath, 'utf-8');
        const lines = userConfText.split('\n');
        for (const line of lines) {
            const [key, value] = line.split('=').map(s => s.trim());
            if (key === 'udgr') {
                const rate = parseInt(value, 10);
                if (!isNaN(rate)) userCountConfig.udgr = rate;
            }
            if (key === 'naud') {
                const additional = parseInt(value, 10);
                if (!isNaN(additional)) userCountConfig.naud = additional;
            }
        }
    } catch (err) {
        console.warn(`${USER_CONF_FILENAME} not found or could not be parsed. Using default values.`);
    }

    // 2. Get base count from all main CSV files
    const publicFiles = await fs.readdir(PUBLIC_DIR).catch(() => []);
    const confFiles = publicFiles.filter(f => f.endsWith('.conf') && f !== USER_CONF_FILENAME && f !== USERID_CONF_FILENAME && f !== API_PWD_FILENAME);
    const knownBaseNames = new Set<string>();
     for (const confFile of confFiles) {
        const baseName = getBaseName(confFile);
        knownBaseNames.add(baseName);
    }

    const csvFiles = publicFiles.filter(f => f.endsWith('.csv'));
    const mainCsvFiles = csvFiles.filter(f => ![ADDITIONAL_CSV_BASENAME, PAYMENT_CSV_BASENAME].includes(getBaseName(f)));
    
    let totalRowsCount = 0;

    for (const csvFile of mainCsvFiles) {
        const baseName = getBaseName(csvFile);
        if (knownBaseNames.has(baseName)) {
            try {
                const csvPath = path.join(PUBLIC_DIR, csvFile);
                const csvText = await fs.readFile(csvPath, 'utf-8');
                if (!csvText.trim()) continue;
                const data = await parseCsvData(csvText, csvFile, EXPECTED_MAIN_HEADERS);
                totalRowsCount += data.length;
            } catch {
                // ignore file errors
            }
        }
    }

    // 3. Calculate adjusted count
    const { udgr, naud } = userCountConfig;
    const rate = (udgr || 100) / 100;
    const additional = naud || 0;
    const adjustedCount = Math.floor((totalRowsCount * rate) + additional);

    return adjustedCount;
}


export async function GET() {
    try {
        const count = await getUserCount();
        return NextResponse.json({ count });
    } catch (error) {
        console.error('API Error in /api/count:', error);
        return NextResponse.json({ error: 'Failed to load user count.' }, { status: 500 });
    }
}

    