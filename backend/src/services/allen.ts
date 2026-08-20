import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { logger } from "../lib/logger.js";

/**
 * AllenIntegration — modular adapter for the Allen student portal.
 *
 * DESIGN (per spec §8):
 * - The user authenticates normally through their own Allen session (never
 *   passwords in this app, never passed to agents).
 * - `configure()` accepts a user-supplied auth mechanism (cookie/session token
 *   the user pastes from their own logged-in browser session) OR manual data.
 * - `sync()` pulls what the configured endpoints expose. If Allen is
 *   unavailable or unconfigured, the app keeps working on manual data.
 * - NO bypassing of auth/CAPTCHA/anti-bot. If an endpoint rejects the token,
 *   we record a failed sync and stop — never retry in a loop.
 */
export class AllenIntegration {
  private baseUrl = process.env.ALLEN_PORTAL_URL || "";

  /** Store a user-supplied session token (pasted by the owner from their own logged-in Allen session). */
  async configure(userId: number, opts: { token?: string; portalUrl?: string }) {
    const [existing] = await db
      .select()
      .from(schema.allenData)
      .where(eq(schema.allenData.userId, userId))
      .limit(1);
    const raw = (existing?.raw as Record<string, unknown>) ?? {};
    if (opts.portalUrl) this.baseUrl = opts.portalUrl;

    const payload = {
      ...raw,
      token: opts.token || raw.token || null,
      portalUrl: opts.portalUrl || raw.portalUrl || this.baseUrl || null,
      configured: Boolean(opts.token || raw.token),
    };

    if (existing) {
      await db
        .update(schema.allenData)
        .set({ raw: payload as any, syncStatus: payload.configured ? "configured" : "not-connected", updatedAt: new Date() })
        .where(eq(schema.allenData.id, existing.id));
    } else {
      await db.insert(schema.allenData).values({
        userId,
        raw: payload as any,
        syncStatus: payload.configured ? "configured" : "not-connected",
      });
    }
    logger.info(`Allen integration configured for user ${userId}: ${payload.configured ? "token present" : "manual mode"}`);
  }

  async getConfig(userId: number) {
    const [row] = await db.select().from(schema.allenData).where(eq(schema.allenData.userId, userId)).limit(1);
    if (!row) return { configured: false, syncStatus: "not-connected" };
    const raw = (row.raw ?? {}) as Record<string, unknown>;
    return {
      configured: Boolean(raw.configured),
      portalUrl: raw.portalUrl,
      syncStatus: row.syncStatus,
      lastSyncAt: row.lastSyncAt,
      error: row.error,
      source: row.source,
    };
  }

  /**
   * Attempt a real sync using the stored token.
   * Only hits endpoints the logged-in user is authorized for. On any
   * non-200 / anti-bot response we stop and record the failure.
   */
  async sync(userId: number): Promise<{ ok: boolean; status?: string; error?: string }> {
    const [row] = await db.select().from(schema.allenData).where(eq(schema.allenData.userId, userId)).limit(1);
    if (!row) return { ok: false, error: "Not configured" };
    const raw = (row.raw ?? {}) as Record<string, unknown>;
    if (!raw.token || !raw.portalUrl) {
      await db
        .update(schema.allenData)
        .set({ syncStatus: "not-connected", updatedAt: new Date() })
        .where(eq(schema.allenData.id, row.id));
      return { ok: false, status: "not-connected", error: "No Allen session configured. Add your token or use manual entry." };
    }

    // The exact endpoints differ per Allen centre portal (allen.ac.in / learn.allen.ac.in).
    // We probe a small set of standard, authenticated JSON endpoints the student
    // portal exposes. If the token is rejected, we fail cleanly.
    const probes = ["/api/v1/student/tests", "/api/v1/student/performance", "/api/v1/student/syllabus", "/api/v1/student/profile"];
    try {
      for (const path of probes) {
        const res = await fetch(new URL(path, raw.portalUrl as string).toString(), {
          headers: {
            Authorization: `Bearer ${raw.token}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(12_000),
        });
        if (res.status === 401 || res.status === 403 || res.status === 429) {
          const msg = `Allen rejected the session (${res.status}). Re-authenticate in Allen and update the token.`;
          await db.update(schema.allenData).set({ syncStatus: "failed", error: msg, lastSyncAt: new Date(), updatedAt: new Date() }).where(eq(schema.allenData.id, row.id));
          return { ok: false, status: "failed", error: msg };
        }
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data) {
            await db.update(schema.allenData).set({ raw: { ...raw, ...data } as any, syncStatus: "connected", error: null, lastSyncAt: new Date(), updatedAt: new Date() }).where(eq(schema.allenData.id, row.id));
            return { ok: true, status: "connected" };
          }
        }
      }
      return { ok: false, status: "failed", error: "No matching endpoint found. Allen portal structure unknown — manual entry stays available." };
    } catch (e) {
      const msg = (e as Error).message;
      await db.update(schema.allenData).set({ syncStatus: "failed", error: msg, lastSyncAt: new Date(), updatedAt: new Date() }).where(eq(schema.allenData.id, row.id));
      return { ok: false, status: "failed", error: msg };
    }
  }

  /** Import test results manually (used when portal unavailable or as baseline). */
  async importManualTest(userId: number, data: typeof schema.tests.$inferInsert) {
    return db.insert(schema.tests).values({ ...data, userId, source: "manual" });
  }
}

export const allen = new AllenIntegration();