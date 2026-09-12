const electron = require("electron");

const events = require("./lib/events");
const updater = require("./lib/updater");
const config = require("./lib/config");
const logger = require("./lib/logger");
const CustomTray = require("./lib/tray");
const Activity = require("./lib/activity");

const { app } = electron;

let tray, activity;

const state = {
  isDiscordConnecting: false,
  isDiscordReady: false,
  isFigmaReady: false,
};

async function quit() {
  logger.debug("main", "quitting...");

  if (activity) {
    await activity.destroy();
  }

  app.quit();
}

if (!app.requestSingleInstanceLock()) {
  logger.debug("main", "second instance detected, quitting this one...");
  app.quit();
}

if (process.platform === "darwin") app.dock.hide();

app
  .whenReady()
  .then(() => updater.update())
  .then(() => config.save(0, true))
  .then(() => config.load())
  .then(() => (tray = new CustomTray(state)))
  .then(() => (activity = new Activity()))
  .then(() => registerEvents())
  .then(async () => {
    await activity.connect();
  })
  .then(() => logger.debug("main", "initialized!"))
  .catch((err) => logger.error("main", err.message));

function registerEvents() {
  tray.on(events.QUIT, async () => await quit());

  tray.on(events.UPDATE_OPTIONS, async () => {
    await activity.updateOptions();
  });

  tray.on(events.CONNECT, async () => {
    await activity.connect();
  });

  tray.on(events.DISCONNECT, async () => {
    await activity.disconnect();
  });

  tray.on(events.CHECK_FOR_UPDATES, async () => {
    await updater.simpleCheck();
  });

  activity.on(events.DISCORD_CONNECTING, () => {
    logger.debug("main", "discord connecting...");

    state.isDiscordReady = false;
    state.isDiscordConnecting = true;

    tray.setState(state);
  });

  activity.on(events.DISCORD_READY, () => {
    logger.debug("main", "discord ready!");

    state.isDiscordReady = true;
    state.isDiscordConnecting = false;

    tray.setState(state);
  });

  activity.on(events.DISCORD_DISCONNECTED, () => {
    logger.debug("main", "discord disconnected");

    state.isDiscordReady = false;
    state.isDiscordConnecting = false;

    tray.setState(state);
  });

  activity.on(events.DISCORD_LOGIN_ERROR, () => {
    logger.debug("main", "discord login failed; automatic reconnect scheduled");

    state.isDiscordReady = false;
    state.isDiscordConnecting = false;

    tray.setState(state);
  });
}

app.on("window-all-closed", () => {
  // should not quit
});

process.on("unhandledRejection", (err) =>
  logger.error("unhandledRejection", err.message),
);

process.on("uncaughtException", (err) =>
  logger.error("uncaughtException", err.message),
);
