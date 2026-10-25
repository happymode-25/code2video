import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths";
import { normaliseTheme } from "./themes";
import {
  DEFAULT_CAPTIONS,
  type Narration,
  type Project,
  type RenderRecord,
  type SceneSpec,
} from "./types";
import type { CharacterLook } from "./cast";

/**
 * Projects live in public/projects/<id>/ so the same files are both readable by
 * the app (audio playback, download links) and reachable by Remotion's bundler
 * during a render.
 *
 *   public/projects/<id>/project.json
 *   public/projects/<id>/narration.json
 *   public/projects/<id>/captions.srt
 *   public/projects/<id>/voice/scene-01.wav
 *   public/projects/<id>/out/<render>.mp4
 */

const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

export function isValidId(id: string): boolean {
  return ID_RE.test(id);
}

export function projectDir(id: string): string {
  if (!isValidId(id)) throw new Error(`invalid project id: ${id}`);
  return path.join(paths.projectsDir, id);
}

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "project";
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 7);
}

export function uniqueId(name: string): string {
  ensure();
  let id = `${slugify(name)}-${shortId()}`;
  while (fs.existsSync(path.join(paths.projectsDir, id))) id = `${slugify(name)}-${shortId()}`;
  return id;
}

export function ensure(): void {
  fs.mkdirSync(paths.projectsDir, { recursive: true });
  fs.mkdirSync(paths.jobsDir, { recursive: true });
}

/* ------------------------------------------------------------- defaults */

export function starterScene(narration: string, id = 1): SceneSpec {
  const firstLine = narration.split(/[.!?]/)[0]?.trim() ?? "Untitled scene";
  const title = firstLine.split(/\s+/).slice(0, 6).join(" ") || "Untitled scene";
  return {
    id,
    slug: `scene-${id}`,
    title,
    narration,
    blocks: [
      { type: "title", text: title },
      {
        type: "bullets",
        items: firstLine
          .split(/,| and /i)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 4),
      },
    ],
  };
}

export function newProject(name: string, scenes: SceneSpec[] = []): Project {
  const now = new Date().toISOString();
  return {
    id: uniqueId(name),
    name,
    createdAt: now,
    updatedAt: now,
    fps: 30,
    width: 1920,
    height: 1080,
    gap: 0.45,
    theme: normaliseTheme(undefined),
    captions: { ...DEFAULT_CAPTIONS },
    voice: "",
    scenes,
    renders: [],
  };
}

/* ----------------------------------------------------------------- CRUD */

export type ProjectSummary = {
  id: string;
  name: string;
  updatedAt: string;
  sceneCount: number;
  hasNarration: boolean;
  totalSeconds: number;
  renders: number;
  themeName: string;
};

export function normaliseProject(raw: Partial<Project> & { id: string }): Project {
  const scenes = (raw.scenes ?? []).map((s, i) => ({
    id: typeof s.id === "number" ? s.id : i + 1,
    slug: s.slug || `scene-${i + 1}`,
    title: s.title || `Scene ${i + 1}`,
    narration: s.narration ?? "",
    accent: s.accent,
    voice: s.voice,
    mode: s.mode,
    speaker: s.speaker,
    listener: s.listener,
    blocks: Array.isArray(s.blocks) ? s.blocks : [],
  }));
  return {
    id: raw.id,
    name: raw.name || raw.id,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
    fps: raw.fps ?? 30,
    width: raw.width ?? 1920,
    height: raw.height ?? 1080,
    gap: raw.gap ?? 0.45,
    theme: normaliseTheme(raw.theme),
    captions: { ...DEFAULT_CAPTIONS, ...(raw.captions ?? {}) },
    voice: raw.voice ?? "",
    cast: Array.isArray(raw.cast) ? (raw.cast as CharacterLook[]) : undefined,
    scenes,
    renders: raw.renders ?? [],
  };
}

export function saveProject(project: Project): Project {
  ensure();
  const dir = projectDir(project.id);
  fs.mkdirSync(dir, { recursive: true });
  const next: Project = { ...project, updatedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(next, null, 2), "utf-8");
  return next;
}

export function getProject(id: string): Project | null {
  try {
    const file = path.join(projectDir(id), "project.json");
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    return normaliseProject({ ...raw, id });
  } catch {
    return null;
  }
}

export function readNarration(id: string): Narration | null {
  try {
    const file = path.join(projectDir(id), "narration.json");
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as Narration;
  } catch {
    return null;
  }
}

export function deleteProject(id: string): boolean {
  if (!isValidId(id)) return false;
  const dir = projectDir(id);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

export function listProjects(): ProjectSummary[] {
  ensure();
  const out: ProjectSummary[] = [];
  for (const entry of fs.readdirSync(paths.projectsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isValidId(entry.name)) continue;
    const project = getProject(entry.name);
    if (!project) continue;
    const narration = readNarration(entry.name);
    out.push({
      id: project.id,
      name: project.name,
      updatedAt: project.updatedAt,
      sceneCount: project.scenes.length,
      hasNarration: Boolean(narration),
      totalSeconds: narration?.total ?? 0,
      renders: project.renders.length,
      themeName: project.theme.name,
    });
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function addRender(projectId: string, record: RenderRecord): Project | null {
  const project = getProject(projectId);
  if (!project) return null;
  const renders = [record, ...project.renders].slice(0, 12);
  return saveProject({ ...project, renders });
}

export function outDir(id: string): string {
  const dir = path.join(projectDir(id), "out");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeSrt(id: string, srt: string): string {
  const file = path.join(projectDir(id), "captions.srt");
  fs.writeFileSync(file, srt, "utf-8");
  return file;
}
