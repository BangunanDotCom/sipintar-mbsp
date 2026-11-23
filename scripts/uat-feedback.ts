import { constants } from "node:fs";
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  rmdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve, basename } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { ZodError } from "zod";
import {
  actionSchema,
  entrySchema,
  FeedbackError,
  recordSchema,
  sessionSchema,
  summarizeObservation,
  type Entry,
} from "./uat-feedback-model.js";
import { renderFeedbackReport } from "./uat-feedback-report.js";

const prefix = "staylink-uat-feedback-";
const identifier = /^F-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const eventFile = /^\d{6}\.json$/;
const maxBytes = 12_288;

async function readJson(path: string) {
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > maxBytes)
      throw new FeedbackError("Input mestilah fail JSON kecil.");
    const buffer = Buffer.alloc(maxBytes + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const next = await file.read(
        buffer,
        bytesRead,
        buffer.length - bytesRead,
        bytesRead,
      );
      if (next.bytesRead === 0) break;
      bytesRead += next.bytesRead;
    }
    if (bytesRead > maxBytes)
      throw new FeedbackError("Input JSON melebihi had.");
    try {
      return JSON.parse(
        buffer.subarray(0, bytesRead).toString("utf8"),
      ) as unknown;
    } catch {
      throw new FeedbackError("Input bukan JSON yang sah.");
    }
  } finally {
    await file.close();
  }
}

async function temporaryRoot() {
  const root = await realpath(tmpdir());
  for (let path = root; ; path = dirname(path)) {
    try {
      const metadata = join(path, ".git");
      const marker = await lstat(metadata);
      if (marker.isDirectory()) await lstat(join(metadata, "HEAD"));
      throw new FeedbackError(
        "Gunakan direktori sementara di luar checkout Git.",
      );
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw error;
    }
    if (path === dirname(path)) return root;
  }
}

async function privateDirectory(path: string) {
  const info = await lstat(path);
  if (
    !info.isDirectory() ||
    (info.mode & 0o077) !== 0 ||
    (process.getuid && info.uid !== process.getuid())
  )
    throw new FeedbackError(
      "Direktori latihan mestilah persendirian milik pengguna semasa.",
    );
}

