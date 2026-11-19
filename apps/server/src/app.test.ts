import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("server app", () => {
  const app = createApp();

  it("reports health", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.service).toBe("onego-server");
    expect(typeof response.body.timestamp).toBe("string");
  });

  it("returns structured 404s", async () => {
    const response = await request(app).get("/api/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("not_found");
  });
});
