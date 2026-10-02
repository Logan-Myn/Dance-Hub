import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "react-hot-toast";
import { MembersTable } from "@/components/admin/MembersTable";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("react-hot-toast", () => {
  const toast = { success: jest.fn(), error: jest.fn() };
  return { __esModule: true, default: toast, toast };
});

const member = {
  id: "m1",
  displayName: "Ana",
  email: "ana@example.com",
  imageUrl: "",
  joinedAt: "2026-01-01T00:00:00.000Z",
  status: "active",
};

it("tells the owner why a member was not removed", async () => {
  const reason = "We couldn't cancel this member's subscription, so they were not removed. Please try again.";
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({ error: reason }) } as Response)
  ) as jest.Mock;
  jest.spyOn(window, "confirm").mockReturnValue(true);
  jest.spyOn(console, "error").mockImplementation(() => {});

  render(<MembersTable communitySlug="salsa" members={[member]} />);
  await userEvent.click(screen.getByRole("button", { name: "Remove" }));

  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(reason));
  expect(toast.success).not.toHaveBeenCalled();
});
