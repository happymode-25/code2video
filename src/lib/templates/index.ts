import type { SerializableProject } from "../engine/script";
import castDemoJson from "./cast-demo.json";
import demoJson from "./demo.json";
import osiJson from "./osi.json";

export type Template = {
  id: string;
  name: string;
  description: string;
  project: SerializableProject | null;
};

const demo = demoJson as unknown as SerializableProject;
const osi = osiJson as unknown as SerializableProject;
const castDemo = castDemoJson as unknown as SerializableProject;

export const TEMPLATES: Template[] = [
  {
    id: "blank",
    name: "Blank",
    description: "One scene with placeholder narration.",
    project: null,
  },
  {
    id: "osi",
    name: "The OSI Model",
    description: "14 scenes, 34 blocks - the full worked example.",
    project: osi,
  },
  {
    id: "cast",
    name: "Two Teachers (characters)",
    description: "9 scenes with two lip-syncing characters and every documentation block.",
    project: castDemo,
  },
  {
    id: "blocks",
    name: "Block sampler",
    description: "Two scenes showing the block library.",
    project: demo,
  },
];

export const templateById = (id: string): Template =>
  TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
