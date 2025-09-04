
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decrypt } from './../login/route';

export async function GET() {
    const sessionCookie = cookies().get('session')?.value;

    if (!sessionCookie) {
        return NextResponse.json({ user: null }, { status: 401 });
    }

    const session = await decrypt(sessionCookie);

    if (!session?.role) {
         return NextResponse.json({ user: null }, { status: 401 });
    }

    return NextResponse.json({ user: { role: session.role } });
}
