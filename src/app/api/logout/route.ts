
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
    try {
        cookies().set('session', '', { expires: new Date(0) });
        return NextResponse.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout API Error:', error);
        return NextResponse.json({ error: 'Logout failed.' }, { status: 500 });
    }
}
