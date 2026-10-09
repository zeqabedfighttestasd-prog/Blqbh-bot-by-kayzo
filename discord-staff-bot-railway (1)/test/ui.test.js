import assert from "node:assert/strict";
import test from "node:test";
import { ButtonStyle } from "discord.js";
import {
  applicationFirstModal,
  applicationPanel,
  applicationReview,
  applicationSecondModal,
  statusReviewEmbed,
  ticketCloseRow,
  ticketModal,
  ticketPanel,
} from "../src/ui.js";

function modalFields(modal) {
  return modal.toJSON().components.map((row) => row.components[0]);
}

test("application panel uses the requested copy and blue hammer button", () => {
  const panel = applicationPanel();
  assert.equal(panel.embeds[0].toJSON().title, "📋 Trainee Staff Application");
  assert.match(panel.embeds[0].toJSON().description, /Want to join our staff team/);
  assert.match(panel.embeds[0].toJSON().description, /Good luck with your application! 🍀/);
  const button = panel.components[0].toJSON().components[0];
  assert.equal(button.label, "Apply");
  assert.equal(button.emoji.name, "🔨");
  assert.equal(button.style, ButtonStyle.Primary);
});

test("staff application form has three first questions and two final questions", () => {
  const first = modalFields(applicationFirstModal("app-id"));
  const second = modalFields(applicationSecondModal("app-id"));
  assert.equal(first.length, 3);
  assert.equal(second.length, 2);
  assert.equal(first[0].label, "What is your IGN");
  assert.equal(first[1].label, "What is your age");
  assert.equal(
    first[2].label,
    "Why do you want to apply for staff position",
  );
  assert.equal(
    second[0].placeholder,
    "What timezones are you in, and where are you from?",
  );
  assert.equal(second[1].label, "How many partnerships can you do?");
  for (const field of [...first, ...second]) {
    assert.ok(field.label.length <= 45, `Modal label too long: ${field.label}`);
  }
});

test("ticket center shows the requested copy and a Support/Report dropdown", () => {
  const panel = ticketPanel();
  const description = panel.embeds[0].toJSON().description;
  assert.equal(panel.embeds[0].toJSON().title, "🎫 TICKET CENTER");
  assert.match(
    description,
    /Need help\? Select a category from the dropdown menu below to create a ticket\./,
  );
  assert.match(description, /Report a user, staff member, or rule violation\./);
  assert.match(description, /Get help with questions, issues, or other inquiries\./);
  assert.match(description, /\*Please avoid creating duplicate tickets\.\*/);
  const menu = panel.components[0].toJSON().components[0];
  assert.equal(menu.custom_id, "ticket:select");
  assert.deepEqual(menu.options.map((option) => option.value), ["report", "support"]);
  assert.equal(modalFields(ticketModal("support"))[0].label, "What is your question?");
  assert.deepEqual(
    modalFields(ticketModal("report")).map((field) => field.placeholder ?? field.label),
    [
      "Discord username of the person you want to report",
      "In-game name",
      "Describe what the person did.",
    ],
  );
});

test("tickets have a red close button that can be disabled after closing", () => {
  const button = ticketCloseRow("ticket-id").toJSON().components[0];
  assert.equal(button.custom_id, "ticket:close:ticket-id");
  assert.equal(button.label, "Close Ticket");
  assert.equal(button.emoji.name, "🔒");
  assert.equal(button.style, ButtonStyle.Danger);
  assert.equal(ticketCloseRow("ticket-id", true).toJSON().components[0].disabled, true);
});

test("review decision keeps application answers visible", () => {
  const submitted = applicationReview(
    {
      id: "app-id",
      userId: "user-id",
      submittedAt: 1_800_000_000_000,
      answers: {
        ign: "Builder",
        age: "18",
        why: "I want to help.",
        timezone: "UTC",
        partnerships: "3",
      },
    },
    null,
  );
  const updated = statusReviewEmbed(
    { id: "app-id", denialReason: "Needs more experience." },
    "reviewer-id",
    "denied",
    submitted,
  );
  assert.equal(updated.toJSON().fields.length, 6);
  assert.equal(updated.toJSON().fields[0].value, "Builder");
  assert.equal(updated.toJSON().fields[5].name, "Denial reason");
});
