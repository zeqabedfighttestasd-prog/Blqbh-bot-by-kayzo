import fs from "node:fs";
import path from "node:path";

const initialState = () => ({
  version: 1,
  applicationsOpen: true,
  panels: { applications: null, tickets: null },
  applications: {},
  cooldowns: {},
  tickets: {},
});

export class StateStore {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.state = this.read();
  }

  read() {
    if (!fs.existsSync(this.filePath)) return initialState();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return {
        ...initialState(),
        ...parsed,
        panels: { ...initialState().panels, ...parsed.panels },
        applications: parsed.applications ?? {},
        cooldowns: parsed.cooldowns ?? {},
        tickets: parsed.tickets ?? {},
      };
    } catch (error) {
      throw new Error(
        `Cannot read bot state at ${this.filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  save() {
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(this.state, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, this.filePath);
  }

  get() {
    return this.state;
  }

  setPanel(kind, messageId) {
    this.state.panels[kind] = messageId;
    this.save();
  }

  findActiveApplication(userId) {
    return Object.values(this.state.applications).find(
      (application) =>
        application.userId === userId &&
        ["firstStage", "secondStage", "pending"].includes(application.status),
    );
  }

  getCooldownRemaining(userId, now = Date.now()) {
    const deniedAt = this.state.cooldowns[userId];
    if (!deniedAt) return 0;
    return Math.max(0, deniedAt + 7 * 24 * 60 * 60 * 1000 - now);
  }

  createApplication(application) {
    this.state.applications[application.id] = application;
    this.save();
  }

  deleteApplication(id) {
    delete this.state.applications[id];
    this.save();
  }

  updateApplication(id, updates) {
    const current = this.state.applications[id];
    if (!current) return null;
    this.state.applications[id] = { ...current, ...updates };
    this.save();
    return this.state.applications[id];
  }

  denyApplication(id, reason, decidedAt) {
    const application = this.state.applications[id];
    if (!application) return null;
    this.state.applications[id] = {
      ...application,
      status: "denied",
      answers: null,
      denialReason: reason,
      decidedAt,
    };
    this.state.cooldowns[application.userId] = decidedAt;
    this.save();
    return this.state.applications[id];
  }

  acceptApplication(id, decidedAt) {
    const application = this.state.applications[id];
    if (!application) return null;
    this.state.applications[id] = {
      ...application,
      status: "accepted",
      answers: null,
      decidedAt,
    };
    this.save();
    return this.state.applications[id];
  }

  addTicket(ticket) {
    this.state.tickets[ticket.id] = ticket;
    this.save();
  }

  findOpenTicketForUser(userId) {
    return Object.values(this.state.tickets).find(
      (ticket) => ticket.userId === userId && !ticket.closedAt,
    );
  }

  updateTicket(id, updates) {
    const current = this.state.tickets[id];
    if (!current) return null;
    this.state.tickets[id] = { ...current, ...updates };
    this.save();
    return this.state.tickets[id];
  }

  setApplicationsOpen(isOpen) {
    this.state.applicationsOpen = isOpen;
    this.save();
  }
}
