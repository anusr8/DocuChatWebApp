import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

import { validatePassword } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const { email, newPassword } = await request.json();

    if (!email || !newPassword) {
      return NextResponse.json({ error: 'Email and new password are required' }, { status: 400 });
    }

    const validation = validatePassword(newPassword);
    if (!validation.isValid) {
      return NextResponse.json({ 
        error: 'Password policy not met: ' + validation.errors.join(', ') 
      }, { status: 400 });
    }


    const usersRef = adminDb.collection('users');
    const snapshot = await usersRef.where('email', '==', email).get();

    if (snapshot.empty) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userDoc = snapshot.docs[0];
    
    await userDoc.ref.update({
      password: newPassword,
      isFirstLogin: false,
      updatedAt: new Date().toISOString()
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('[Reset Password API Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
