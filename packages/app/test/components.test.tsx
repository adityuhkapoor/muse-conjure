import { expect, test } from "bun:test";
import { Avatar, Button, Canvas, CardHeader, Facepile, OptionRow, Progress, Rsvp, SystemLine, Toast } from "../src/index.ts";
import { ctx, makeTheme, render } from "../src/internal.ts";

ctx.theme = makeTheme("light");

ctx.members = [
  { id: "maya", name: "Maya" },
  { id: "theo", name: "Theo" },
  { id: "dani", name: "Dani" },
  { id: "priya", name: "Priya" },
  { id: "sam", name: "Sam" },
];
const html = (v: unknown) => {
  const el = document.createElement("div");
  render(v as any, el);
  return el.innerHTML;
};
const noop = () => {};

test("Button", () => {
  expect(html(<Button kind="primary" onClick={noop}>Vote</Button>)).toMatchSnapshot();
  expect(html(<Button>I'm in</Button>)).toMatchSnapshot();
  expect(html(<Button kind="deemphasized" wide disabled label="Join" />)).toMatchSnapshot();
});

test("Avatar and Facepile", () => {
  expect(html(<Avatar user="maya" size={32} />)).toMatchSnapshot();
  expect(html(<Avatar user={{ id: "x", name: "Zed", avatar: "data:image/png;base64,AA" }} />)).toMatchSnapshot();
  expect(html(<Facepile users={["maya", "theo", "dani", "priya", "sam"]} />)).toMatchSnapshot();
});

test("OptionRow", () => {
  expect(html(<OptionRow label="Thai Basil" count={2} total={4} voters={["maya", "theo"]} selected onClick={noop} />)).toMatchSnapshot();
  expect(html(<OptionRow label="Tacos" count={0} total={4} />)).toMatchSnapshot();
});

test("Progress, CardHeader, Rsvp, Toast, SystemLine, Canvas", () => {
  expect(html(<Progress value={250} max={300} label="$250 of $300 · 6 chipped in" />)).toMatchSnapshot();
  expect(html(<Progress value={5} max={0} />)).toMatchSnapshot();
  expect(html(<CardHeader title="Weekend plan" subtitle="4 going" onMore={noop} />)).toMatchSnapshot();
  expect(html(<Rsvp value="going" onChange={noop} counts={{ going: 4 }} />)).toMatchSnapshot();
  expect(html(<Toast>You're in</Toast>)).toMatchSnapshot();
  expect(html(<SystemLine actor="Muse">built Weekend plan for this chat</SystemLine>)).toMatchSnapshot();
  expect(html(<Canvas height={200} draw={noop} label="Wheel" />)).toMatchSnapshot();
});

test("Rsvp reports the choice", () => {
  const el = document.createElement("div");
  let got = "";
  render(<Rsvp value={null} onChange={(v) => (got = v)} />, el);
  (el.querySelectorAll("button")[2] as HTMLButtonElement).click();
  expect(got).toBe("no");
});

test("a canvas lets vertical swipes scroll the chat unless it is a drag surface", () => {
  const touch = (v: unknown) => {
    const el = document.createElement("div");
    render(v as never, el);
    return (el.querySelector("canvas") as HTMLElement).style.touchAction;
  };
  const draw = () => {};
  expect(touch(<Canvas height={80} label="x" draw={draw} />)).toBe("");
  expect(touch(<Canvas height={80} label="x" draw={draw} onPointer={() => {}} />)).toBe("pan-y");
  expect(touch(<Canvas height={80} label="x" draw={draw} onPointer={() => {}} drag />)).toBe("none");
  // Broken: the stylesheet must not take every touch for all canvases.
  const { css } = require("../src/internal.ts");
  expect(String(css)).not.toMatch(/\.m-cv\{[^}]*touch-action:\s*none/);
});
