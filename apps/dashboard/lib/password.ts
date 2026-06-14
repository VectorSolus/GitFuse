import { compare, hash } from "bcryptjs";

const passwordHashRounds = 12;

export function isValidPassword(password: string) {
  return password.length >= 8;
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
