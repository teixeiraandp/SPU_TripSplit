import request from "supertest";

const api = request("http://localhost:5001");

// helper: register + login and return auth token
async function registerAndLogin() {
  const stamp = Date.now();
  const email = `user_${stamp}@test.com`;
  const username = `user_${stamp}`;
  const password = "Password123!";

  await api.post("/auth/register").send({
    email,
    username,
    password,
  });

  const loginRes = await api.post("/auth/login").send({
    email,
    password,
  });

  return loginRes.body.token;
}

describe("Trips API", () => {
  test("logged-in user can create a trip", async () => {
    // Arrange
    const token = await registerAndLogin();

    // Act
    const res = await api
      .post("/trips")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "San Diego Weekend",
        destination: "San Diego, CA",
        date: "2026-02-10",
      });

    // Assert
    expect(res.status).toBe(200); 
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("name", "San Diego Weekend");

  });
});
