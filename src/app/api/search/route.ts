
import { NextResponse, type NextRequest } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { addMonths, addYears, format, parse as parseDate, isValid as isValidDate } from 'date-fns';
import { decrypt } from './../login/route';
import { cookies } from 'next/headers';

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

interface QuickAuditAccountInfo {
    email: string;
    rat: string;
    approver: string;
    pov: string;
    reason: 'Not Registered' | 'Not Paid';
}

interface UserCountConfig {
    udgr: number; // User data growth rate
    naud: number; // Number of additional user data
}

interface AppData {
    dataSources: DataSource[];
    additionalMap: Map<string, CsvRow>;
    paymentMap: Map<string, CsvRow>;
    confData: Map<string, { orgName: string; subDetails: string }>;
}

// --- Singleton Pattern for Data Caching ---
let cachedData: AppData | null = null;
let dataPromise: Promise<AppData> | null = null;

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const EXPECTED_MAIN_HEADERS = ['Email', 'Product Configurations'];
const EXPECTED_ADDITIONAL_HEADERS = ['Email', 'Approver', 'rat', 'pov', 'Org'];
const EXPECTED_PAYMENT_HEADERS = ['Email', 'PaymentDate', 'Approver', 'pov'];

const ADDITIONAL_CSV_BASENAME = 'additional';
const PAYMENT_CSV_BASENAME = 'payment';
const USER_CONF_FILENAME = 'user.conf';
const USERID_CONF_FILENAME = 'userid.conf';

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
        // Throwing here might be too aggressive for production, let's return empty and log
        return [];
    }
}


const getBaseName = (filePath: string): string => {
    const fileName = path.basename(filePath, '.csv');
    return fileName.match(/^([a-zA-Z0-9]+)/)?.[1] ?? '';
};

