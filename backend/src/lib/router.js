function splitPath(path) {
  return path.split("/").filter(Boolean);
}

function matchPath(pattern, pathname, prefix = false) {
  const expected = splitPath(pattern);
  const actual = splitPath(pathname);
  if ((!prefix && expected.length !== actual.length) || expected.length > actual.length) {
    return null;
  }

  const params = {};
  for (let index = 0; index < expected.length; index += 1) {
    const segment = expected[index];
    const value = actual[index];
    if (segment.startsWith(":")) {
      try {
        params[segment.slice(1)] = decodeURIComponent(value);
      } catch {
        params[segment.slice(1)] = value;
      }
    } else if (segment.toLowerCase() !== value.toLowerCase()) {
      return null;
    }
  }

  return { params, consumed: expected.length };
}

async function runHandlers(handlers, request, response) {
  async function run(index) {
    if (index >= handlers.length || response.sent) return;

    let nextCalled = false;
    let nextResult;
    const next = (error) => {
      if (nextCalled) return;
      nextCalled = true;
      nextResult = error ? Promise.reject(error) : run(index + 1);
      nextResult.catch(() => {});
    };

    const result = handlers[index](request, response, next);
    await result;
    if (nextCalled) await nextResult;
  }

  await run(0);
}

export function Router() {
  const stack = [];

  function use(...args) {
    const path = typeof args[0] === "string" ? args.shift() : "/";
    const handlers = args.flat();
    stack.push({
      type: "use",
      path,
      router: handlers.length === 1 && handlers[0]?.stack ? handlers[0] : null,
      handlers,
    });
    return router;
  }

  function route(method, path, handlers) {
    stack.push({ type: "route", method, path, handlers: handlers.flat() });
    return router;
  }

  const router = {
    stack,
    use,
    get: (path, ...handlers) => route("GET", path, handlers),
    post: (path, ...handlers) => route("POST", path, handlers),
    put: (path, ...handlers) => route("PUT", path, handlers),
    patch: (path, ...handlers) => route("PATCH", path, handlers),
    delete: (path, ...handlers) => route("DELETE", path, handlers),

    async handle(request, response) {
      const activeMiddleware = [];
      const pathname = request.path;

      for (const layer of stack) {
        if (layer.type === "use") {
          const prefixMatch = matchPath(layer.path, request.path, true);
          if (!prefixMatch) continue;

          if (layer.router) {
            const originalUrl = request.url;
            const originalPath = request.path;
            const originalParams = request.params;
            const url = new URL(request.url, "http://next.local");
            const remainder = splitPath(originalPath)
              .slice(prefixMatch.consumed)
              .join("/");
            url.pathname = `/${remainder}`;
            request.url = `${url.pathname}${url.search}`;
            request.path = url.pathname;
            request.params = { ...originalParams, ...prefixMatch.params };
            const handled = await layer.router.handle(request, response);
            request.url = originalUrl;
            request.path = originalPath;
            request.params = originalParams;
            if (handled) return true;
            continue;
          }

          activeMiddleware.push(...layer.handlers);
          continue;
        }

        if (
          layer.method !== request.method &&
          !(request.method === "HEAD" && layer.method === "GET")
        ) {
          continue;
        }

        const match = matchPath(layer.path, pathname);
        if (!match) continue;

        const originalParams = request.params;
        request.params = { ...originalParams, ...match.params };
        try {
          await runHandlers(
            [...activeMiddleware, ...layer.handlers],
            request,
            response,
          );
        } finally {
          request.params = originalParams;
        }
        return true;
      }

      if (activeMiddleware.length) {
        await runHandlers(activeMiddleware, request, response);
      }
      return response.sent;
    },
  };

  return router;
}

export function createRequestContext(webRequest, pathname = new URL(webRequest.url).pathname) {
  const url = new URL(webRequest.url);
  const query = {};
  for (const [key, value] of url.searchParams) {
    if (query[key] === undefined) query[key] = value;
    else if (Array.isArray(query[key])) query[key].push(value);
    else query[key] = [query[key], value];
  }

  const cookies = {};
  for (const pair of (webRequest.headers.get("cookie") ?? "").split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }

  return {
    method: webRequest.method.toUpperCase(),
    url: `${pathname}${url.search}`,
    path: pathname,
    originalUrl: `${pathname}${url.search}`,
    query,
    params: {},
    body: {},
    cookies,
    headers: webRequest.headers,
    get: (name) => webRequest.headers.get(name),
    ip: webRequest.headers.get("x-forwarded-for")?.split(",")[0].trim() || "next",
    webRequest,
  };
}

export function createResponseContext() {
  let statusCode = 200;
  let body = null;
  let sent = false;
  const headers = new Headers();

  const response = {
    get sent() {
      return sent;
    },
    get statusCode() {
      return statusCode;
    },
    status(code) {
      statusCode = code;
      return response;
    },
    set(name, value) {
      if (typeof name === "object") {
        for (const [key, headerValue] of Object.entries(name)) {
          headers.set(key, String(headerValue));
        }
      } else {
        headers.set(name, String(value));
      }
      return response;
    },
    setDefault(name, value) {
      if (!headers.has(name)) headers.set(name, String(value));
      return response;
    },
    type(contentType) {
      headers.set(
        "Content-Type",
        contentType === "html" ? "text/html; charset=utf-8" : contentType,
      );
      return response;
    },
    json(value) {
      headers.set("Content-Type", "application/json; charset=utf-8");
      body = JSON.stringify(value);
      sent = true;
      return response;
    },
    send(value) {
      if (typeof value === "string" && !headers.has("Content-Type")) {
        headers.set("Content-Type", "text/html; charset=utf-8");
      }
      body = value;
      sent = true;
      return response;
    },
    stream(value) {
      body = value;
      sent = true;
      return response;
    },
    redirect(code, location) {
      if (typeof location === "undefined") {
        location = code;
        code = 302;
      }
      headers.set("Location", location);
      statusCode = code;
      body = null;
      sent = true;
      return response;
    },
    cookie(name, value, options = {}) {
      headers.append("Set-Cookie", serializeCookie(name, value, options));
      return response;
    },
    clearCookie(name, options = {}) {
      headers.append(
        "Set-Cookie",
        serializeCookie(name, "", {
          ...options,
          expires: new Date(0),
        }),
      );
      return response;
    },
    toResponse(method) {
      if (!headers.has("X-Content-Type-Options")) {
        headers.set("X-Content-Type-Options", "nosniff");
      }
      if (!headers.has("X-Frame-Options")) {
        headers.set("X-Frame-Options", "SAMEORIGIN");
      }
      if (!headers.has("Referrer-Policy")) {
        headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      }
      return new Response(
        method === "HEAD" || statusCode === 204 || statusCode === 304
          ? null
          : body,
        { status: statusCode, headers },
      );
    },
  };

  return response;
}

function serializeCookie(name, value, options) {
  const pieces = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) {
    pieces.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
  }
  if (options.domain) pieces.push(`Domain=${options.domain}`);
  if (options.path) pieces.push(`Path=${options.path}`);
  if (options.expires) pieces.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly) pieces.push("HttpOnly");
  if (options.secure) pieces.push("Secure");
  if (options.sameSite) {
    const sameSite = options.sameSite === true ? "Strict" : options.sameSite;
    pieces.push(`SameSite=${sameSite[0].toUpperCase()}${sameSite.slice(1)}`);
  }
  return pieces.join("; ");
}
