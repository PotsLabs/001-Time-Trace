import { app, BrowserWindow } from 'electron';
import path from 'path';
import net from 'net';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === 'development';

const SERVER_PORT = 3001;
const VITE_PORT = 5173;

function waitForPort(port: number, timeout = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    const check = () => {
      const socket = new net.Socket();
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`Port ${port} not ready after ${timeout}ms`));
        } else {
          setTimeout(check, 200);
        }
      });
      socket.connect(port, 'localhost');
    };
    check();
  });
}

function startServer() {
  // Set env vars before the server module initialises
  process.env.PORT = String(SERVER_PORT);
  process.env.DB_PATH = path.join(app.getPath('userData'), 'timetrace.db');
  process.env.STATIC_PATH = path.join(__dirname, '..', 'dist');
  // Side-effect import starts Express
  return import('./server.cjs');
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'default',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.setMenuBarVisibility(false);

  if (isDev) {
    await waitForPort(VITE_PORT);
    win.loadURL(`http://localhost:${VITE_PORT}`);
    win.webContents.openDevTools();
  } else {
    await waitForPort(SERVER_PORT);
    win.loadURL(`http://localhost:${SERVER_PORT}`);
  }
}

app.whenReady().then(async () => {
  if (isDev) {
    await createWindow();
  } else {
    // Start server and create window concurrently.
    // createWindow() polls waitForPort(SERVER_PORT) internally, so it will
    // load the URL only once Express is accepting connections.
    await Promise.all([startServer(), createWindow()]);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
