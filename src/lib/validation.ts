export const passwordPolicy = {
  minLength: 8,
  hasUpperCase: (pw: string) => /[A-Z]/.test(pw),
  hasLowerCase: (pw: string) => /[a-z]/.test(pw),
  hasNumber: (pw: string) => /[0-9]/.test(pw),
  hasSpecialChar: (pw: string) => /[!@#$%^&*(),.?":{}|<>]/.test(pw),
};

export function validatePassword(password: string) {
  const errors = [];
  if (password.length < passwordPolicy.minLength) errors.push(`At least ${passwordPolicy.minLength} characters`);
  if (!passwordPolicy.hasUpperCase(password)) errors.push('At least one uppercase letter');
  if (!passwordPolicy.hasLowerCase(password)) errors.push('At least one lowercase letter');
  if (!passwordPolicy.hasNumber(password)) errors.push('At least one number');
  if (!passwordPolicy.hasSpecialChar(password)) errors.push('At least one special character');
  
  return {
    isValid: errors.length === 0,
    errors
  };
}
