/**
 * Builds src/lib/templates/osi.json from the approved OSI video's narration.
 * Run:  node scripts/make-osi-template.mjs
 *
 * The narration text is reused verbatim from osi-video/src/narration.json so the
 * demo script in the app says exactly what the finished video says. Blocks are
 * hand-authored here.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = "C:/dev/video-lab/osi-video/src/narration.json";
const OUT = path.join(ROOT, "src", "lib", "templates", "osi.json");

const ACCENT = "#4FD1FF";
const LAYER_COLORS = {
  4: "#9B59B6", // L7 Application
  5: "#3498DB", // L6 Presentation
  6: "#1ABC9C", // L5 Session
  7: "#F1C40F", // L4 Transport
  8: "#E67E22", // L3 Network
  9: "#E74C3C", // L2 Data Link
  10: "#95A5A6", // L1 Physical
};

/** slug -> { title, accent?, blocks } */
const SPEC = {
  hook: {
    title: "Cold Open",
    blocks: [
      { type: "title", text: "How does data travel?", sub: "Millions of messages, every second" },
      {
        type: "bullets",
        items: ["Invisible messages cross the world", "Seven layers make it work", "We will walk all seven"],
      },
    ],
  },
  "whats-osi": {
    title: "What is OSI",
    blocks: [
      { type: "cards", items: [
        { label: "OSI", hint: "Open Systems Interconnection" },
        { label: "ISO", hint: "who defined it" },
        { label: "1984", hint: "the year" },
      ] },
      { type: "bullets", items: ["A conceptual framework, not a protocol", "Seven logical layers", "Each layer has one job"] },
    ],
  },
  "big-picture": {
    title: "The Big Picture",
    blocks: [
      { type: "title", text: "Like sending a letter", sub: "Each layer does one job, then hands it down" },
      { type: "steps", items: ["Write", "Seal", "Address", "Post", "Deliver"] },
    ],
  },
  "layer7-application": {
    title: "Layer 7 · Application",
    blocks: [
      { type: "title", text: "Layer 7 · Application", sub: "This is where you interact" },
      { type: "cards", items: [
        { label: "HTTP", value: "80 / 443", hint: "websites" },
        { label: "FTP", value: "21", hint: "files" },
        { label: "SMTP", value: "25", hint: "email" },
        { label: "DNS", value: "53", hint: "names" },
      ] },
    ],
  },
  "layer6-presentation": {
    title: "Layer 6 · Presentation",
    blocks: [
      { type: "title", text: "Layer 6 · Presentation", sub: "Translate · Encrypt · Compress" },
      { type: "cards", items: [
        { label: "Translate", hint: "same data language" },
        { label: "Encrypt", hint: "SSL / TLS" },
        { label: "Compress", hint: "smaller = faster" },
      ] },
      { type: "steps", items: ["JPEG", "PNG", "MP4"] },
    ],
  },
  "layer5-session": {
    title: "Layer 5 · Session",
    blocks: [
      { type: "title", text: "Layer 5 · Session", sub: "Like a phone call" },
      { type: "steps", items: ["Dial", "Talk", "Hang up"] },
      { type: "bullets", items: ["Remembers who is talking to whom", "And for how long"] },
    ],
  },
  "layer4-transport": {
    title: "Layer 4 · Transport",
    blocks: [
      { type: "title", text: "Layer 4 · Transport", sub: "The workhorse layer" },
      { type: "compare",
        left: { title: "TCP", items: ["Handshakes", "Checks every packet", "Retransmits losses"] },
        right: { title: "UDP", items: ["Fires and forgets", "No checking", "Perfect for video and gaming"] } },
      { type: "cards", items: [
        { label: "Segments", hint: "sliced + numbered" },
        { label: "Ports", hint: "which app gets it" },
      ] },
    ],
  },
  "layer3-network": {
    title: "Layer 3 · Network",
    blocks: [
      { type: "title", text: "Layer 3 · Network", sub: "GPS for data" },
      { type: "bullets", items: ["IP addresses: a from and a to, like an envelope", "Routers pick the best path", "Hop by hop, across oceans"] },
      { type: "cards", items: [{ label: "IPv4", value: "32-bit" }, { label: "IPv6", value: "128-bit" }] },
    ],
  },
  "layer2-datalink": {
    title: "Layer 2 · Data Link",
    blocks: [
      { type: "title", text: "Layer 2 · Data Link", sub: "Frames on the local wire" },
      { type: "cards", items: [
        { label: "Frames", hint: "the package" },
        { label: "MAC", hint: "hardware address" },
        { label: "CRC", hint: "error detection" },
        { label: "Switch", hint: "lives here" },
      ] },
    ],
  },
  "layer1-physical": {
    title: "Layer 1 · Physical",
    blocks: [
      { type: "title", text: "Layer 1 · Physical", sub: "Where ones and zeros meet the world" },
      { type: "bullets", items: ["Electrical pulses", "Light beams in fiber", "Radio waves over Wi-Fi"] },
    ],
  },
  encapsulation: {
    title: "Encapsulation",
    blocks: [
      { type: "title", text: "Encapsulation", sub: "Nesting dolls, all the way down" },
      { type: "stack", highlight: 7, layers: [
        { label: "Application data", color: "#9B59B6" },
        { label: "Presentation", color: "#3498DB" },
        { label: "Session", color: "#1ABC9C" },
        { label: "Segment + ports", color: "#F1C40F" },
        { label: "Packet + IP", color: "#E67E22" },
        { label: "Frame + MAC + CRC", color: "#E74C3C" },
        { label: "Bits on the wire", color: "#95A5A6" },
      ] },
      { type: "bullets", items: ["Down: each layer wraps it with its own header", "Up: each layer strips its header off"] },
    ],
  },
  mnemonic: {
    title: "Mnemonic",
    blocks: [
      { type: "mnemonic", phrase: "All People Seem To Need Data Processing", expansion: ["Application", "Presentation", "Session", "Transport", "Network", "Data Link", "Physical"] },
      { type: "mnemonic", phrase: "Please Do Not Throw Sausage Pizza Away", expansion: ["Physical", "Data Link", "Network", "Transport", "Session", "Presentation", "Application"] },
    ],
  },
  "real-example": {
    title: "Real World",
    blocks: [
      { type: "title", text: "One message, end to end", sub: "Down seven, across the world, up seven" },
      { type: "steps", items: ["Down 7 layers", "Across the internet", "Up 7 layers"] },
      { type: "cards", items: [{ label: "Under 100 ms", hint: "total round trip" }] },
    ],
  },
  outro: {
    title: "Outro",
    blocks: [
      { type: "outro", text: "Seven layers. One language.", sub: "Now you know how data really travels." },
      { type: "mnemonic", phrase: "Never forget the layers again", expansion: ["7", "6", "5", "4", "3", "2", "1"] },
    ],
  },
};

const narration = JSON.parse(fs.readFileSync(SRC, "utf-8"));

const scenes = narration.scenes.map((s) => {
  const spec = SPEC[s.slug];
  if (!spec) throw new Error(`no block spec for slug "${s.slug}"`);
  return {
    id: s.id,
    slug: s.slug,
    title: spec.title,
    narration: s.text,
    accent: spec.accent ?? LAYER_COLORS[s.id] ?? ACCENT,
    blocks: spec.blocks,
  };
});

const project = {
  name: "The OSI Model",
  theme: { name: "midnight" },
  fps: 30,
  width: 1920,
  height: 1080,
  gap: 0.45,
  voice: "",
  captions: { enabled: true, maxWords: 6, maxSeconds: 3.2, fontSize: 40 },
  scenes,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(project, null, 2)}\n`, "utf-8");

const blocks = scenes.reduce((n, s) => n + s.blocks.length, 0);
console.log(`osi.json: ${scenes.length} scenes, ${blocks} blocks -> ${OUT}`);
