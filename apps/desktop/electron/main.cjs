const { app, BrowserWindow } = require("electron");
const path = require("node:path");

function createWindow() {
  const appIcon = app.isPackaged
    ? path.join(process.resourcesPath, "app.asar", "favicon.ico")
    : path.join(__dirname, "../../../favicon.ico");
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#f6f3eb",
    autoHideMenuBar: true,
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const startUrl = process.env.ELECTRON_START_URL;

  if (startUrl) {
    mainWindow.loadURL(startUrl);
    return;
  }

  const indexPath = app.isPackaged
    ? path.join(__dirname, "../web/dist/index.html")
    : path.join(__dirname, "../../web/dist/index.html");
  mainWindow.loadFile(indexPath);
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
