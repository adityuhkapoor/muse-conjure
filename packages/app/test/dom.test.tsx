import { expect, test } from "bun:test";
import { h, Fragment } from "../src/index.ts";
import { render } from "../src/internal.ts";

const box = () => document.createElement("div");

test("keyed children are moved, not recreated", () => {
  const el = box();
  const list = (ks: string[]) => <ul>{ks.map((k) => <li key={k}>{k}</li>)}</ul>;
  render(list(["a", "b", "c", "d"]), el);
  const before = [...el.querySelectorAll("li")];
  render(list(["d", "a", "c", "b"]), el);
  const after = [...el.querySelectorAll("li")];
  expect(after.map((n) => n.textContent)).toEqual(["d", "a", "c", "b"]);
  expect(after).toEqual([before[3]!, before[0]!, before[2]!, before[1]!]);
  for (let i = 0; i < 4; i++) expect(after.some((n) => n === before[i])).toBe(true);
});

test("insert and remove in the middle keep the other nodes", () => {
  const el = box();
  const list = (ks: number[]) => <div>{ks.map((k) => <p key={k}>{k}</p>)}</div>;
  render(list([1, 2, 3]), el);
  const [p1, , p3] = [...el.querySelectorAll("p")];
  render(list([1, 9, 3]), el);
  const now = [...el.querySelectorAll("p")];
  expect(now.map((n) => n.textContent)).toEqual(["1", "9", "3"]);
  expect(now[0]).toBe(p1!);
  expect(now[2]).toBe(p3!);
});

test("only changed text and attributes are touched", () => {
  const el = box();
  render(<div class="a" title="t">hello {"world"}</div>, el);
  const div = el.firstChild as HTMLElement;
  const texts = [...div.childNodes];
  let writes = 0;
  const obs = new MutationObserver((r) => (writes += r.length));
  obs.observe(el, { subtree: true, attributes: true, characterData: true, childList: true });
  render(<div class="a" title="t">hello {"there"}</div>, el);
  const recs = obs.takeRecords();
  obs.disconnect();
  expect(recs.length + writes).toBe(1);
  expect(recs[0]!.type).toBe("characterData");
  expect([...div.childNodes]).toEqual(texts);
  expect(el.firstChild).toBe(div);
});

test("props, styles and events are added, updated and removed", () => {
  const el = box();
  let clicks = 0;
  render(<button disabled style={{ marginTop: 4, opacity: 0.5 }} onClick={() => clicks++} aria-label="x" />, el);
  const b = el.firstChild as HTMLButtonElement;
  expect(b.disabled).toBe(true);
  expect(b.style.marginTop).toBe("4px");
  expect(b.style.opacity).toBe("0.5");
  b.click(); // disabled: no event
  render(<button style={{ marginTop: 4, opacity: 0.5 }} onClick={() => clicks++} />, el);
  b.click();
  render(<button style={{ opacity: 1 }} />, el);
  expect(el.firstChild).toBe(b);
  expect(b.disabled).toBe(false);
  expect(b.style.marginTop).toBe("");
  expect(b.getAttribute("aria-label")).toBe(null);
  b.click();
  expect(clicks).toBe(1);
});

test("components and fragments flatten; keyed components keep their nodes", () => {
  const Row = (p: { name: string }) => (
    <>
      <dt>{p.name}</dt>
      <dd>{p.name.length}</dd>
    </>
  );
  const el = box();
  render(<dl>{["ab", "c"].map((n) => <Row key={n} name={n} />)}</dl>, el);
  const dts = [...el.querySelectorAll("dt")];
  render(<dl>{["c", "ab"].map((n) => <Row key={n} name={n} />)}</dl>, el);
  expect(el.querySelector("dl")!.textContent).toBe("c1ab2");
  expect([...el.querySelectorAll("dt")]).toEqual([dts[1]!, dts[0]!]);
});

test("a selection moving through a list leaves no old nodes behind", () => {
  const Dot = (p: { on: boolean }) => <span class={p.on ? "on" : ""} />;
  const Label = (p: { on: boolean; t: string }) => <b class={p.on ? "on" : ""}>{p.t}</b>;
  const Row = (p: { on: boolean; t: string }) => <><Dot on={p.on} /><Label {...p} /></>;
  const icon = <i />;
  const el = box();
  const v = (sel: number) => (
    <div>
      {["a", "b", "c"].map((t, i) => <Row key={t} on={i === sel} t={t} />)}
      {[0, 1].map((i) => <p key={i} class={i === sel ? "on" : ""}>{i === sel ? [icon, icon] : null}</p>)}
      {[0, 1].map((i) => <p key={i} class={i === sel ? "on" : ""} />)}
    </div>
  );
  for (const sel of [0, 1, 2, 0]) render(v(sel), el);
  expect(el.querySelectorAll("span").length).toBe(3);
  expect(el.querySelectorAll("p").length).toBe(4);
  expect(el.querySelectorAll("i").length).toBe(2);
  expect(el.querySelectorAll(".on").length).toBe(4);
  expect(el.querySelector("div")!.textContent).toBe("abc");
});

test("type change replaces; holes are skipped; svg gets the svg namespace", () => {
  const el = box();
  render(<div>{false}{null}<span>a</span>{undefined}</div>, el);
  expect(el.innerHTML).toBe("<div><span>a</span></div>");
  render(<div><b>a</b></div>, el);
  expect(el.innerHTML).toBe("<div><b>a</b></div>");
  render(<svg viewBox="0 0 2 2"><path d="M0 0" /></svg>, el);
  expect(el.querySelector("path")!.namespaceURI).toBe("http://www.w3.org/2000/svg");
});

test("controlled input keeps the caret: value is only written when it differs", () => {
  const el = box();
  render(<input value="ab" />, el);
  const i = el.firstChild as HTMLInputElement;
  i.value = "abc"; // user typed; app has not re-rendered yet
  render(<input value="abc" />, el);
  expect(i.value).toBe("abc");
  render(<input value="" />, el);
  expect(i.value).toBe("");
});

test("a reused vnode object renders in two places", () => {
  const icon = <i>x</i>;
  const el = box();
  render(<p>{icon}{icon}</p>, el);
  expect(el.innerHTML).toBe("<p><i>x</i><i>x</i></p>");
  render(<p>{icon}{icon}</p>, el);
  expect(el.innerHTML).toBe("<p><i>x</i><i>x</i></p>");
});

test("h() works without JSX", () => {
  const el = box();
  render(h("p", { id: "a" }, "x", h(Fragment, null, "y")), el);
  expect(el.innerHTML).toBe('<p id="a">xy</p>');
});
