
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const USERID_CONF_FILENAME = 'userid.conf';

const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'default-secret-key-for-development-must-be-changed';
if (process.env.NODE_ENV === 'production' && JWT_SECRET_KEY === 'default-secret-key-for-development-must-be-changed') {
    console.error('CRITICAL: JWT_SECRET_KEY is not set in production environment.');
}
const key = new TextEncoder().encode(JWT_SECRET_KEY);

export async function encrypt(payload: any) {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1d') // 1-day session
        .sign(key);
}

export async function decrypt(input: string): Promise<any> {
    try {
        const { payload } = await jwtVerify(input, key, {
            algorithms: ['HS256'],
        });
        return payload;
    } catch (e) {
        // This includes expired tokens or invalid signatures
        return null;
    }
}


export async function POST(request: Request) {
    try {
        const { pin } = await request.json();

        if (!pin) {
            return NextResponse.json({ error: 'PIN is required.' }, { status: 400 });
        }

        // --- Fetch and parse userid.conf ---
        const pinConfigPath = path.join(PUBLIC_DIR, USERID_CONF_FILENAME);
        const pinConfigText = await fs.readFile(pinConfigPath, 'utf-8');
        const pinConfig = new Map(
            pinConfigText
              .split('\n')
              .filter(Boolean)
              .map((line) => {
                const parts = line.split('=');
                const user = parts[0]?.trim();
                const userPin = parts.slice(1).join('=').trim();
                return [userPin, user];
              })
              .filter((tuple): tuple is [string, string] => Boolean(tuple[0] && tuple[1]))
        );

        const userRole = pinConfig.get(pin.trim());

        if (!userRole) {
            return NextResponse.json({ error: 'Incorrect PIN.' }, { status: 401 });
        }

        // --- Create session and set cookie ---
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        const session = await encrypt({ role: userRole, expires });

        cookies().set('session', session, { expires, httpOnly: true, secure: process.env.NODE_ENV === 'production' });

        return NextResponse.json({ success: true, role: userRole });

    } catch (error) {
        console.error('Login API Error:', error);
        return NextResponse.json({ error: 'Authentication failed. Please try again.' }, { status: 500 });
    }
}
