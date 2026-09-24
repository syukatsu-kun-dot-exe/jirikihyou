import { PrismaClient } from "@prisma/client";

/** プロセス共有の Prisma Client。本番は error のみ、開発は warn/error を出す */
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
});
