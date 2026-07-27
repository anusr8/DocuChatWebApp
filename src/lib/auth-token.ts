import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'docuchat-fallback-secret-change-in-production';

export interface SessionPayload {
  userId: string;
  email: string;
  role: string;
}

/**
 * Creates a signed JWT session token for a user.
 */
export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
}

/**
 * Verifies a JWT session token and returns the payload.
 * Returns null if the token is invalid or expired.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Extracts and verifies the session token from a Request's Authorization header.
 * Returns the payload if valid, or null otherwise.
 */
export function getSessionFromRequest(request: Request): SessionPayload | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7);
  return verifySessionToken(token);
}
