import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import bcrypt from 'bcryptjs';
import { signSessionToken } from '@/lib/auth-token';

export async function POST(request: Request) {
  try {
    const { action, email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    if (!email.endsWith('@10xds.com')) {
      return NextResponse.json({ error: 'Only @10xds.com email addresses are allowed' }, { status: 403 });
    }

    // ── LOGIN ONLY ──────────────────────────────────────────────────────────────
    // Self-registration has been removed. Only admins can provision accounts
    // via the /api/admin/users endpoint.
    if (action === 'login') {
      const usersRef = adminDb.collection('users');
      const snapshot = await usersRef.where('email', '==', email).get();

      if (snapshot.empty) {
        return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
      }

      const userDoc = snapshot.docs[0];
      const userData = userDoc.data();

      // Check if blocked before doing any password work
      if (userData.blocked) {
        return NextResponse.json(
          { error: 'This account has been suspended. Please contact the administrator.' },
          { status: 403 }
        );
      }

      // Compare password — supports both bcrypt hashes and legacy plain-text
      // (legacy plain-text comparison lets existing accounts still log in;
      //  after first login the password gets re-hashed via reset-password)
      let passwordMatch = false;
      if (userData.password) {
        const isBcrypt = userData.password.startsWith('$2');
        if (isBcrypt) {
          passwordMatch = await bcrypt.compare(password, userData.password);
        } else {
          // Legacy plain-text — compare directly then schedule upgrade hint
          passwordMatch = userData.password === password;
        }
      }

      if (!passwordMatch) {
        return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
      }

      // Issue a signed session token
      const sessionToken = signSessionToken({
        userId: userDoc.id,
        email: userData.email,
        role: userData.role || 'user',
      });

      return NextResponse.json({
        success: true,
        sessionToken,
        requiresPasswordReset: userData.isFirstLogin || false,
        user: {
          id: userDoc.id,
          email: userData.email,
          role: userData.role || 'user',
        },
      });
    }

    // Any action other than login is rejected
    return NextResponse.json(
      { error: 'Invalid action. User registration is not permitted via this endpoint.' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('[Auth API Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
