export function extractFilesFromPaste(event: ClipboardEvent): File[] {
  const clipboard = event.clipboardData;
  if (!clipboard) {
    return [];
  }

  const files: File[] = [];
  const { items, files: fileList } = clipboard;

  if (items) {
    for (const item of Array.from(items)) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }
  }

  if (files.length === 0 && fileList) {
    for (const file of Array.from(fileList)) {
      if (file.type.startsWith("image/")) {
        files.push(file);
      }
    }
  }

  return files;
}

export function extractFilesFromDrop(event: DragEvent): File[] {
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) {
    return [];
  }

  const output: File[] = [];

  if (dataTransfer.items) {
    for (const item of Array.from(dataTransfer.items)) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file && file.type.startsWith("image/")) {
          output.push(file);
        }
      }
    }
  }

  if (output.length === 0 && dataTransfer.files) {
    for (const file of Array.from(dataTransfer.files)) {
      if (file.type.startsWith("image/")) {
        output.push(file);
      }
    }
  }

  return output;
}

