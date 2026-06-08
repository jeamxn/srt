import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { ConfigProvider, theme, App as AntdApp } from "antd";

import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>SRT 자동 예약</title>
        <Meta />
        <Links />
        {/* antd SSR 스타일이 주입되는 위치 (entry.server.tsx 참고) */}
        {typeof document === "undefined" ? (
          <style
            dangerouslySetInnerHTML={{ __html: "__ANTD_STYLE__" }}
          />
        ) : null}
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#3a6bff",
          borderRadius: 10,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
        },
      }}
    >
      <AntdApp>
        <Outlet />
      </AntdApp>
    </ConfigProvider>
  );
}

export function ErrorBoundary({ error }: { error: unknown }) {
  let message = "알 수 없는 오류가 발생했습니다.";
  if (error instanceof Error) message = error.message;
  return (
    <main style={{ padding: 24, color: "#fff", background: "#141414" }}>
      <h1>오류</h1>
      <pre>{message}</pre>
    </main>
  );
}
