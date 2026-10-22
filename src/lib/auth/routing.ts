export type AuthState = {
  signedIn: boolean;
  /** Assurance level of the current session: aal2 once two-factor has been passed. */
  currentLevel: string | null;
  /** aal2 when the account has a verified two-factor device. */
  nextLevel: string | null;
};

// Reachable before login: the phone install manifest and its icons.
const PUBLIC_PREFIXES = ["/manifest.webmanifest", "/icon", "/apple-icon", "/auth/signout"];

const HOME = "/";
const LOGIN = "/login";
const ENROLL = "/mfa/enroll";
const VERIFY = "/mfa/verify";

/** Where a signed-in session that hasn't passed two-factor has to go next. */
function secondStep(s: AuthState): string {
  return s.nextLevel === "aal2" ? VERIFY : ENROLL;
}

/** Returns the path to redirect to, or null when the request may proceed. */
export function redirectFor(path: string, s: AuthState): string | null {
  if (PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return null;

  const passedMfa = s.signedIn && s.currentLevel === "aal2";

  if (path === LOGIN) {
    if (!s.signedIn) return null;
    return passedMfa ? HOME : secondStep(s);
  }

  if (path === ENROLL || path === VERIFY) {
    if (!s.signedIn) return LOGIN;
    if (passedMfa) return HOME;
    const required = secondStep(s);
    return path === required ? null : required;
  }

  if (!s.signedIn) return LOGIN;
  if (!passedMfa) return secondStep(s);
  return null;
}
