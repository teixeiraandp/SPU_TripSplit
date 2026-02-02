import request from "supertest";

const api = request("http://localhost:5001");

describe("Auth API", () => {
  test("users can register and then login", async () => {
    const stamp = Date.now();
    const email = `sarah_${stamp}@test.com`;
    const username = `sarah_${stamp}`;
    const password = "Password123!";

    const regRes = await api
      .post("/auth/register")
      .send({ email, username, password });

    expect(regRes.status).toBe(200);

    const loginRes = await api
      .post("/auth/login")
      .send({ email, password });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toHaveProperty("token");
  });
});
