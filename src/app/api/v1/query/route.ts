
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { addMonths, addYears, format, parse as parseDate, isValid as isValidDate } from 'date-fns';

interface CsvRow {
    [key: string]: string;
}

interface DataSource {
    baseName: string;
    dataMap: Map<string, CsvRow>;
}

interface ExpiredAccountInfo {
  email: string;
  organization: string;
  approver: string;
  expirationDate: string;
}

interface UserCountConfig {
    udgr: number; // User data growth rate
    naud: number; // Number of additional user data
}

interface AppData {
    dataSources: DataSource[];
    additionalMap: Map<string, CsvRow>;
    confData: Map<string, { orgName: string; subDetails: string }>;
}

// --- Singleton Pattern for Data Caching ---
let cachedData: AppData | null = null;
let dataPromise: Promise<AppData> | null = null;
let apiKey: string | null = null;

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const EXPECTED_MAIN_HEADERS = ['Email', 'Product Configurations'];
const EXPECTED_ADDITIONAL_HEADERS = ['Email', 'Approver', 'rat', 'pov', 'Org'];
const ADDITIONAL_CSV_BASENAME = 'additional';
const USER_CONF_FILENAME = 'user.conf';
const API_PWD_FILENAME = 'apipwd.conf';

async function getApiKey(): Promise<string> {
    if (apiKey) return apiKey;
    try {
        const apiKeyPath = path.join(PUBLIC_DIR, API_PWD_FILENAME);
        const key = (await fs.readFile(apiKeyPath, 'utf-8')).trim();
        if (!key) throw new Error(`${API_PWD_FILENAME} is empty.`);
        apiKey = key;
        return apiKey;
    } catch (error) {
        console.error(`CRITICAL: Could not read API key from ${API_PWD_FILENAME}.`, error);
        // In a real scenario, you might want to prevent the app from starting.
        // For this context, we'll let requests fail with an internal server error.
        throw new Error('API key is not configured.');
    }
}


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
        const cleanText = text.startsWith('\uFEFF') ? text.substring(1) : text;
        const lines = cleanText.trim().split(/\r?\n/);

        if (lines.length === 0 || !lines[0]?.trim()) return [];

        const headers = parseCsvLine(lines[0]).map(h => h.trim()).filter(Boolean);
        if (headers.length === 0) {
            console.warn(`Skipping ${filePathForLogging} due to invalid or empty header line.`);
            return [];
        }

        const lowerCaseHeaders = headers.map(h => h.toLowerCase());
        const missingHeaders = expectedHeaders.filter(eh => !lowerCaseHeaders.includes(eh.toLowerCase()));
        
        const isAdditionalFile = filePathForLogging.includes(ADDITIONAL_CSV_BASENAME);
        const isOrgHeaderOptional = isAdditionalFile && missingHeaders.every(h => h.toLowerCase() === 'org');

        if (missingHeaders.length > 0 && !isOrgHeaderOptional) {
           console.warn(`Missing headers in ${filePathForLogging}: ${missingHeaders.join(', ')}. Skipping file.`);
           return []; // Skip file if required headers are missing
        }

        if (lines.length === 1) return [];

        const data: CsvRow[] = [];
        const emailHeaderName = headers.find(h => h.toLowerCase() === 'email');
        if (!emailHeaderName) {
            console.warn(`Required 'Email' column not found in ${filePathForLogging}. Skipping file.`);
            return [];
        }

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line || /^\s*,*\s*$/.test(line)) continue;
            try {
                const values = parseCsvLine(line);
                if (values.length < headers.length) {
                    console.warn(`Line ${i + 1} in ${filePathForLogging} seems malformed. It has ${values.length} columns, expected ${headers.length}. Skipping. Line: "${line}"`);
                    continue;
                }

                const row: CsvRow = {};
                let rowHasData = false;

                const emailIndex = headers.indexOf(emailHeaderName);
                if (emailIndex === -1 || !values[emailIndex]) {
                     continue;
                }
                
                headers.forEach((header, index) => {
                    const value = (values[index] ?? '').trim();
                    row[header] = value;
                    if (value) rowHasData = true;
                });

                if (rowHasData) data.push(row);

            } catch (lineError) {
                console.warn(`Could not parse line ${i + 1} in ${filePathForLogging}. Skipping. Line: "${line}"`, lineError);
            }
        }
        return data;
    } catch (parseError) {
        console.error(`Error parsing CSV from ${filePathForLogging}:`, parseError);
        return [];
    }
}


