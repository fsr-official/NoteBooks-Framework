// node_modules/@vercel/analytics/dist/index.mjs
var initQueue = () => {
  if (window.va) return;
  window.va = function a(...params) {
    if (!window.vaq) window.vaq = [];
    window.vaq.push(params);
  };
};
var name = "@vercel/analytics";
var version = "2.0.1";
function isBrowser() {
  return typeof window !== "undefined";
}
function detectEnvironment() {
  try {
    const env = "development";
    if (env === "development" || env === "test") {
      return "development";
    }
  } catch {
  }
  return "production";
}
function setMode(mode = "auto") {
  if (mode === "auto") {
    window.vam = detectEnvironment();
    return;
  }
  window.vam = mode;
}
function getMode() {
  const mode = isBrowser() ? window.vam : detectEnvironment();
  return mode || "production";
}
function isDevelopment() {
  return getMode() === "development";
}
function getScriptSrc(props) {
  if (props.scriptSrc) {
    return makeAbsolute(props.scriptSrc);
  }
  if (isDevelopment()) {
    return "https://va.vercel-scripts.com/v1/script.debug.js";
  }
  if (props.basePath) {
    return makeAbsolute(`${props.basePath}/insights/script.js`);
  }
  return "/_vercel/insights/script.js";
}
function loadProps(explicitProps, confString) {
  var _a;
  let props = explicitProps;
  if (confString) {
    try {
      props = {
        ...(_a = JSON.parse(confString)) == null ? void 0 : _a.analytics,
        ...explicitProps
      };
    } catch {
    }
  }
  setMode(props.mode);
  const dataset = {
    sdkn: name + (props.framework ? `/${props.framework}` : ""),
    sdkv: version
  };
  if (props.disableAutoTrack) {
    dataset.disableAutoTrack = "1";
  }
  if (props.viewEndpoint) {
    dataset.viewEndpoint = makeAbsolute(props.viewEndpoint);
  }
  if (props.eventEndpoint) {
    dataset.eventEndpoint = makeAbsolute(props.eventEndpoint);
  }
  if (props.sessionEndpoint) {
    dataset.sessionEndpoint = makeAbsolute(props.sessionEndpoint);
  }
  if (isDevelopment() && props.debug === false) {
    dataset.debug = "false";
  }
  if (props.dsn) {
    dataset.dsn = props.dsn;
  }
  if (props.endpoint) {
    dataset.endpoint = props.endpoint;
  } else if (props.basePath) {
    dataset.endpoint = makeAbsolute(`${props.basePath}/insights`);
  }
  return {
    beforeSend: props.beforeSend,
    src: getScriptSrc(props),
    dataset
  };
}
function makeAbsolute(url) {
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/") ? url : `/${url}`;
}
function inject(props = {
  debug: true
}, confString) {
  var _a;
  if (!isBrowser()) return;
  const { beforeSend, src, dataset } = loadProps(props, confString);
  initQueue();
  if (beforeSend) {
    (_a = window.va) == null ? void 0 : _a.call(window, "beforeSend", beforeSend);
  }
  if (document.head.querySelector(`script[src*="${src}"]`)) return;
  const script = document.createElement("script");
  script.src = src;
  for (const [key, value] of Object.entries(dataset)) {
    script.dataset[key] = value;
  }
  script.defer = true;
  script.onerror = () => {
    const errorMessage = isDevelopment() ? "Please check if any ad blockers are enabled and try again." : "Be sure to enable Web Analytics for your project and deploy again. See https://vercel.com/docs/analytics/quickstart for more information.";
    console.log(
      `[Vercel Web Analytics] Failed to load script from ${src}. ${errorMessage}`
    );
  };
  document.head.appendChild(script);
}

