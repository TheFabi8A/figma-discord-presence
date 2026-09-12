const EventEmitter = require("events");
const RPC = require("discord-rpc");

const {
  getIsFigmaRunning,
  getFigmaMetaData,
  getIsFigmaActive,
} = require("./figma");

const logger = require("./logger");
const config = require("./config");
const events = require("./events");

const CLIENT_ID = "866719067092418580";
const RECONNECT_DELAY = 5000;

class Activity extends EventEmitter {
  constructor() {
    super();

    this.client = null;
    this.setActivityInterval = null;
    this.reconnectTimer = null;
    this.startTime = null;

    this.isConnecting = false;
    this.autoReconnect = true;
  }

  async login() {
    if (this.isConnecting || this.client !== null) {
      return;
    }

    this.isConnecting = true;

    this.emit(events.DISCORD_CONNECTING);

    const client = new RPC.Client({ transport: "ipc" });

    this.client = client;

    client.on("ready", () => {
      if (this.client !== client) return;

      logger.debug("activity", "discord ready");

      this.isConnecting = false;

      this.emit(events.DISCORD_READY);

      this.setActivity();
      this.startInterval();
    });

    client.on("disconnected", async () => {
      if (this.client !== client) return;

      logger.debug("activity", "discord disconnected");

      this.isConnecting = false;

      this.emit(events.DISCORD_DISCONNECTED);

      await this.destroy();

      this.scheduleReconnect();
    });

    try {
      await client.login({
        clientId: CLIENT_ID,
      });
    } catch (err) {
      if (this.client !== client) {
        return;
      }

      logger.error("activity", err.message);

      this.isConnecting = false;
      this.client = null;

      try {
        await client.destroy();
      } catch {}

      this.emit(events.DISCORD_LOGIN_ERROR);

      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (!this.autoReconnect) {
      return;
    }

    if (this.reconnectTimer !== null) {
      return;
    }

    logger.debug(
      "activity",
      `discord reconnect scheduled in ${RECONNECT_DELAY / 1000}s`,
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;

      if (!this.autoReconnect) {
        return;
      }

      await this.login();
    }, RECONNECT_DELAY);
  }

  cancelReconnect() {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  async setActivity() {
    if (this.client === null) return;

    try {
      const isFigmaRunning = await getIsFigmaRunning();

      if (isFigmaRunning) {
        if (!this.startTime) {
          this.startTime = new Date();
        }
      } else {
        await this.client.clearActivity();
        this.startTime = null;
        return;
      }

      const { currentFigmaFilename, shareLink } = await getFigmaMetaData();

      if (currentFigmaFilename === null) {
        return;
      }

      const isFigmaActive = await getIsFigmaActive();

      const isHideFilenames = config.get("hideFilenames");
      const isHideStatus = config.get("hideStatus");
      const isHideViewButton = config.get("hideViewButton");

      const details = [
        !isHideStatus ? (isFigmaActive ? "Active" : "Idle") : "",
        `${!isHideStatus && !isHideFilenames ? " " : ""}`,
        !isHideFilenames ? `in: "${currentFigmaFilename}"` : undefined,
      ];

      this.client.setActivity({
        details: details.join("") || undefined,
        startTimestamp: this.startTime,
        largeImageKey: "logo",
        largeImageText: "Designing in Figma",
        buttons:
          !isHideViewButton && shareLink
            ? [{ label: "View in Figma", url: shareLink }]
            : undefined,
        instance: false,
      });
    } catch (err) {
      logger.error("activity", `Failed to setActivity: ${err}`);
    }
  }

  startInterval() {
    if (this.setActivityInterval !== null) {
      return;
    }

    this.setActivityInterval = setInterval(() => {
      this.setActivity();
    }, 15e3);
  }

  async stopInterval() {
    if (this.setActivityInterval !== null) {
      clearInterval(this.setActivityInterval);
      this.setActivityInterval = null;
    }

    this.startTime = null;
  }

  async updateOptions() {
    await this.setActivity();
  }

  async connect() {
    this.autoReconnect = true;

    this.cancelReconnect();

    await this.login();
  }

  async disconnect() {
    this.autoReconnect = false;

    this.cancelReconnect();

    await this.destroy();
  }

  async destroy() {
    const client = this.client;

    this.client = null;
    this.isConnecting = false;

    await this.stopInterval();

    if (!client) {
      return;
    }

    try {
      await client.clearActivity();
    } catch {}

    try {
      await client.destroy();
    } catch {}
  }
}

module.exports = Activity;