const getBaseName = (filePath: string): string => {
    const fileName = path.basename(filePath, '.csv');
    return fileName.match(/^([a-zA-Z0-9]+)/)?.[1] ?? '';
};

async function loadAndProcessData(): Promise<AppData> {
    console.log("--- V1 API: Loading and processing data for the first time ---");
    const publicFiles = await fs.readdir(PUBLIC_DIR).catch(err => {
        console.error("Could not read public directory:", err);
        return [];
    });

    const confFiles = publicFiles.filter(f => f.endsWith('.conf') && f !== USER_CONF_FILENAME && f !== API_PWD_FILENAME);
    const confData = new Map<string, { orgName: string; subDetails: string }>();
    const knownBaseNames = new Set<string>();

    for (const confFile of confFiles) {
        const baseName = getBaseName(confFile);
        try {
            const confPath = path.join(PUBLIC_DIR, confFile);
            const text = await fs.readFile(confPath, 'utf-8');
            const [orgName, ...subDetailsParts] = text.split(',');
            if (orgName && subDetailsParts.length > 0) {
                confData.set(baseName, { orgName: orgName.trim(), subDetails: subDetailsParts.join(',').trim() });
                knownBaseNames.add(baseName);
            }
        } catch (err) {
            console.warn(`Could not load or parse conf file: ${confFile}`, err);
        }
    }

    const csvFiles = publicFiles.filter(f => f.endsWith('.csv'));
    const mainCsvFiles = csvFiles.filter(f => getBaseName(f) !== ADDITIONAL_CSV_BASENAME);
    const additionalCsvFile = csvFiles.find(f => getBaseName(f) === ADDITIONAL_CSV_BASENAME);
    
    const groupedData = new Map<string, CsvRow[]>();
    
    for (const csvFile of mainCsvFiles) {
        const baseName = getBaseName(csvFile);
        if (knownBaseNames.has(baseName)) {
            try {
                const csvPath = path.join(PUBLIC_DIR, csvFile);
                const csvText = await fs.readFile(csvPath, 'utf-8');
                if (!csvText.trim()) continue;

                const data = await parseCsvData(csvText, csvFile, EXPECTED_MAIN_HEADERS);
                 if(data.length > 0) {
                    const existingData = groupedData.get(baseName) || [];
                    groupedData.set(baseName, existingData.concat(data));
                }
            } catch (err) {
                console.warn(`Could not load or parse main CSV: ${csvFile}`, err);
            }
        }
    }

    const dataSources: DataSource[] = Array.from(groupedData.entries()).map(([baseName, data]) => {
        const dataMap = new Map<string, CsvRow>();
        data.forEach(row => {
            const emailKey = row['Email']?.trim().toLowerCase();
            if (emailKey) dataMap.set(emailKey, row);
        });
        return { baseName, dataMap };
    });

    let additionalMap = new Map<string, CsvRow>();
    if (additionalCsvFile) {
        try {
            const csvPath = path.join(PUBLIC_DIR, additionalCsvFile);
            const csvText = await fs.readFile(csvPath, 'utf-8');
            if (csvText.trim()) {
                const data = await parseCsvData(csvText, additionalCsvFile, EXPECTED_ADDITIONAL_HEADERS);
                data.forEach(row => {
                    const key = row['Email']?.trim().toLowerCase();
                    if (key) additionalMap.set(key, row);
                });
            }
        } catch (err) {
            console.warn(`Could not load additional CSV: ${additionalCsvFile}`, err);
        }
    }

    return { dataSources, additionalMap, confData };
}

function getData(): Promise<AppData> {
    if (cachedData) {
        return Promise.resolve(cachedData);
    }
    if (dataPromise) {
        return dataPromise;
    }
    dataPromise = loadAndProcessData().then(data => {
        cachedData = data;
        return data;
    }).catch(err => {
        dataPromise = null; 
        throw err;
    });
    return dataPromise;
}

