import { createMiddleware } from "hono/factory";
import { prisma } from "./db.js";

/**
 * 「現在のユーザー」の解決。
 * ログイン機能ができるまでは id=1 のローカルユーザーに固定する。
 * 認証を導入するときはこのファイル (ミドルウェア) だけをセッション / JWT 解決に差し替える。
 */
export const LOCAL_USER_ID = 1;

export type CurrentUserEnv = {
  Variables: { userId: number };
};

export const currentUser = createMiddleware<CurrentUserEnv>(async (c, next) => {
  c.set("userId", LOCAL_USER_ID);
  await next();
});

/** 起動時にローカルユーザーが存在することを保証する */
export async function ensureLocalUser() {
  await prisma.user.upsert({
    where: { id: LOCAL_USER_ID },
    update: {},
    create: { id: LOCAL_USER_ID, displayName: "ローカルユーザー" },
  });
}