async function loadAndProcessData(): Promise<AppData> {
    console.log("--- Loading and processing data for the first time ---");
    const publicFiles = await fs.readdir(PUBLIC_DIR).catch(err => {
        console.error("Could not read public directory:", err);
        return [];
    });
    
    const confFiles = publicFiles.filter(f => f.endsWith('.conf') && f !== USER_CONF_FILENAME && f !== USERID_CONF_FILENAME);
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
    const mainCsvFiles = csvFiles.filter(f => ![ADDITIONAL_CSV_BASENAME, PAYMENT_CSV_BASENAME].includes(getBaseName(f)));
    const additionalCsvFile = csvFiles.find(f => getBaseName(f) === ADDITIONAL_CSV_BASENAME);
    const paymentCsvFile = csvFiles.find(f => getBaseName(f) === PAYMENT_CSV_BASENAME);
    
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
    
    let paymentMap = new Map<string, CsvRow>();
    if (paymentCsvFile) {
        try {
            const csvPath = path.join(PUBLIC_DIR, paymentCsvFile);
            const csvText = await fs.readFile(csvPath, 'utf-8');
            if (csvText.trim()) {
                const data = await parseCsvData(csvText, paymentCsvFile, EXPECTED_PAYMENT_HEADERS);
                data.forEach(row => {
                    const key = row['Email']?.trim().toLowerCase();
                    if (key) paymentMap.set(key, row);
                });
            }
        } catch (err) {
            console.warn(`Could not load payment CSV: ${paymentCsvFile}`, err);
        }
    }

    return { dataSources, additionalMap, paymentMap, confData };
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
        dataPromise = null; // Allow retry on failure
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

export async function POST(request: Request) {
    try {
        const { email: searchEmail, type } = await request.json();
        const appData = await getData();

        if (type === 'fuzzy') {
            const searchTerm = searchEmail.trim().toLowerCase();
            if (searchTerm.length < 3) {
                 return NextResponse.json({ error: `Fuzzy search requires at least 3 characters. / 模糊搜索至少需要3个字符。` });
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
                return NextResponse.json({ error: `No potential matches found for "${searchEmail}". / 未找到 "${searchEmail}" 的可能匹配项。` });
            }
        }
        
        const lowerCaseEmail = searchEmail.trim().toLowerCase();
        const result = performExactSearch(lowerCaseEmail, appData);
        return NextResponse.json(result);

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Server error processing your request.' }, { status: 500 });
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
        result.expirationDate = 'Rolling'; // Default for main main
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

    return result;
}

async function getExpiredAccounts(appData: AppData, approverFilter?: string | null): Promise<ExpiredAccountInfo[]> {
    const { additionalMap, dataSources } = appData;
    let expiredAccounts: ExpiredAccountInfo[] = [];
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

    if (approverFilter && approverFilter.toLowerCase() !== 'admin') {
        expiredAccounts = expiredAccounts.filter(account => 
            account.approver.toLowerCase() === approverFilter.toLowerCase()
        );
    }
    return expiredAccounts;
}


async function getQuickAuditAccounts(appData: AppData): Promise<QuickAuditAccountInfo[]> {
    const { dataSources, additionalMap, paymentMap } = appData;
    const auditAccounts: QuickAuditAccountInfo[] = [];
    const addedEmails = new Set<string>();

    const NOT_PAID_DATE_THRESHOLD = 20250724;

    // --- Independent "Not Paid" Audit ---
    for (const [email, additionalInfo] of additionalMap.entries()) {
        const ratStr = additionalInfo['rat']?.trim();
        const ratNum = ratStr ? parseInt(ratStr, 10) : 0;
        if (!ratNum || ratNum < NOT_PAID_DATE_THRESHOLD) {
            continue;
        }

        const isInMainSource = dataSources.some(ds => ds.dataMap.has(email));
        if (!isInMainSource) {
            continue;
        }

        if (!paymentMap.has(email)) {
            auditAccounts.push({
                email: email,
                rat: ratStr || '-',
                approver: additionalInfo['Approver']?.trim() || '-',
                pov: additionalInfo['pov']?.trim() || '-',
                reason: 'Not Paid',
            });
            addedEmails.add(email);
        }
    }

    // --- Independent "Not Registered" Audit ---
    const excludedBaseNames = ['blueskyy', 'parvis'];
    for (const dataSource of dataSources) {
        if (excludedBaseNames.includes(dataSource.baseName)) {
            continue;
        }

        for (const email of dataSource.dataMap.keys()) {
            if (addedEmails.has(email)) {
                continue; 
            }
            if (!additionalMap.has(email)) {
                 auditAccounts.push({
                    email: email,
                    rat: '-', 
                    approver: '-',
                    pov: '-',
                    reason: 'Not Registered',
                });
                addedEmails.add(email);
            }
        }
    }

    return auditAccounts;
}

async function getProxyData(appData: AppData, approverFilter: string) {
    const { additionalMap, dataSources } = appData;
    
    let allAccounts = Array.from(additionalMap.values());

    if (approverFilter.toLowerCase() !== 'admin') {
        allAccounts = allAccounts.filter(account => 
            (account['Approver'] || '').toLowerCase() === approverFilter.toLowerCase()
        );
    }

    const qaResults = await getQuickAuditAccounts(appData);
    const qaMap = new Map(qaResults.map(item => [item.email, item.reason]));

    const proxyData = allAccounts.map(row => {
        const email = (row['Email'] || '').toLowerCase();
        if (!email) return null;

        const searchResult = performExactSearch(email, appData);
        if (searchResult.status === 'Invalid') {
            return null; // Exclude invalid users from the proxy data
        }

        let tag = '';

        // Expired check first
        const expirationDate = calculateExpirationDate(row['rat'], row['pov']);
        if (expirationDate && expirationDate !== '-' && expirationDate !== 'Rolling' && expirationDate <= format(new Date(), 'yyyyMMdd')) {
            const isInMainSource = dataSources.some(ds => ds.dataMap.has(email));
            if (isInMainSource) {
                tag = 'Authorization Expired';
            }
        }

        // QA check second, only if not expired
        if (!tag && qaMap.has(email)) {
            tag = qaMap.get(email)!;
        }
        
        return {
            ...searchResult,
            tag,
        };
    }).filter((account): account is NonNullable<typeof account> => account !== null);

    return proxyData;
}


export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    
    try {
        if (type === 'count') {
            // This endpoint is now deprecated in favor of /api/count for dynamic counting.
            // Returning a static/cached message to avoid breaking old clients if any.
            return NextResponse.json({ message: "This count method is deprecated. Please use the new /api/count endpoint." });
        }
        
        const appData = await getData();
        
        const sessionCookie = cookies().get('session')?.value;
        const session = await decrypt(sessionCookie);

        if (!session?.role) {
            return NextResponse.json({ error: "Unauthorized: Invalid session." }, { status: 401 });
        }
        const approverRole = session.role;


        if (type === 'expired') {
            const expiredAccounts = await getExpiredAccounts(appData, approverRole);
            return NextResponse.json({ expiredAccounts, role: approverRole });
        }
        
        if (type === 'qa') {
            let qaAccounts = await getQuickAuditAccounts(appData);
            if(approverRole !== 'admin') {
                qaAccounts = qaAccounts.filter(acc => acc.approver.toLowerCase() === approverRole.toLowerCase());
            }
            return NextResponse.json({ qaAccounts, role: approverRole });
        }

        if (type === 'proxy') {
            const proxyData = await getProxyData(appData, approverRole);
            return NextResponse.json({ proxyData, role: approverRole });
        }

    } catch (error) {
        console.error('API Error during GET:', error);
        return NextResponse.json({ error: 'Failed to load data.' }, { status: 500 });
    }
    
    return NextResponse.json({ message: "API is running. Use POST for searching or GET with 'type=count'." });
}

    