const calculateExpirationDate = (approvalDateStr: string | undefined, validityPeriod: string | undefined): string => {
    if (!approvalDateStr || !validityPeriod || approvalDateStr === '-' || validityPeriod === '-' || approvalDateStr.trim().toLowerCase() === 'rolling') {
        if (approvalDateStr?.trim().toLowerCase() === 'rolling') return 'Rolling';
        return '-';
    }
    try {
        let approvalDate = parseDate(approvalDateStr.trim(), 'yyyyMMdd', new Date());
        if (!isValidDate(approvalDate)) return '-';
        const periodMatch = validityPeriod.trim().toLowerCase().match(/^(\d+)([my])$/);
        if (!periodMatch) return '-';
        const amount = parseInt(periodMatch[1], 10);
        const unit = periodMatch[2];
        const expirationDateValue = unit === 'y' ? addYears(approvalDate, amount) : addMonths(approvalDate, amount);
        return format(expirationDateValue, 'yyyyMMdd');
    } catch {
        return '-';
    }
};

async function performFuzzySearch(searchTerm: string, appData: AppData) {
    if (searchTerm.length < 3) {
        return NextResponse.json({ error: `Fuzzy search requires at least 3 characters. / 模糊搜索至少需要3个字符。` }, { status: 400 });
    }
    
    let found = false;
    for (const ds of appData.dataSources) {
        for (const key of ds.dataMap.keys()) {
            if (key.includes(searchTerm)) {
                found = true;
                break;
            }
        }
        if(found) break;
    }
    if (!found) {
        for (const key of appData.additionalMap.keys()) {
            if (key.includes(searchTerm)) {
                found = true;
                break;
            }
        }
    }

    if (found) {
        return NextResponse.json({ message: `Potential matches found. Please enter a more specific or full email address for an exact search. / 找到潜在匹配项。请输入更完整或具体的邮箱地址以进行精确搜索。` });
    } else {
        return NextResponse.json({ error: `No potential matches found for "${searchTerm}". / 未找到 "${searchTerm}" 的可能匹配项。` }, { status: 404 });
    }
}

function performExactSearch(email: string, appData: AppData) {
    const { dataSources, additionalMap, confData } = appData;
    const lowerCaseEmail = email.toLowerCase();
    
    let result = {
        email: email,
        status: 'Invalid' as 'Valid' | 'Invalid',
        organization: '-',
        subscriptionDetails: '-',
        deviceLimit: 0,
        approver: '-',
        approvalDate: '-',
        expirationDate: '-',
    };

    const foundInOrgs = dataSources.filter(({ dataMap }) => dataMap.has(lowerCaseEmail))
        .map(({ baseName }) => confData.get(baseName))
        .filter(Boolean) as { orgName: string; subDetails: string }[];

    if (foundInOrgs.length > 0) {
        result.status = 'Valid';
        result.organization = foundInOrgs.map(org => org.orgName).join(' & ');
        result.subscriptionDetails = foundInOrgs.map(org => org.subDetails).join(' & ');
        result.deviceLimit = foundInOrgs.length === 1 ? 2 : (foundInOrgs.length >= 2 ? 4 : 0);
        result.expirationDate = 'Rolling'; // Default for main CSV
    }

    const additionalMatch = additionalMap.get(lowerCaseEmail);
    if (additionalMatch) {
        const rawApprovalDate = additionalMatch['rat']?.trim();
        const validityPeriod = additionalMatch['pov']?.trim();
        const calculatedExpDate = calculateExpirationDate(rawApprovalDate, validityPeriod);
        const orgFromFile = additionalMatch['Org']?.trim();

        if (result.status === 'Invalid' && calculatedExpDate && calculatedExpDate !== '-') {
             const baseName = orgFromFile ? getBaseName(orgFromFile) : '';
             const conf = confData.get(baseName);
            
            if (conf) {
                result.status = 'Valid';
                result.deviceLimit = 2;
                result.organization = conf.orgName;
                result.subscriptionDetails = conf.subDetails;
            }
        }
        
        if (orgFromFile) {
             const baseName = getBaseName(orgFromFile);
             const conf = confData.get(baseName);
             result.organization = conf?.orgName || orgFromFile;
        }

        result.approver = additionalMatch['Approver']?.trim() || '-';
        result.approvalDate = rawApprovalDate || '-';
        if (calculatedExpDate && calculatedExpDate !== '-') {
            result.expirationDate = calculatedExpDate;
        }
    }

    if (result.status === 'Invalid') {
        result.organization = '-';
        result.deviceLimit = 0;
        result.subscriptionDetails = '-';
        result.expirationDate = '-';
        result.approver = '-';
        result.approvalDate = '-';
    }

    return NextResponse.json(result);
}