// node_modules/@vercel/speed-insights/dist/index.mjs
var initQueue2 = () => {
  if (window.si) return;
  window.si = function a(...params) {
    window.siq = window.siq || [];
    window.siq.push(params);
  };
};
var name2 = "@vercel/speed-insights";
var version2 = "2.0.0";
function isBrowser2() {
  return typeof window !== "undefined";
}
function detectEnvironment2() {
  try {
    const env = "development";
    if (env === "development" || env === "test") {
      return "development";
    }
  } catch {
  }
  return "production";
}
function isDevelopment2() {
  return detectEnvironment2() === "development";
}
function getScriptSrc2(props) {
  if (props.scriptSrc) {
    return makeAbsolute2(props.scriptSrc);
  }
  if (isDevelopment2()) {
    return "https://va.vercel-scripts.com/v1/speed-insights/script.debug.js";
  }
  if (props.dsn) {
    return "https://va.vercel-scripts.com/v1/speed-insights/script.js";
  }
  if (props.basePath) {
    return makeAbsolute2(`${props.basePath}/speed-insights/script.js`);
  }
  return "/_vercel/speed-insights/script.js";
}
function loadProps2(explicitProps, confString) {
  var _a;
  let props = explicitProps;
  if (confString) {
    try {
      props = {
        ...(_a = JSON.parse(confString)) == null ? void 0 : _a.speedInsights,
        ...explicitProps
      };
    } catch {
    }
  }
  const dataset = {
    sdkn: name2 + (props.framework ? `/${props.framework}` : ""),
    sdkv: version2
  };
  if (props.sampleRate) {
    dataset.sampleRate = props.sampleRate.toString();
  }
  if (props.route) {
    dataset.route = props.route;
  }
  if (isDevelopment2() && props.debug === false) {
    dataset.debug = "false";
  }
  if (props.dsn) {
    dataset.dsn = props.dsn;
  }
  if (props.endpoint) {
    dataset.endpoint = makeAbsolute2(props.endpoint);
  } else if (props.basePath) {
    dataset.endpoint = makeAbsolute2(`${props.basePath}/speed-insights/vitals`);
  }
  return {
    src: getScriptSrc2(props),
    beforeSend: props.beforeSend,
    dataset
  };
}
function makeAbsolute2(url) {
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/") ? url : `/${url}`;
}
function injectSpeedInsights(props = {}, confString) {
  var _a;
  if (!isBrowser2() || props.route === null) return null;
  initQueue2();
  const { beforeSend, src, dataset } = loadProps2(props, confString);
  if (document.head.querySelector(`script[src*="${src}"]`)) return null;
  if (beforeSend) {
    (_a = window.si) == null ? void 0 : _a.call(window, "beforeSend", beforeSend);
  }
  const script = document.createElement("script");
  script.src = src;
  script.defer = true;
  for (const [key, value] of Object.entries(dataset)) {
    script.dataset[key] = value;
  }
  script.onerror = () => {
    console.log(
      `[Vercel Speed Insights] Failed to load script from ${src}. Please check if any content blockers are enabled and try again.`
    );
  };
  document.head.appendChild(script);
  return {
    setRoute: (route) => {
      script.dataset.route = route ?? void 0;
    }
  };
}

// src/client/observability.ts
function sanitizeUrl(event) {
  try {
    const url = new URL(event.url, window.location.origin);
    return { ...event, url: `${url.origin}${url.pathname}` };
  } catch {
    return event;
  }
}
function isLocalDevelopment() {
  return ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
}
function initObservability() {
  if (typeof window === "undefined" || window.__notebooksObservabilityInitialized) return;
  window.__notebooksObservabilityInitialized = true;
  const local = isLocalDevelopment();
  const mode = local ? "development" : "production";
  inject({
    framework: "vanilla",
    mode,
    beforeSend: sanitizeUrl
  });
  injectSpeedInsights({
    framework: "vanilla",
    scriptSrc: local ? "https://va.vercel-scripts.com/v1/speed-insights/script.debug.js" : "/_vercel/speed-insights/script.js",
    debug: local,
    route: window.location.pathname,
    beforeSend: sanitizeUrl
  });
}
initObservability();
export {
  initObservability
};
