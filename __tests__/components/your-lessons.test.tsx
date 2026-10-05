import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { YourLessons } from "@/components/community-lessons/your-lessons";
import type { ViewerBooking } from "@/lib/private-lessons/data";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));

const past = (day: number): ViewerBooking => ({
  id: `b${day}`,
  lessonTitle: `Lesson on the ${day}th`,
  startsAt: `2026-09-${String(day).padStart(2, "0")}T16:00:00.000Z`,
  durationMinutes: 60,
  pricePaid: 40,
  status: "completed",
  teacherNotes: null,
  cutoffHours: 24,
  latePolicy: "none" as ViewerBooking["latePolicy"],
  locationType: "online",
});

it("shows the 3 most recent past lessons, then all of them on request", async () => {
  render(
    <YourLessons
      bookings={[past(10), past(14), past(12), past(20), past(11)]}
      teacherName="Logan"
      teacherZone={null}
      timeZone="Europe/Tallinn"
      now={new Date("2026-10-05T10:00:00Z")}
    />
  );
  const titles = () => screen.getAllByText(/^Lesson on the/).map((n) => n.textContent);
  expect(titles()).toEqual(["Lesson on the 20th", "Lesson on the 14th", "Lesson on the 12th"]);
  await userEvent.click(screen.getByRole("button", { name: "Show all 5 past lessons" }));
  expect(titles()).toHaveLength(5);
  await userEvent.click(screen.getByRole("button", { name: "Show fewer" }));
  expect(titles()).toHaveLength(3);
});

it("has no Show all button with 3 past lessons or fewer", () => {
  render(
    <YourLessons bookings={[past(10), past(11)]} teacherName="Logan" teacherZone={null} timeZone="Europe/Tallinn" now={new Date("2026-10-05T10:00:00Z")} />
  );
  expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
});
