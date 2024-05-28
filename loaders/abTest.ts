import { allowCorsFor, LoaderContext } from "deco/mod.ts";
import { Flag } from "deco/types.ts";
import { AnalyticsEvent } from "apps/commerce/types.ts";

type EventHandler = (event?: AnalyticsEvent) => void | Promise<void>;

interface EventsAPI {
  dispatch: (event: unknown) => void;
  subscribe: (
    handler: EventHandler,
    options?: AddEventListenerOptions | boolean,
  ) => () => void;
}

export interface TrackElement {
  cssSelector: string;
  eventType: "click" | "hover";
  eventName: string;
}

export interface Code {
  /**
   * @title JavaScript to run
   * @format code
   * @language javascript
   */
  injectedScript?: string;
  /**
   * @title CSS to run
   * @format code
   * @language css
   */
  injectedStyle?: string;
}

export interface Props {
  name: string;
  /**
   * @maxItems 2
   */
  variants: Code[];
  trackedElements?: TrackElement[];
  plausibleDomain?: string;
}

const snippet = (result: Props) => {
  const plausibleAttributes = {
    "data-domain": result.plausibleDomain || "",
    "data-api": "https://plausible.io/api/event",
    "src": "https://plausible.io/js/script.manual.hash.js",
    "defer": "true",
  };

  function addPlausible() {
    const newScript = document.createElement("script");
    for (const [key, value] of Object.entries(plausibleAttributes)) {
      newScript.setAttribute(key, value);
    }
    document.head.appendChild(newScript);
  }

  function runJS(jsToRun: string) {
    eval(jsToRun);
  }

  function addCSS(cssToAdd: string) {
    const style = document.createElement("style");
    style.type = "text/css";

    // @ts-expect-error This is required for IE8 and below.
    if (style.styleSheet) {
      // @ts-expect-error This is required for IE8 and below.
      style.styleSheet.cssText = cssToAdd;
    } else {
      style.appendChild(document.createTextNode(cssToAdd));
    }
    document.head.appendChild(style);
  }

  function trackElements(elementsToTrack: TrackElement[]) {
    elementsToTrack.forEach((element) => {
      const elements = document.querySelectorAll(element.cssSelector);
      elements.forEach((el) => {
        el.addEventListener(element.eventType, () => {
          globalThis.window.DECO.events.dispatch({ name: element.eventName });
        });
      });
    });
  }

  async function fetchScript() {
    const flags = parseFlags();
    let configIndex = flags[result.name] ? 1 : 0;

    if (flags[result.name] === null || flags[result.name] === undefined) {
      const renderVariant = randomMatcher({ traffic: 0.5 });
      configIndex = renderVariant ? 1 : 0;
      setFlags(document.cookie, [{
        name: result.name,
        value: renderVariant,
        isSegment: true,
      }]);
    }

    const jsToRun = result.variants?.[configIndex]?.injectedScript;
    const cssToAdd = result.variants?.[configIndex]?.injectedStyle;
    const elementsToTrack = result.trackedElements;

    addPlausible();

    try {
      if (jsToRun) runJS(jsToRun);
    } catch (e) {
      console.error(e);
    }
    try {
      if (cssToAdd) addCSS(cssToAdd);
    } catch (e) {
      console.error(e);
    }
    try {
      globalThis.window.addEventListener("load", () => {
        if (!elementsToTrack) return;
        trackElements(elementsToTrack);
      });
    } catch (e) {
      console.error(e);
    }

    // wait plausible load
    await sleep(500);

    const target = new EventTarget();

    const dispatch: EventsAPI["dispatch"] = (event: unknown) => {
      target.dispatchEvent(new CustomEvent("analytics", { detail: event }));
    };

    const subscribe: EventsAPI["subscribe"] = (handler, opts) => {
      // deno-lint-ignore no-explicit-any
      const cb = ({ detail }: any) => handler(detail);
      const flags = getFlagsFromCookies(parseCookies(document.cookie));
      handler({
        name: "deco",
        params: { flags, page: { id: globalThis.window.location.href } },
      });

      target.addEventListener("analytics", cb, opts);

      return () => {
        target.removeEventListener("analytics", cb, opts);
      };
    };

    globalThis.window.DECO = {
      ...globalThis.window.DECO,
      events: { dispatch, subscribe },
    };

    const truncate = (str: string) => `${str}`.slice(0, 990);

    const props: Record<string, string> = {};

    globalThis.window.DECO.events.subscribe((event) => {
      if (!event) return;

      const { name, params } = event;

      if (!name || !params || name === "deco") return;

      const values = { ...props };
      for (const key in params) {
        // @ts-expect-error somehow typescript bugs
        const value = params[key];

        if (value !== null && value !== undefined) {
          values[key] = truncate(
            typeof value !== "object" ? value : JSON.stringify(value),
          );
        }
      }

      globalThis.window.plausible?.(name, { props: values });
    });

    const trackPageview = () =>
      globalThis.window.plausible?.("pageview", { props });
    // First pageview
    trackPageview();
  }

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  const DECO_SEGMENT = "deco_segment";

  const parseFlags = (): Record<string, string | boolean> => {
    const _flags = getFlagsFromCookies(parseCookies(document.cookie));
    const flags: Record<string, string | boolean> = {};
    _flags.forEach((flag) => flags[flag.name] = flag.value);
    return flags;
  };

  const getFlagsFromCookies = (cookies: Record<string, string>) => {
    const flags: Flag[] = [];
    const segment = cookies["deco_segment"]
      ? tryOrDefault(
        () => JSON.parse(decodeURIComponent(atob(cookies["deco_segment"]))),
        {},
      )
      : {};

    segment.active?.forEach((flag: string) =>
      flags.push({ name: flag, value: true })
    );
    segment.inactiveDrawn?.forEach((flag: string) =>
      flags.push({ name: flag, value: false })
    );

    return flags;
  };

  const setFlags = (cookie: string, flags: Flag[]) => {
    const cookieSegment = tryOrDefault(
      () => decodeCookie(parseCookies(cookie)[DECO_SEGMENT]),
      "",
    );

    const segment = tryOrDefault(() => JSON.parse(cookieSegment), {});

    const active = new Set(segment.active || []);
    const inactiveDrawn = new Set(segment.inactiveDrawn || []);
    for (const flag of flags) {
      if (flag.isSegment) {
        if (flag.value) {
          active.add(flag.name);
          inactiveDrawn.delete(flag.name);
        } else {
          active.delete(flag.name);
          inactiveDrawn.add(flag.name);
        }
      }
    }
    const newSegment = {
      active: [...active].sort(),
      inactiveDrawn: [...inactiveDrawn].sort(),
    };
    const value = JSON.stringify(newSegment);
    const hasFlags = active.size > 0 || inactiveDrawn.size > 0;

    if (hasFlags && cookieSegment !== value) {
      setCookie(DECO_SEGMENT, btoa(encodeURIComponent(value)), 365);
    }
  };

  const parseCookies = (cookieString: string) => {
    const cookies: Record<string, string> = {};
    cookieString.split(";").forEach((cookie) => {
      const [key, value] = cookie.split("=").map((c) => c.trim());
      cookies[key] = value;
    });
    return cookies;
  };

  const tryOrDefault = <R>(fn: () => R, defaultValue: R) => {
    try {
      return fn();
    } catch {
      return defaultValue;
    }
  };

  const decodeCookie = (cookie: string) => {
    return decodeURIComponent(atob(cookie));
  };

  const setCookie = (name: string, value: string, days: number) => {
    let expires = "";
    if (days) {
      const date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/";
  };

  const randomMatcher = ({ traffic }: { traffic: number }) => {
    return Math.random() < traffic;
  };

  fetchScript();
};

/**
 * @title Layout Effects
 */
const loader = (
  { name, variants, trackedElements }: Props,
  req: Request,
  ctx: LoaderContext,
) => {
  Object.entries(allowCorsFor(req)).map(([name, value]) => {
    ctx.response.headers.set(name, value);
  });

  const script = `(${snippet})(JSON.parse(${JSON.stringify(
    JSON.stringify({ name, variants, trackedElements })
  )}));`;

  return new Response(script, {
    headers: {
      "Content-Type": "text/javascript",
    },
  });
};

export default loader;
