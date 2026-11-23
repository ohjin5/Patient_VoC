import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import path from "path";
import { createServer as createViteServer } from "vite";

import authRouter from "./routes/auth";
import aiRouter from "./routes/ai";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  /**
   * ============================================================
   * CORS
   * ============================================================
   */
  app.use(
    cors({
      origin: process.env.FRONTEND_ORIGIN || true,
      credentials: true,
    })
  );

  app.use(
    express.json({
      limit: "10mb",
    })
  );

  app.use(cookieParser());

  /**
   * ============================================================
   * Health Checks
   * ============================================================
   */
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "cx-analysis-backend",
      time: new Date().toISOString(),
    });
  });

  app.get("/api/ai/health", (_req, res) => {
    res.json({
      status: "ok",
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      project:
        process.env.GOOGLE_CLOUD_PROJECT ||
        "adc-local-or-sa",
    });
  });

  /**
   * ============================================================
   * API Routes
   * ============================================================
   */
  app.use("/api/auth", authRouter);
  app.use("/api/ai", aiRouter);

  /**
   * ============================================================
   * Development
   * ============================================================
   */
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
      },
      appType: "spa",
    });

    app.use(vite.middlewares);
  } else {
    /**
     * ==========================================================
     * Production Static Serving
     * ==========================================================
     *
     * 핵심 원칙
     *
     * 1. Vite hashed asset은 장기 캐시 가능
     * 2. index.html은 캐시하지 않음
     * 3. 존재하지 않는 /assets/* 요청에는 index.html을 반환하지 않음
     *
     * 이렇게 해야 새 Cloud Run revision 배포 후
     * 브라우저가 이전 index.html을 참조하여
     * "JS 요청 → index.html 응답 → MIME text/html 오류"
     * 가 발생하는 문제를 방지할 수 있습니다.
     */
    const distPath =
      path.join(
        process.cwd(),
        "dist"
      );

    const assetsPath =
      path.join(
        distPath,
        "assets"
      );

    const indexPath =
      path.join(
        distPath,
        "index.html"
      );

    /**
     * ----------------------------------------------------------
     * 1. Vite Assets
     * ----------------------------------------------------------
     *
     * /assets/*.js, *.css 등은 해시 파일명이므로
     * 장기 캐시 + immutable 사용이 안전합니다.
     *
     * fallthrough:false:
     * 파일이 없으면 SPA fallback으로 넘기지 않고
     * 즉시 404를 반환합니다.
     */
    app.use(
      "/assets",
      express.static(
        assetsPath,
        {
          fallthrough: false,
          maxAge: "1y",
          immutable: true,
          index: false,
        }
      )
    );

    /**
     * ----------------------------------------------------------
     * 2. Other Static Files
     * ----------------------------------------------------------
     *
     * favicon, logo 등 public 정적파일 제공.
     * index.html은 여기서 자동 반환하지 않도록 index:false.
     */
    app.use(
      express.static(
        distPath,
        {
          index: false,
          setHeaders: (
            res,
            filePath
          ) => {
            /**
             * index.html이 직접 요청되는 경우도
             * 항상 최신 버전을 확인하도록 캐시 금지
             */
            if (
              filePath.endsWith(
                "index.html"
              )
            ) {
              res.setHeader(
                "Cache-Control",
                "no-store, no-cache, must-revalidate, proxy-revalidate"
              );

              res.setHeader(
                "Pragma",
                "no-cache"
              );

              res.setHeader(
                "Expires",
                "0"
              );
            }
          },
        }
      )
    );

    /**
     * ----------------------------------------------------------
     * 3. Unknown API Route Guard
     * ----------------------------------------------------------
     *
     * 존재하지 않는 /api/* 요청에 index.html을 보내지 않습니다.
     */
    app.use(
      "/api",
      (_req, res) => {
        res.status(404).json({
          error: "API_NOT_FOUND",
        });
      }
    );

    /**
     * ----------------------------------------------------------
     * 4. SPA Fallback
     * ----------------------------------------------------------
     *
     * React Router 등 브라우저 경로 접근 시에만
     * index.html을 반환합니다.
     *
     * index.html은 항상 no-store.
     */
    app.get("*", (_req, res) => {
      res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate"
      );

      res.setHeader(
        "Pragma",
        "no-cache"
      );

      res.setHeader(
        "Expires",
        "0"
      );

      res.sendFile(
        indexPath
      );
    });
  }

  /**
   * ============================================================
   * Start Server
   * ============================================================
   */
  app.listen(
    PORT,
    "0.0.0.0",
    () => {
      console.log(
        `[CX Analysis Backend] Server running on http://0.0.0.0:${PORT}`
      );
    }
  );
}

startServer();
