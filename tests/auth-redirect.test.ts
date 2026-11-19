import { describe, expect, it } from "vitest";
import { LUCKYNIME_AUTH_REDIRECT_URL, readCallbackValue, signUpVerificationNotice, verificationResentNotice } from "../lib/auth-redirect";

describe("Luckynime Android email verification redirect", () => {
  it("uses the exact registered Android auth callback and gives actionable inbox plus Spam/Junk guidance", () => {
    expect(LUCKYNIME_AUTH_REDIRECT_URL).toBe("luckynime://auth");
    expect(signUpVerificationNotice("member@luckynime.tech")).toContain("member@luckynime.tech");
    expect(signUpVerificationNotice("member@luckynime.tech")).toContain("Spam or Junk");
    expect(signUpVerificationNotice("member@luckynime.tech")).toContain("Confirm email address");
    expect(verificationResentNotice("member@luckynime.tech")).toContain("another confirmation email");
    expect(verificationResentNotice("member@luckynime.tech")).toContain("member@luckynime.tech");
  });

  it("reads scalar and repeated Android callback query values safely", () => {
    expect(readCallbackValue("confirmed")).toBe("confirmed");
    expect(readCallbackValue(["confirmed", "ignored"])).toBe("confirmed");
    expect(readCallbackValue(undefined)).toBeUndefined();
  });
});
