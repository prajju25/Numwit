const adminAuth = require("../adminAuth");

function makeReq(authHeader) {
  return { headers: { authorization: authHeader } };
}

function makeRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    set(key, value) { this.headers[key] = value; return this; },
    json(body) { this.body = body; return this; },
  };
  return res;
}

function basicAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

describe("adminAuth middleware", () => {
  const originalEnv = process.env.ADMIN_PASSWORD;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = originalEnv;
  });

  test("returns 503 when ADMIN_PASSWORD is not configured", () => {
    delete process.env.ADMIN_PASSWORD;
    const req = makeReq(basicAuthHeader("admin", "anything"));
    const res = makeRes();
    const next = jest.fn();

    adminAuth(req, res, next);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: "Admin interface not configured" });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 401 when no Authorization header is present", () => {
    process.env.ADMIN_PASSWORD = "secret";
    const req = makeReq(undefined);
    const res = makeRes();
    const next = jest.fn();

    adminAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.headers["WWW-Authenticate"]).toMatch(/Basic/);
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 401 for a malformed Authorization header", () => {
    process.env.ADMIN_PASSWORD = "secret";
    const req = makeReq("Bearer sometoken");
    const res = makeRes();
    const next = jest.fn();

    adminAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 401 when the password is wrong", () => {
    process.env.ADMIN_PASSWORD = "secret";
    const req = makeReq(basicAuthHeader("admin", "wrong"));
    const res = makeRes();
    const next = jest.fn();

    adminAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 401 when the username is wrong", () => {
    process.env.ADMIN_PASSWORD = "secret";
    const req = makeReq(basicAuthHeader("notadmin", "secret"));
    const res = makeRes();
    const next = jest.fn();

    adminAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("calls next() when the credentials are correct", () => {
    process.env.ADMIN_PASSWORD = "secret";
    const req = makeReq(basicAuthHeader("admin", "secret"));
    const res = makeRes();
    const next = jest.fn();

    adminAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });
});

describe("adminAuth hardening", () => {
  const originalEnv = process.env.ADMIN_PASSWORD;
  const good = basicAuthHeader("admin", "s3cret-long-password");
  const bad = basicAuthHeader("admin", "guess");
  const req = (overrides = {}) => ({ method: "GET", headers: { host: "numwit.prajvex.com", "fly-client-ip": "1.2.3.4", ...overrides } });
  const call = (r) => { const res = makeRes(); const next = jest.fn(); adminAuth(r, res, next); return { res, next }; };

  beforeEach(() => {
    process.env.ADMIN_PASSWORD = "s3cret-long-password";
    adminAuth.resetLockouts();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (originalEnv === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = originalEnv;
  });

  test("locks an IP out after 10 wrong passwords — even the right one — for 15 minutes", () => {
    for (let i = 0; i < 10; i++) expect(call(req({ authorization: bad })).res.statusCode).toBe(401);

    const locked = call(req({ authorization: good }));
    expect(locked.res.statusCode).toBe(429);
    expect(locked.next).not.toHaveBeenCalled();
    expect(Number(locked.res.headers["Retry-After"])).toBeGreaterThan(890);

    // another IP is unaffected
    expect(call(req({ authorization: good, "fly-client-ip": "5.6.7.8" })).next).toHaveBeenCalled();

    // after the window, the IP can sign in again
    const later = Date.now() + 15 * 60 * 1000 + 1;
    jest.spyOn(Date, "now").mockReturnValue(later);
    expect(call(req({ authorization: good })).next).toHaveBeenCalled();
  });

  test("logs each failed sign-in and the lockout, with the IP partly hidden", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < 10; i++) call(req({ authorization: bad }));
    const lines = warn.mock.calls.map((c) => c[0]);
    expect(lines[0]).toBe("admin: failed sign-in from 1.2.3.x (1/10)");
    expect(lines).toContain("admin: sign-in locked for 1.2.3.x for 15 min");
    expect(lines.join(" ")).not.toContain("1.2.3.4");
  });

  test("the browser's credential-less request is not logged as a failed sign-in", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    call(req());
    expect(warn).not.toHaveBeenCalled();
  });

  test("maskIp hides the last part of IPv4 and IPv6 addresses", () => {
    expect(adminAuth.maskIp("203.0.113.42")).toBe("203.0.113.x");
    expect(adminAuth.maskIp("2001:db8::1f")).toBe("2001:db8::x");
    expect(adminAuth.maskIp(undefined)).toBe("unknown");
  });

  test("a global ceiling stops guessing from many IPs", () => {
    for (let i = 0; i < 100; i++) call(req({ authorization: bad, "fly-client-ip": "10.0.0." + i }));
    const res = call(req({ authorization: good, "fly-client-ip": "9.9.9.9" })).res;
    expect(res.statusCode).toBe(429);
  });

  test("the browser's first, credential-less request (to show the login box) doesn't count", () => {
    for (let i = 0; i < 20; i++) expect(call(req()).res.statusCode).toBe(401);
    expect(call(req({ authorization: good })).next).toHaveBeenCalled();
  });

  test("falls back to the socket address outside Fly", () => {
    for (let i = 0; i < 10; i++) call({ method: "GET", headers: { authorization: bad }, socket: { remoteAddress: "7.7.7.7" } });
    expect(call({ method: "GET", headers: { authorization: good }, socket: { remoteAddress: "7.7.7.7" } }).res.statusCode).toBe(429);
    expect(call({ method: "GET", headers: { authorization: good }, ip: "8.8.8.8" }).next).toHaveBeenCalled();
  });

  test("delete / merge / status changes must come from this site", () => {
    const mk = (method, headers) => { const r = req({ authorization: good, ...headers }); r.method = method; return call(r); };

    // same site (the admin page) and non-browser clients are fine
    expect(mk("POST", { origin: "https://numwit.prajvex.com", "sec-fetch-site": "same-origin" }).next).toHaveBeenCalled();
    expect(mk("DELETE", {}).next).toHaveBeenCalled();
    expect(mk("PATCH", { "sec-fetch-site": "none" }).next).toHaveBeenCalled();

    // another site is refused
    const cross = mk("POST", { origin: "https://evil.example", "sec-fetch-site": "cross-site" });
    expect(cross.res.statusCode).toBe(403);
    expect(cross.next).not.toHaveBeenCalled();
    expect(mk("DELETE", { origin: "https://evil.example" }).res.statusCode).toBe(403);
    expect(mk("POST", { "sec-fetch-site": "same-site" }).res.statusCode).toBe(403);
    expect(mk("POST", { origin: "null" }).res.statusCode).toBe(403);

    // reading is always allowed once signed in
    expect(mk("GET", { origin: "https://evil.example", "sec-fetch-site": "cross-site" }).next).toHaveBeenCalled();
  });

  test("wrong username or a garbled header is a failed attempt", () => {
    expect(call(req({ authorization: basicAuthHeader("root", "s3cret-long-password") })).res.statusCode).toBe(401);
    expect(call(req({ authorization: "Basic @@@!!!" })).res.statusCode).toBe(401);
    expect(call(req({ authorization: "Bearer abc" })).res.statusCode).toBe(401);
  });
});
