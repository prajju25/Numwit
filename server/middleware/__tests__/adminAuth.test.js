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
