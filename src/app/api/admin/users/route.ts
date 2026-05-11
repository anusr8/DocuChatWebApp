import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const { adminEmail, userEmail, tempPassword } = await request.json();

    if (!adminEmail || !userEmail || !tempPassword) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Authorization check
    if (adminEmail !== 'admin@10xds.com') {
      // Also check firestore to be sure
      const adminSnapshot = await adminDb.collection('users')
        .where('email', '==', adminEmail)
        .where('role', '==', 'admin')
        .get();
      
      if (adminSnapshot.empty) {
        return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
      }
    }

    if (!userEmail.endsWith('@10xds.com')) {
      return NextResponse.json({ error: 'Only @10xds.com email addresses are allowed' }, { status: 400 });
    }

    const usersRef = adminDb.collection('users');

    const validation = validatePassword(tempPassword);
    if (!validation.isValid) {
      return NextResponse.json({ 
        error: 'Initial password policy not met: ' + validation.errors.join(', ') 
      }, { status: 400 });
    }

    // Check if user already exists
    const snapshot = await usersRef.where('email', '==', userEmail).get();
    if (!snapshot.empty) {
      return NextResponse.json({ error: 'User already exists' }, { status: 400 });
    }

    // Create new user
    const newUser = {
      email: userEmail,
      password: tempPassword,
      role: 'user',
      isFirstLogin: true,
      createdAt: new Date().toISOString(),
    };

    const docRef = await usersRef.add(newUser);
    
    return NextResponse.json({ 
      success: true, 
      user: { id: docRef.id, email: newUser.email } 
    });

  } catch (error: any) {
    console.error('[Admin API Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const adminEmail = searchParams.get('adminEmail');

    if (adminEmail !== 'admin@10xds.com') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const usersRef = adminDb.collection('users');
    const snapshot = await usersRef.get();
    
    const users = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({ users });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const adminEmail = searchParams.get('adminEmail');
    const userId = searchParams.get('id');

    if (!adminEmail || !userId) {
      return NextResponse.json({ error: 'Missing adminEmail or userId' }, { status: 400 });
    }

    // Authorization check
    if (adminEmail !== 'admin@10xds.com') {
      const adminSnapshot = await adminDb.collection('users')
        .where('email', '==', adminEmail)
        .where('role', '==', 'admin')
        .get();
      
      if (adminSnapshot.empty) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
    }

    // Prevent deleting the main admin
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (userDoc.exists && userDoc.data()?.email === 'admin@10xds.com') {
      return NextResponse.json({ error: 'Cannot delete the main administrator' }, { status: 400 });
    }

    await adminDb.collection('users').doc(userId).delete();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Admin Delete API Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { validatePassword } from '@/lib/validation';

export async function PATCH(request: Request) {
  try {
    const { adminEmail, userId, action, newValue } = await request.json();

    if (!adminEmail || !userId || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (action === 'reset_password') {
      const validation = validatePassword(newValue);
      if (!validation.isValid) {
        return NextResponse.json({ 
          error: 'Password policy not met: ' + validation.errors.join(', ') 
        }, { status: 400 });
      }
    }


    // Authorization check
    if (adminEmail !== 'admin@10xds.com') {
      const adminSnapshot = await adminDb.collection('users')
        .where('email', '==', adminEmail)
        .where('role', '==', 'admin')
        .get();
      
      if (adminSnapshot.empty) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
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
      await userRef.update({ 
        password: newValue,
        isFirstLogin: true // Force reset on next login
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Admin PATCH API Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


