import { PassThrough } from "node:stream";
import type { AppLoadContext, EntryContext } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";
import { createCache, extractStyle, StyleProvider } from "@ant-design/cssinjs";

const ABORT_DELAY = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: AppLoadContext
) {
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request.headers.get("user-agent");
    const readyOption: keyof typeof renderOptions =
      userAgent && isbot(userAgent) ? "onAllReady" : "onShellReady";

    const cache = createCache();

    const renderOptions = {
      onShellReady() {},
      onAllReady() {},
    };

    const { pipe, abort } = renderToPipeableStream(
      <StyleProvider cache={cache}>
        <ServerRouter context={routerContext} url={request.url} />
      </StyleProvider>,
      {
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough({
            transform(chunk, _enc, callback) {
              const str = chunk.toString();
              // antd 스타일을 </head> 직전에 주입
              if (str.includes("__ANTD_STYLE__")) {
                const style = extractStyle(cache, true);
                callback(null, str.replace("__ANTD_STYLE__", style));
              } else {
                callback(null, chunk);
              }
            },
          });
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );

          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) {
            console.error(error);
          }
        },
      }
    );

    setTimeout(abort, ABORT_DELAY);
  });
}
