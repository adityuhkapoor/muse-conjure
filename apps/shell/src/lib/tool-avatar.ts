// What a tool frame draws for a person: the same face the shell shows, as a data URI (the frame's
// CSP allows `img-src data:` only). Made-up people get their drawn face at once; the three real
// team members get their 96 px photo once it has been fetched and inlined, and until then the drawn
// face. Members are sent again when the photos are ready (`whenPhotosReady`).
import { avatarFor } from "@muse/assets";
import { faceUrl } from "./face";
import { realPerson } from "./media";

const photos = new Map<string, string>();
let loading: Promise<boolean> | undefined;

const toDataUri = (b: Blob) =>
  new Promise<string>((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => no(r.error);
    r.readAsDataURL(b);
  });

/** Fetch and inline the real people's photos once; true when something new arrived. */
export function whenPhotosReady(): Promise<boolean> {
  loading ??= (async () => {
    let got = false;
    for (const key of ["aditya", "calvin", "arun", "tsai", "will"]) {
      const ref = avatarFor(key, 96, { dpr: 1 });
      if (ref.kind !== "image") continue;
      try {
        const res = await fetch(ref.src);
        if (res.ok) (photos.set(key, await toDataUri(await res.blob())), (got = true));
      } catch {}
    }
    return got;
  })();
  return loading;
}

// Fetch the photos as soon as the shell loads, so the first tool to mount already has them.
if (typeof window !== "undefined") void whenPhotosReady();

/** The data URI for a person's avatar in a tool: photo if loaded, else the drawn face. */
export function toolAvatar(id: string, name = ""): string | undefined {
  if (id === "muse") return undefined;
  const real = realPerson(id);
  return (real && photos.get(real)) || faceUrl(id, name, 96);
}
