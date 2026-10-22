export type UploadPart = {
  path: string;
  token: string;
  fileIndex: number;
  start: number;
  end: number;
};
export type UploadPlan = {
  itemId: string;
  uploads: UploadPart[];
  completed: Set<string>;
};
export function fileType(file: File) {
  if (file.type) return file.type;
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  return (
    (
      {
        heic: "image/heic",
        heif: "image/heif",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        mp4: "video/mp4",
        mov: "video/quicktime",
        webm: "video/webm",
      } as Record<string, string>
    )[extension || ""] || "application/octet-stream"
  );
}
function sendPart(
  file: File,
  part: UploadPart,
  progress: (loaded: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = new URL(
      `/storage/v1/object/upload/sign/content-media/${part.path}`,
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
    url.searchParams.set("token", part.token);
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", fileType(file));
    xhr.timeout = 240000;
    xhr.upload.onprogress = (event) => progress(event.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(
            new Error(
              `Upload failed (${xhr.status}). Retry to resume the missing part.`,
            ),
          );
    xhr.onerror = () =>
      reject(
        new Error("Upload connection lost. Retry to resume the missing part."),
      );
    xhr.ontimeout = () =>
      reject(new Error("Upload timed out. Retry to resume the missing part."));
    xhr.send(file.slice(part.start, part.end, fileType(file)));
  });
}
export async function uploadFiles(
  files: File[],
  plan: UploadPlan,
  progress: (percent: number) => void,
) {
  const total = plan.uploads.reduce((n, p) => n + p.end - p.start, 0);
  let sent = plan.uploads
    .filter((p) => plan.completed.has(p.path))
    .reduce((n, p) => n + p.end - p.start, 0);
  for (const part of plan.uploads) {
    if (plan.completed.has(part.path)) continue;
    for (let attempt = 0; ; attempt++) {
      try {
        await sendPart(files[part.fileIndex], part, (loaded) =>
          progress(Math.min(99, Math.round(((sent + loaded) / total) * 100))),
        );
        break;
      } catch (error) {
        if (attempt >= 2) throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * (attempt + 1)),
        );
      }
    }
    plan.completed.add(part.path);
    sent += part.end - part.start;
    progress(Math.round((sent / total) * 100));
  }
}
