import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import bcrypt from 'bcryptjs';
import { validatePassword } from '@/lib/validation';
import { getSessionFromRequest } from '@/lib/auth-token';

// ── Helper: verify caller is an admin via session token ────────────────────────
function requireAdmin(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized: valid session token required' }, { status: 401 });
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
  }
  return session; // caller must type-narrow to check it's not a Response
}

// ── POST: create a new user (admin only) ───────────────────────────────────────
export async function POST(request: Request) {
  try {
    const authResult = requireAdmin(request);
    if (authResult instanceof NextResponse) return authResult;

    const { userEmail, tempPassword } = await request.json();

    if (!userEmail || !tempPassword) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!userEmail.endsWith('@10xds.com')) {
      return NextResponse.json({ error: 'Only @10xds.com email addresses are allowed' }, { status: 400 });
    }

    const validation = validatePassword(tempPassword);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: 'Initial password policy not met: ' + validation.errors.join(', ') },
        { status: 400 }
      );
    }

    const usersRef = adminDb.collection('users');

    // Check if user already exists
    const snapshot = await usersRef.where('email', '==', userEmail).get();
    if (!snapshot.empty) {
      return NextResponse.json({ error: 'User already exists' }, { status: 400 });
    }

    // Hash the temporary password before storing
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const newUser = {
      email: userEmail,
      password: hashedPassword,
      role: 'user',
      isFirstLogin: true,
      createdAt: new Date().toISOString(),
    };

    const docRef = await usersRef.add(newUser);

    return NextResponse.json({
      success: true,
      user: { id: docRef.id, email: newUser.email },
    });
  } catch (error: any) {
    console.error('[Admin POST API Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── GET: list all users (admin only) ──────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const authResult = requireAdmin(request);
    if (authResult instanceof NextResponse) return authResult;

    const usersRef = adminDb.collection('users');
    const snapshot = await usersRef.get();

    const users = snapshot.docs.map((doc: any) => {
      const data = doc.data();
      // Never expose the hashed password to the client
      const { password: _pw, ...safeData } = data;
      return { id: doc.id, ...safeData };
    });

    return NextResponse.json({ users });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── DELETE: remove a user (admin only) ────────────────────────────────────────
export async function DELETE(request: Request) {
  try {
    const authResult = requireAdmin(request);
    if (authResult instanceof NextResponse) return authResult;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // Prevent deleting the main admin
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (userDoc.exists && userDoc.data()?.email === 'admin@10xds.com') {
      return NextResponse.json({ error: 'Cannot delete the main administrator' }, { status: 400 });
    }

    await adminDb.collection('users').doc(userId).delete();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Admin DELETE API Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── PATCH: block/unblock or reset password (admin only) ───────────────────────
export async function PATCH(request: Request) {
  try {
    const authResult = requireAdmin(request);
    if (authResult instanceof NextResponse) return authResult;

    const { userId, action, newValue } = await request.json();

    if (!userId || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (action === 'reset_password') {
      const validation = validatePassword(newValue);
      if (!validation.isValid) {
        return NextResponse.json(
          { error: 'Password policy not met: ' + validation.errors.join(', ') },
          { status: 400 }
        );
      }
    }

    const userRef = adminDb.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (action === 'block') {
      const email = userDoc.data()?.email;
      if (email === 'admin@10xds.com') {
        return NextResponse.json({ error: 'Cannot block the main administrator' }, { status: 400 });
      }
      await userRef.update({ blocked: newValue });
    } else if (action === 'reset_password') {
      const hashedPassword = await bcrypt.hash(newValue, 12);
      await userRef.update({
        password: hashedPassword,
        isFirstLogin: true, // Force reset on next login
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Admin PATCH API Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
