import { compare, hash } from "bcryptjs";

const passwordHashRounds = 12;

export function isValidPassword(password: string) {
  return password.length >= 8;
}

export function isValidPairingPin(pin: string) {
  return pin.length >= 8 && /[A-Za-z]/.test(pin) && /\d/.test(pin);
}

export function pairingPinStrength(pin: string) {
  if (!pin) return "Enter a memorable PIN with letters and numbers.";
  if (pin.length < 8) return "Use at least 8 characters.";
  if (!/[A-Za-z]/.test(pin) || !/\d/.test(pin)) {
    return "Include at least one letter and one number.";
  }
  if (pin.length >= 12) return "Strong memorable PIN.";
  return "Good memorable PIN.";
}

export async function hashPassword(password: string) {
  if (!isValidPassword(password)) {
    throw new Error("Password must contain at least 8 characters.");
  }

  return hash(password, passwordHashRounds);
}

export async function verifyPassword(password: string, passwordHash: string) {
  if (!password || !passwordHash) return false;
  return compare(password, passwordHash);
}

export async function hashPairingPin(pin: string) {
  if (!isValidPairingPin(pin)) {
    throw new Error("PIN must be at least 8 characters and include a letter and a number.");
  }

  return hash(pin, passwordHashRounds);
}

export async function verifyPairingPin(pin: string, pinHash: string) {
  return verifyPassword(pin, pinHash);
}
