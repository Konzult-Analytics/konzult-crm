import { describe, it, expect } from "vitest";
import { redirectFor, type AuthState } from "@/lib/auth/routing";

const loggedOut: AuthState = { signedIn: false, currentLevel: null, nextLevel: null };
const noDevice: AuthState = { signedIn: true, currentLevel: "aal1", nextLevel: "aal1" };
const needsCode: AuthState = { signedIn: true, currentLevel: "aal1", nextLevel: "aal2" };
const passed: AuthState = { signedIn: true, currentLevel: "aal2", nextLevel: "aal2" };

describe("redirectFor", () => {
  it("sends logged-out visitors to login from any app page", () => {
    expect(redirectFor("/", loggedOut)).toBe("/login");
    expect(redirectFor("/people/123", loggedOut)).toBe("/login");
    expect(redirectFor("/mfa/enroll", loggedOut)).toBe("/login");
    expect(redirectFor("/mfa/verify", loggedOut)).toBe("/login");
    expect(redirectFor("/login", loggedOut)).toBeNull();
  });

  it("makes an account without a device set up two-factor first", () => {
    expect(redirectFor("/", noDevice)).toBe("/mfa/enroll");
    expect(redirectFor("/login", noDevice)).toBe("/mfa/enroll");
    expect(redirectFor("/mfa/verify", noDevice)).toBe("/mfa/enroll");
    expect(redirectFor("/mfa/enroll", noDevice)).toBeNull();
  });

  it("asks an account with a device for its code", () => {
    expect(redirectFor("/", needsCode)).toBe("/mfa/verify");
    expect(redirectFor("/login", needsCode)).toBe("/mfa/verify");
    expect(redirectFor("/mfa/enroll", needsCode)).toBe("/mfa/verify");
    expect(redirectFor("/mfa/verify", needsCode)).toBeNull();
  });

  it("lets a session that passed two-factor in, and keeps it out of the login steps", () => {
    expect(redirectFor("/", passed)).toBeNull();
    expect(redirectFor("/people/123", passed)).toBeNull();
    expect(redirectFor("/login", passed)).toBe("/");
    expect(redirectFor("/mfa/enroll", passed)).toBe("/");
    expect(redirectFor("/mfa/verify", passed)).toBe("/");
  });

  it("serves the install manifest, icons and sign-out to anyone", () => {
    for (const s of [loggedOut, noDevice, needsCode, passed]) {
      expect(redirectFor("/manifest.webmanifest", s)).toBeNull();
      expect(redirectFor("/icon/192", s)).toBeNull();
      expect(redirectFor("/apple-icon", s)).toBeNull();
      expect(redirectFor("/auth/signout", s)).toBeNull();
      expect(redirectFor("/d/abcdefghijklmnopqrstuvwxyz012345", s)).toBeNull();
      expect(redirectFor("/d/abcdefghijklmnopqrstuvwxyz012345/open", s)).toBeNull();
      expect(redirectFor("/api/inbound/cal/key", s)).toBeNull();
      expect(redirectFor("/api/inbound/website/key", s)).toBeNull();
    }
  });

  it("doesn't treat look-alike paths as public", () => {
    expect(redirectFor("/iconography", loggedOut)).toBe("/login");
    expect(redirectFor("/login-help", loggedOut)).toBe("/login");
    expect(redirectFor("/documents/123", loggedOut)).toBe("/login");
    expect(redirectFor("/dashboard", loggedOut)).toBe("/login");
    expect(redirectFor("/api/inboundx", loggedOut)).toBe("/login");
    expect(redirectFor("/api/other", loggedOut)).toBe("/login");
  });
});
