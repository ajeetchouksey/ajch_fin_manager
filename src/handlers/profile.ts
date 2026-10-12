/**
 * Profile Handler
 * Manages user profiles and preferences
 */

import type { CloudflareEnv, UserProfile } from "../lib/types";
import { buildResponse, buildErrorResponse, parseJSON, log, generateToken } from "../lib/utils";
import { AppErrorClass } from "../lib/utils";

/**
 * Handle profile requests
 * GET /api/profile/:userId - Get profile
 * POST /api/profile - Create profile
 * PUT /api/profile/:userId - Update profile
 */
export async function handleProfile(
  request: Request,
  env: CloudflareEnv
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();

    const segments = pathname.split("/");
    const userId = segments[segments.length - 1];

    log("info", "Profile request", {
      method,
      pathname,
      userId,
    });

    if (method === "GET" && userId && userId !== "profile") {
      // Get profile
      return await getProfile(userId, env);
    } else if (method === "POST" && pathname === "/api/profile") {
      // Create profile
      const body = await request.text();
      const profileData = parseJSON<Partial<UserProfile>>(body);
      return await createProfile(profileData, env);
    } else if (method === "PUT" && userId && userId !== "profile") {
      // Update profile
      const body = await request.text();
      const profileData = parseJSON<Partial<UserProfile>>(body);
      return await updateProfile(userId, profileData, env);
    } else {
      throw new AppErrorClass(
        "INVALID_ENDPOINT",
        "Invalid profile endpoint",
        404
      );
    }
  } catch (error) {
    log("error", "Profile handler error", { error });
    return buildErrorResponse(error);
  }
}

/**
 * Get user profile
 */
async function getProfile(userId: string, env: CloudflareEnv): Promise<Response> {
  try {
    // TODO: Retrieve profile from KV namespace
    // For now, return mock profile
    const profile: UserProfile = {
      id: userId,
      email: "user@example.com",
      name: "User Name",
      countries: ["US"],
      currencies: ["USD"],
      homeCurrency: "USD",
      onboardingComplete: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      preferences: {
        aiProvider: "gemini",
        aiModel: "cheap",
        theme: "light",
        timezone: "UTC",
      },
    };

    return buildResponse(profile, 200);
  } catch (error) {
    log("error", "Get profile error", { userId, error });
    throw error;
  }
}

/**
 * Create new user profile
 */
async function createProfile(
  profileData: Partial<UserProfile> | undefined,
  env: CloudflareEnv
): Promise<Response> {
  try {
    if (!profileData || !profileData.email || !profileData.name) {
      throw new AppErrorClass(
        "INVALID_PROFILE",
        "email and name are required",
        400
      );
    }

    const userId = generateToken(16);
    const now = new Date().toISOString();

    const newProfile: UserProfile = {
      id: userId,
      email: profileData.email,
      name: profileData.name,
      countries: profileData.countries || ["US"],
      currencies: profileData.currencies || ["USD"],
      homeCurrency: profileData.homeCurrency || "USD",
      onboardingComplete: profileData.onboardingComplete || false,
      createdAt: now,
      updatedAt: now,
      preferences: {
        aiProvider: profileData.preferences?.aiProvider || "gemini",
        aiModel: profileData.preferences?.aiModel || "cheap",
        theme: profileData.preferences?.theme || "light",
        timezone: profileData.preferences?.timezone || "UTC",
      },
    };

    // TODO: Store profile in KV namespace
    // await env.SESSIONS.put(`profile_${userId}`, JSON.stringify(newProfile));

    log("info", "Profile created", { userId, email: newProfile.email });

    return buildResponse(newProfile, 201);
  } catch (error) {
    log("error", "Create profile error", { error });
    throw error;
  }
}

/**
 * Update user profile
 */
async function updateProfile(
  userId: string,
  updates: Partial<UserProfile> | undefined,
  env: CloudflareEnv
): Promise<Response> {
  try {
    if (!updates) {
      throw new AppErrorClass("INVALID_UPDATE", "No updates provided", 400);
    }

    // TODO: Fetch existing profile from KV
    // TODO: Merge updates
    // TODO: Store updated profile in KV

    const updatedProfile: UserProfile = {
      id: userId,
      email: updates.email || "user@example.com",
      name: updates.name || "User Name",
      countries: updates.countries || ["US"],
      currencies: updates.currencies || ["USD"],
      homeCurrency: updates.homeCurrency || "USD",
      onboardingComplete: updates.onboardingComplete !== undefined ? updates.onboardingComplete : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      preferences: {
        aiProvider: updates.preferences?.aiProvider || "gemini",
        aiModel: updates.preferences?.aiModel || "cheap",
        theme: updates.preferences?.theme || "light",
        timezone: updates.preferences?.timezone || "UTC",
      },
    };

    log("info", "Profile updated", { userId });

    return buildResponse(updatedProfile, 200);
  } catch (error) {
    log("error", "Update profile error", { userId, error });
    throw error;
  }
}
