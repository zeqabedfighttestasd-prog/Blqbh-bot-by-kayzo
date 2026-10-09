import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { StateStore } from "../src/store.js";

function withStore(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "discord-bot-state-"));
  try {
    run(new StateStore(path.join(directory, "state.json")));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("new state starts with applications open and no panels", () => {
  withStore((store) => {
    assert.equal(store.get().applicationsOpen, true);
    assert.deepEqual(store.get().panels, {
      applications: null,
      tickets: null,
    });
  });
});

test("application setting and panel message IDs persist after reload", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "discord-bot-state-"));
  const filePath = path.join(directory, "state.json");
  try {
    const first = new StateStore(filePath);
    first.setApplicationsOpen(false);
    first.setPanel("applications", "application-message");
    const second = new StateStore(filePath);
    assert.equal(second.get().applicationsOpen, false);
    assert.equal(second.get().panels.applications, "application-message");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("ticket updates persist close state and the control message ID", () => {
  withStore((store) => {
    store.addTicket({
      id: "ticket-1",
      userId: "user-1",
      channelId: "channel-1",
      type: "support",
    });
    const closedAt = 1_800_000_000_000;
    store.updateTicket("ticket-1", {
      closeMessageId: "message-1",
      closedAt,
      closedBy: "user-1",
    });
    assert.deepEqual(store.get().tickets["ticket-1"], {
      id: "ticket-1",
      userId: "user-1",
      channelId: "channel-1",
      type: "support",
      closeMessageId: "message-1",
      closedAt,
      closedBy: "user-1",
    });
  });
});

test("open ticket lookup finds one active ticket and ignores closed tickets", () => {
  withStore((store) => {
    store.addTicket({
      id: "ticket-open",
      userId: "user-1",
      channelId: "channel-open",
      type: "support",
    });
    store.addTicket({
      id: "ticket-closed",
      userId: "user-1",
      channelId: "channel-closed",
      type: "report",
      closedAt: 1_800_000_000_000,
    });
    store.addTicket({
      id: "ticket-other-user",
      userId: "user-2",
      channelId: "channel-other",
      type: "support",
    });

    assert.equal(store.findOpenTicketForUser("user-1").id, "ticket-open");
    assert.equal(store.findOpenTicketForUser("user-2").id, "ticket-other-user");
    assert.equal(store.findOpenTicketForUser("user-3"), undefined);
  });
});

test("a denied applicant is blocked for seven days, then may apply", () => {
  withStore((store) => {
    const deniedAt = 1_800_000_000_000;
    store.createApplication({
      id: "application-1",
      userId: "user-1",
      status: "pending",
      answers: { ign: "Player" },
      createdAt: deniedAt - 1000,
    });
    store.denyApplication("application-1", "Try again later", deniedAt);
    assert.equal(
      store.getCooldownRemaining("user-1", deniedAt + 6 * 24 * 60 * 60 * 1000),
      24 * 60 * 60 * 1000,
    );
    assert.equal(
      store.getCooldownRemaining("user-1", deniedAt + 7 * 24 * 60 * 60 * 1000),
      0,
    );
    assert.equal(store.get().applications["application-1"].answers, null);
  });
});

test("active application lookup excludes completed applications", () => {
  withStore((store) => {
    store.createApplication({
      id: "draft",
      userId: "user-1",
      status: "secondStage",
      answers: {},
    });
    assert.equal(store.findActiveApplication("user-1").id, "draft");
    store.updateApplication("draft", { status: "accepted" });
    assert.equal(store.findActiveApplication("user-1"), undefined);
  });
});
