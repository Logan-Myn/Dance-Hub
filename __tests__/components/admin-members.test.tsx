import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import { MembersClient, memberState, type AdminMember } from "@/components/community-admin/members-client";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("react-hot-toast", () => {
  const toast = { success: jest.fn(), error: jest.fn() };
  return { __esModule: true, default: toast, toast };
});

const member: AdminMember = {
  id: "m1",
  userId: "u1",
  name: "Ana",
  email: "ana@example.com",
  avatarUrl: null,
  joinedAt: "2026-01-01T00:00:00.000Z",
  status: "active",
  subscriptionStatus: "active",
  hasSubscription: true,
  periodEnd: "2026-11-01T00:00:00.000Z",
  cancelledAt: null,
  lastActive: null,
  posts: 2,
  replies: 3,
  privateLessons: 0,
  lessonsDone: 4,
};

describe("memberState", () => {
  it("reads the member's situation from their row", () => {
    expect(memberState({ status: "active", subscriptionStatus: null })).toBe("active");
    expect(memberState({ status: "active", subscriptionStatus: "canceling" })).toBe("canceling");
    expect(memberState({ status: "active", subscriptionStatus: "past_due" })).toBe("failed");
    expect(memberState({ status: "active", subscriptionStatus: "unpaid" })).toBe("failed");
    expect(memberState({ status: "pre_registered", subscriptionStatus: null })).toBe("pre");
    expect(memberState({ status: "inactive", subscriptionStatus: "canceled" })).toBe("left");
  });
});

it("tells the owner why a member was not removed", async () => {
  const reason = "We couldn't cancel this member's subscription, so they were not removed. Please try again.";
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({ error: reason }) } as Response)
  ) as jest.Mock;

  render(<MembersClient slug="salsa" members={[member]} showCourses initialFilter="all" serverNow={Date.parse("2026-10-05T10:00:00Z")} />);
  await userEvent.click(screen.getByRole("button", { name: /Ana/ }));
  await userEvent.click(await screen.findByRole("button", { name: "Remove from community" }));
  await userEvent.click(screen.getByRole("button", { name: "Remove" }));

  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(reason));
  expect(toast.success).not.toHaveBeenCalled();
});
