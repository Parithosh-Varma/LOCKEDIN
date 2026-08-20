import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { logger } from "../lib/logger.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const APP_PASSWORD = process.env.APP_PASSWORD || "lockedin-dev";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function ensureUser(): Promise<number> {
  // single-user personal system: auto-create the default user on first boot
  const [user] = await db.select().from(schema.users).limit(1);
  if (user) return user.id;
  const hash = await bcrypt.hash(APP_PASSWORD, 10);
  const [created] = await db
    .insert(schema.users)
    .values({ email: "student@lockedin.local", passwordHash: hash, name: "Student" })
    .returning();
  await db.insert(schema.settings).values({ userId: created.id });
  await db.insert(schema.subjects).values([
    { userId: created.id, name: "Physics", color: "#6366f1", priority: 70 },
    { userId: created.id, name: "Chemistry", color: "#10b981", priority: 60 },
    { userId: created.id, name: "Mathematics", color: "#f59e0b", priority: 65 },
  ]);
  logger.info("Created default user + settings + subjects");
  return created.id;
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthUser;
  } catch {
    return null;
  }
}

export async function login(password: string): Promise<{ token?: string; error?: string }> {
  const userId = await ensureUser();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return { error: "Wrong password" };
  return { token: signToken({ id: user.id, email: user.email, name: user.name }) };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.user = user;
  next();
}

export async function resolveUserId(req: Request): Promise<number> {
  if (req.user) return req.user.id;
  return ensureUser();
}

// keep logger import used (non-secret sanitization helper)
export { logger };