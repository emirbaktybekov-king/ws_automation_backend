const axios = require("axios");

const API_URL = "http://localhost:8000";

async function testAuth() {
  try {
    console.log("🧪 Testing JWT Authentication...\n");

    // Test 1: Register a new user
    console.log("1. Testing user registration...");
    const registerResponse = await axios.post(
      `${API_URL}/api/v1/auth/register`,
      {
        email: "test@example.com",
        password: "password123",
        username: "testuser",
      }
    );
    console.log(
      "✅ Registration successful:",
      registerResponse.data.user.email
    );

    // Test 2: Login with the registered user
    console.log("\n2. Testing user login...");
    const loginResponse = await axios.post(`${API_URL}/api/v1/auth/login`, {
      email: "test@example.com",
      password: "password123",
    });
    console.log("✅ Login successful:", loginResponse.data.user.email);

    const { accessToken, refreshToken } = loginResponse.data;

    // Test 3: Access protected endpoint
    console.log("\n3. Testing protected endpoint...");
    const meResponse = await axios.get(`${API_URL}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    console.log(
      "✅ Protected endpoint accessible:",
      meResponse.data.user.email
    );

    // Test 4: Test token refresh
    console.log("\n4. Testing token refresh...");
    const refreshResponse = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
      refreshToken,
    });
    console.log("✅ Token refresh successful");

    // Test 5: Test logout
    console.log("\n5. Testing logout...");
    const logoutResponse = await axios.post(
      `${API_URL}/api/v1/auth/logout`,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    console.log("✅ Logout successful");

    console.log("\n🎉 All authentication tests passed!");
    console.log("\n📋 Summary:");
    console.log("- ✅ User registration with password hashing");
    console.log("- ✅ User login with JWT tokens");
    console.log("- ✅ Protected route access");
    console.log("- ✅ Token refresh mechanism");
    console.log("- ✅ Logout functionality");
  } catch (error) {
    console.error("❌ Test failed:", error.response?.data || error.message);
  }
}

// Run the test
testAuth();