// Universal request handler
async function handleRequest(request: Request, action: (appData: AppData) => Promise<NextResponse> | NextResponse) {
    try {
        const expectedApiKey = await getApiKey();
        const authHeader = request.headers.get('Authorization');
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized: Missing or invalid Authorization header.' }, { status: 401 });
        }
        
        const providedKey = authHeader.substring(7); // "Bearer ".length
        if (providedKey !== expectedApiKey) {
            return NextResponse.json({ error: 'Unauthorized: Invalid API Key.' }, { status: 401 });
        }

        const appData = await getData();
        return await action(appData);

    } catch (error) {
        console.error('API Error:', error);
        if (error instanceof Error && error.message.includes('API key')) {
             return NextResponse.json({ error: 'Server configuration error: API key not available.' }, { status: 500 });
        }
        return NextResponse.json({ error: 'Server error processing your request.' }, { status: 500 });
    }
}


export async function POST(request: Request) {
    return handleRequest(request, async () => {
        const { email, type } = await request.json();
        if (!email || !type) {
            return NextResponse.json({ error: 'Missing email or type in request body.' }, { status: 400 });
        }
        
        const appData = await getData();

        if (type === 'fuzzy') {
            return await performFuzzySearch(email.trim().toLowerCase(), appData);
        }
        
        if (type === 'exact') {
            return performExactSearch(email.trim().toLowerCase(), appData);
        }

        return NextResponse.json({ error: `Invalid search type: ${type}`}, { status: 400 });
    });
}


async function getExpiredAccounts(appData: AppData): Promise<ExpiredAccountInfo[]> {
    const { additionalMap, dataSources } = appData;
    const expiredAccounts: ExpiredAccountInfo[] = [];
    const today = format(new Date(), 'yyyyMMdd');

    for (const [email, row] of additionalMap.entries()) {
        const approvalDate = row['rat'];
        const validityPeriod = row['pov'];
        const expirationDate = calculateExpirationDate(approvalDate, validityPeriod);

        if (expirationDate && expirationDate !== '-' && expirationDate !== 'Rolling' && expirationDate <= today) {
            const isInMainSource = dataSources.some(ds => ds.dataMap.has(email));
            
            if (isInMainSource) {
                expiredAccounts.push({
                    email: email,
                    organization: (row['Org'] || 'Unknown'),
                    approver: row['Approver'] || '-',
                    expirationDate: expirationDate,
                });
            }
        }
    }
    return expiredAccounts;
}

async function getUserCount() {
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
        // This is not a critical error, so we just warn and continue with defaults.
        console.warn(`${USER_CONF_FILENAME} not found or could not be parsed. Using default values.`);
    }

    const { dataSources } = await getData();
    const totalRowsCount = dataSources.reduce((sum, ds) => sum + ds.dataMap.size, 0);

    const { udgr, naud } = userCountConfig;
    const rate = (udgr || 100) / 100;
    const additional = naud || 0;
    const adjustedCount = Math.floor((totalRowsCount * rate) + additional);

    return NextResponse.json({ count: adjustedCount });
}

export async function GET(request: Request) {
     return handleRequest(request, async (appData) => {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type');

        if (type === 'count') {
            // The dynamic count logic for public API is now handled by the new /api/count endpoint.
            // This is kept for backward compatibility but may be stale.
            return await getUserCount();
        }
        
        if (type === 'expired') {
            const expiredAccounts = await getExpiredAccounts(appData);
            return NextResponse.json({ expiredAccounts });
        }

        return NextResponse.json({ message: "API is running. Use POST for searching or GET with 'type=count' or 'type=expired'." });
    });
}
