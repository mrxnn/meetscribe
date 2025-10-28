import { app, BrowserWindow, shell, ipcMain, desktopCapturer } from "electron";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { update } from "./update";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, "../..");

export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith("6.1")) app.disableHardwareAcceleration();

// Set application name for Windows 10+ notifications
if (process.platform === "win32") app.setAppUserModelId(app.getName());

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win: BrowserWindow | null = null;
const preload = path.join(__dirname, "../preload/index.mjs");
const indexHtml = path.join(RENDERER_DIST, "index.html");

async function createWindow() {
  win = new BrowserWindow({
    title: "Main window",
    icon: path.join(process.env.VITE_PUBLIC, "favicon.ico"),
    webPreferences: {
      preload,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // nodeIntegration: true,

      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      // contextIsolation: false,
    },
  });

  // Set permissions for audio/video capture
  win.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const allowedPermissions = ["media", "mediaKeySystem", "desktop-audio"];
      if (allowedPermissions.includes(permission)) {
        callback(true);
      } else {
        callback(false);
      }
    }
  );

  // Handle permission checks
  win.webContents.session.setPermissionCheckHandler(
    (webContents, permission) => {
      const allowedPermissions = ["media", "mediaKeySystem", "desktop-audio"];
      return allowedPermissions.includes(permission);
    }
  );

  if (VITE_DEV_SERVER_URL) {
    // #298
    win.loadURL(VITE_DEV_SERVER_URL);
    // Open devTool if the app is not packaged
    win.webContents.openDevTools();
  } else {
    win.loadFile(indexHtml);
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
  });

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:")) shell.openExternal(url);
    return { action: "deny" };
  });

  // Auto update
  update(win);
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  win = null;
  if (process.platform !== "darwin") app.quit();
});

app.on("second-instance", () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on("activate", () => {
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length) {
    allWindows[0].focus();
  } else {
    createWindow();
  }
});

// New window example arg: new windows url
ipcMain.handle("open-win", (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`);
  } else {
    childWindow.loadFile(indexHtml, { hash: arg });
  }
});

// --------- Audio Capture IPC Handlers ---------
ipcMain.handle("get-audio-sources", async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["window", "screen"],
      fetchWindowIcons: true,
    });
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
    }));
  } catch (error) {
    console.error("Error getting audio sources:", error);
    throw error;
  }
});

ipcMain.handle("save-audio-file", async (_event, audioBuffer: ArrayBuffer) => {
  try {
    // Create recordings directory in project root
    const recordingsDir = path.join(process.env.APP_ROOT || "", "recordings");

    // Create the directory if it doesn't exist
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
      console.log("📁 Created recordings directory:", recordingsDir);
    }

    const timestamp = Date.now();
    const date = new Date(timestamp);
    const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
    const timeStr = date.toTimeString().slice(0, 8).replace(/:/g, "-"); // HH-MM-SS
    const fileName = `recording_${dateStr}_${timeStr}.wav`;
    const filePath = path.join(recordingsDir, fileName);

    console.log("Attempting to save audio file...");
    console.log("Buffer size:", audioBuffer.byteLength, "bytes");
    console.log("Recordings directory:", recordingsDir);
    console.log("File name:", fileName);

    const buffer = Buffer.from(audioBuffer);
    fs.writeFileSync(filePath, buffer);

    // Verify file was written
    const stats = fs.statSync(filePath);
    console.log("✅ Audio file saved successfully!");
    console.log("File size on disk:", stats.size, "bytes");
    console.log("File path:", filePath);

    return filePath;
  } catch (error) {
    console.error("Error saving audio file:", error);
    console.error(
      "Error details:",
      error instanceof Error ? error.message : String(error)
    );
    throw new Error(
      `Failed to save audio file: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
});

ipcMain.handle("transcribe-audio", async (event, filePath: string) => {
  try {
    // Path to the faster-whisper-xxl executable
    const whisperExePath = path.join(
      process.env.APP_ROOT || "",
      "resources",
      "Faster-Whisper-XXL",
      "faster-whisper-xxl.exe"
    );

    // Check if the executable exists
    if (!fs.existsSync(whisperExePath)) {
      throw new Error(
        `Faster-Whisper-XXL executable not found at: ${whisperExePath}\n` +
          "Please extract Faster-Whisper-XXL to the resources/Faster-Whisper-XXL folder."
      );
    }

    // Send initial progress update
    event.sender.send("transcription-progress", {
      status: "downloading",
      message: "Initializing Whisper model (first time will download model)...",
    });

    // Prepare Whisper command
    // Options: --language English, --model base (small, fast model)
    const args = [
      filePath,
      "--language",
      "English",
      "--model",
      "base",
      "--output_format",
      "txt",
      "--output_dir",
      path.dirname(filePath),
    ];

    console.log("Running Faster-Whisper-XXL:", whisperExePath);
    console.log("Arguments:", args.join(" "));

    // Spawn the Faster-Whisper process
    const whisperProcess = spawn(whisperExePath, args, {
      cwd: path.dirname(whisperExePath), // Run from the executable's directory
    });

    let outputText = "";
    let errorText = "";

    // Capture stdout
    whisperProcess.stdout.on("data", (data: Buffer) => {
      const output = data.toString();
      console.log("Whisper output:", output);

      // Send progress updates if they contain progress info
      if (output.includes("%") || output.includes("Processing")) {
        event.sender.send("transcription-progress", {
          status: "transcribing",
          message: output.trim(),
        });
      }

      outputText += output;
    });

    // Capture stderr (Whisper often outputs progress here)
    whisperProcess.stderr.on("data", (data: Buffer) => {
      const error = data.toString();
      console.log("Whisper stderr:", error);

      // Send progress updates (don't treat all stderr as errors)
      event.sender.send("transcription-progress", {
        status: "transcribing",
        message: error.trim(),
      });

      errorText += error;
    });

    // Wait for the process to complete
    const exitCode = await new Promise<number>((resolve) => {
      whisperProcess.on("close", (code) => {
        resolve(code || 0);
      });
    });

    if (exitCode !== 0) {
      throw new Error(
        `Whisper process exited with code ${exitCode}\n${errorText}`
      );
    }

    // Read the generated transcript file
    const baseName = path.basename(filePath, path.extname(filePath));
    const transcriptPath = path.join(path.dirname(filePath), `${baseName}.txt`);

    let transcriptText = "";
    if (fs.existsSync(transcriptPath)) {
      transcriptText = fs.readFileSync(transcriptPath, "utf-8");

      // Clean up the transcript file
      try {
        fs.unlinkSync(transcriptPath);
      } catch (cleanupError) {
        console.error("Error cleaning up transcript file:", cleanupError);
      }
    } else {
      // Fallback to stdout if no file was created
      transcriptText = outputText;
    }

    // Send completion progress
    event.sender.send("transcription-progress", {
      status: "complete",
      message: "Transcription complete!",
    });

    // Clean up audio file
    try {
      fs.unlinkSync(filePath);
    } catch (cleanupError) {
      console.error("Error cleaning up audio file:", cleanupError);
    }

    return {
      text: transcriptText.trim(),
    };
  } catch (error) {
    console.error("Error transcribing audio:", error);
    event.sender.send("transcription-progress", {
      status: "error",
      message: error instanceof Error ? error.message : "Transcription failed",
    });

    return {
      text: "",
      error: error instanceof Error ? error.message : "Transcription failed",
    };
  }
});
