import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { validatePassword } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const { action, email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    if (!email.endsWith('@10xds.com')) {
      return NextResponse.json({ error: 'Only @10xds.com email addresses are allowed' }, { status: 403 });
    }

    const usersRef = adminDb.collection('users');

    if (action === 'signup') {

      const validation = validatePassword(password);
      if (!validation.isValid) {
        return NextResponse.json({ 
          error: 'Password policy not met: ' + validation.errors.join(', ') 
        }, { status: 400 });
      }
      
      // Check if user already exists
      const snapshot = await usersRef.where('email', '==', email).get();
      if (!snapshot.empty) {
        return NextResponse.json({ error: 'User already exists' }, { status: 400 });
      }

      // Create new user
      const newUser = {
        email,
        password, // In production, ALWAYS hash passwords!
        createdAt: new Date().toISOString(),
      };
      const docRef = await usersRef.add(newUser);
      
      return NextResponse.json({ 
        success: true, 
        user: { id: docRef.id, email: newUser.email } 
      });
    } 
    
    if (action === 'login') {
      // Find user
      const snapshot = await usersRef.where('email', '==', email).where('password', '==', password).get();
      
      if (snapshot.empty) {
        return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
      }

      const userDoc = snapshot.docs[0];
      const userData = userDoc.data();

      // Check if blocked
      if (userData.blocked) {
        return NextResponse.json({ error: 'This account has been suspended. Please contact the administrator.' }, { status: 403 });
      }


      return NextResponse.json({ 
        success: true, 
        requiresPasswordReset: userData.isFirstLogin || false,
        user: { 
          id: userDoc.id, 
          email: userData.email,
          role: userData.role || 'user'
        } 
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('[Auth API Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