async function atomicEntry(path: string, entry: Entry) {
  const scratch = await mkdtemp(join(dirname(path), ".pending-"));
  const candidate = join(scratch, "event.json");
  try {
    await writeFile(candidate, JSON.stringify(entry) + "\n", {
      mode: 0o600,
      flag: "wx",
      flush: true,
    });
    await link(candidate, path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST")
      throw new FeedbackError(
        "Versi telah berubah. Baca laporan terkini sebelum mencuba semula.",
      );
    throw error;
  } finally {
    await rm(candidate, { force: true });
    await rmdir(scratch);
  }
}

const numbered = (version: number) =>
  String(version).padStart(6, "0") + ".json";
async function readEntries(directory: string) {
  await privateDirectory(directory);
  const names = (await readdir(directory))
    .filter((name) => eventFile.test(name))
    .sort();
  return Promise.all(
    names.map(async (name, index) => {
      if (name !== numbered(index + 1))
        throw new FeedbackError("Jejak versi rekod terputus.");
      return entrySchema.parse(await readJson(join(directory, name)));
    }),
  );
}

const usage = `Maklum balas UAT sintetik · STAYLink MBSP
  init --session UAT-ID --date YYYY-MM-DD --commit SHA
  record --dir DIREKTORI --input JSON
  update --dir DIREKTORI --id ID --version N --input JSON
  export --dir DIREKTORI --format md|csv
Mod latihan memerlukan NODE_ENV=test/development dan STAYLINK_UAT_FEEDBACK=true.`;

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      session: { type: "string" },
      date: { type: "string" },
      commit: { type: "string" },
      dir: { type: "string" },
      input: { type: "string" },
      id: { type: "string" },
      version: { type: "string" },
      format: { type: "string" },
      help: { type: "boolean" },
    },
    allowPositionals: true,
  });
  if (values.help || !positionals.length) {
    console.log(usage);
    return;
  }
  if (
    process.env.STAYLINK_UAT_FEEDBACK !== "true" ||
    !["test", "development"].includes(process.env.NODE_ENV ?? "")
  )
    throw new FeedbackError("Perintah ini memerlukan mod latihan tempatan.");
  const [command] = positionals;
  const supported = {
    init: ["session", "date", "commit"],
    record: ["dir", "input"],
    update: ["dir", "id", "version", "input"],
    export: ["dir", "format"],
  };
  if (
    positionals.length !== 1 ||
    !Object.hasOwn(supported, command) ||
    Object.keys(values).sort().join() !==
      [...supported[command as keyof typeof supported]].sort().join()
  )
    throw new FeedbackError("Argumen perintah tidak sah. Rujuk --help.");

  const root = await temporaryRoot();
  if (command === "init") {
    const session = sessionSchema.parse({
      id: values.session,
      dateMyt: values.date,
      commit: values.commit,
    });
    const directory = await mkdtemp(join(root, prefix));
    await writeFile(
      join(directory, "session.json"),
      JSON.stringify(session) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    console.log(directory);
    return;
  }
  const directory = resolve(values.dir!);
  if (dirname(directory) !== root || !basename(directory).startsWith(prefix))
    throw new FeedbackError(
      "Gunakan direktori persendirian yang dijana oleh init.",
    );
  await privateDirectory(directory);
  const session = sessionSchema.parse(
    await readJson(join(directory, "session.json")),
  );
  if (command === "record") {
    const event = recordSchema.parse(await readJson(values.input!));
    const id = "F-" + randomUUID();
    const recordDir = join(directory, id);
    await mkdir(recordDir, { mode: 0o700 });
    await atomicEntry(join(recordDir, numbered(1)), {
      at: new Date().toISOString(),
      event,
    });
    console.log(id);
    return;
  }
  if (command === "update") {
    const version = Number(values.version);
    if (
      !identifier.test(values.id!) ||
      !/^\d{1,6}$/.test(values.version!) ||
      version < 1 ||
      version >= 999999
    )
      throw new FeedbackError("ID atau versi rekod tidak sah.");
    const recordDir = join(directory, values.id!);
    const entries = await readEntries(recordDir);
    if (entries.length !== version)
      throw new FeedbackError(
        "Versi telah berubah. Baca laporan terkini sebelum mencuba semula.",
      );
    const entry = {
      at: new Date().toISOString(),
      event: actionSchema.parse(await readJson(values.input!)),
    };
    const { state } = summarizeObservation([...entries, entry]);
    await atomicEntry(join(recordDir, numbered(version + 1)), entry);
    console.log(`${values.id} · v${version + 1} · ${state}`);
    return;
  }
  if (values.format !== "md" && values.format !== "csv")
    throw new FeedbackError("Format eksport mestilah md atau csv.");
  const names = (await readdir(directory))
    .filter((name) => identifier.test(name))
    .sort();
  const records = [];
  for (const id of names) {
    const entries = await readEntries(join(directory, id));
    if (entries.length) records.push({ id, entries });
  }
  const report = join(
    await mkdtemp(join(directory, "laporan-")),
    `uat.${values.format}`,
  );
  await writeFile(
    report,
    renderFeedbackReport(session, records, values.format),
    { mode: 0o600, flag: "wx" },
  );
  console.log(report);
}

try {
  await main();
} catch (error) {
  process.exitCode = 1;
  console.error(
    error instanceof FeedbackError
      ? error.message
      : error instanceof ZodError
        ? `Medan input tidak sah: ${[...new Set(error.issues.map((issue) => issue.path.join(".") || "format"))].join(", ")}.`
        : "Perintah UAT gagal. Semak CLI, fail dan kebenaran direktori.",
  );
}
