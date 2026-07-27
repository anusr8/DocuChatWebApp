import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import bcrypt from 'bcryptjs';
import { validatePassword } from '@/lib/validation';
import { getSessionFromRequest } from '@/lib/auth-token';

export async function POST(request: Request) {
  try {
    // The user must be authenticated (have a valid session token) to reset their own password.
    // This prevents anyone from resetting a random user's password without being logged in.
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized: valid session required' }, { status: 401 });
    }

    const { newPassword } = await request.json();

    if (!newPassword) {
      return NextResponse.json({ error: 'New password is required' }, { status: 400 });
    }

    const validation = validatePassword(newPassword);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: 'Password policy not met: ' + validation.errors.join(', ') },
        { status: 400 }
      );
    }

    // Use the authenticated session's email — do NOT trust email from request body
    const email = session.email;

    const usersRef = adminDb.collection('users');
    const snapshot = await usersRef.where('email', '==', email).get();

    if (snapshot.empty) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userDoc = snapshot.docs[0];

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await userDoc.ref.update({
      password: hashedPassword,
      isFirstLogin: false,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Reset Password API Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
