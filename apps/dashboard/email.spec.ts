import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resendMock = vi.hoisted(() => {
  const send = vi.fn();
  const Resend = vi.fn(() => ({
    emails: { send },
  }));

  return { Resend, send };
});

vi.mock("resend", () => ({
  Resend: resendMock.Resend,
}));

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  resendMock.send.mockResolvedValue({
    data: { id: "email_test_123" },
    error: null,
    headers: null,
  });
  process.env = { ...originalEnv, NODE_ENV: "test" };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("transactional email provider dispatch", () => {
  it("uses Resend when EMAIL_PROVIDER=resend", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "GitFuse <auth@gitfuse.dev>";

    const { sendTransactionalEmail } = await import("./lib/email");

    await sendTransactionalEmail({
      to: "user@example.com",
      subject: "Your code",
      text: "123456",
    });

    expect(resendMock.Resend).toHaveBeenCalledWith("re_test_key");
    expect(resendMock.send).toHaveBeenCalledWith({
      from: "GitFuse <auth@gitfuse.dev>",
      to: "user@example.com",
      subject: "Your code",
      text: "123456",
      html: '<div style="white-space:pre-wrap">123456</div>',
    });
  });

  it("fails fast when EMAIL_PROVIDER=resend and RESEND_API_KEY is missing", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "";
    process.env.RESEND_FROM_EMAIL = "GitFuse <auth@gitfuse.dev>";

    const { sendTransactionalEmail } = await import("./lib/email");

    await expect(
      sendTransactionalEmail({
        to: "user@example.com",
        subject: "Your code",
        text: "123456",
      }),
    ).rejects.toThrow("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
    expect(resendMock.Resend).not.toHaveBeenCalled();
  });
});
