import { createEffect, onCleanup, onMount } from "solid-js";
import { getCssTheme } from "./Terminal";

// Experimental external terminal surface. Playback owns event order; the backend
// owns VT state and drawing. No backend-specific objects cross the worker boundary.
export default (props) => {
  /* eslint-disable solid/reactivity -- factory and lifecycle callbacks are mount-time dependencies */
  const core = props.core;
  const factory = props.backend;
  const ready = props.onReady;
  /* eslint-enable solid/reactivity */
  let element;
  let backend;
  let disposed = false;
  let failed = false;
  let frame;
  let presenting = false;
  let dirty = false;
  let cssTheme;
  let embeddedTheme;

  const style = () => ({
    width: `${props.cols}ch`,
    height: `${(props.lineHeight ?? 1.3333333333) * props.rows}em`,
    "font-size": `${(props.scale || 1) * 100}%`,
    overflow: "hidden",
  });

  function fail(error) {
    if (disposed || failed) return;
    failed = true;
    core.terminalFailed(error instanceof Error ? error : new Error(String(error)));
  }

  function invoke(method, value) {
    if (disposed || failed) return;
    try {
      backend[method](value);
      schedule();
    } catch (error) {
      fail(error);
    }
  }

  function schedule() {
    dirty = true;
    if (frame === undefined && !presenting && !disposed && !failed) {
      frame = requestAnimationFrame(present);
    }
  }

  async function present() {
    frame = undefined;
    presenting = true;
    dirty = false;
    try {
      await backend.present();
    } catch (error) {
      fail(error);
    } finally {
      presenting = false;
      if (dirty) schedule();
    }
  }

  function appearance() {
    const computed = getComputedStyle(element);
    return {
      fontFamily: computed.fontFamily,
      fontSize: parseFloat(computed.fontSize),
      lineHeight: props.lineHeight ?? 1.3333333333,
      blinking: props.blinking,
      cursorMode: props.cursorMode,
      boldIsBright: props.boldIsBright ?? false,
      adaptivePalette: props.adaptivePalette,
      theme: props.preferEmbeddedTheme && embeddedTheme ? embeddedTheme : cssTheme,
    };
  }

  function output(data) {
    for (const text of Array.isArray(data) ? data : [data]) invoke("write", text);
  }

  function reset(state) {
    embeddedTheme = state.theme;
    invoke("update", appearance());
    invoke("reset", state);
  }

  function resize(size) {
    invoke("resize", size);
  }

  createEffect(() => {
    // Track display changes even before the asynchronous factory resolves.
    props.scale;
    props.blinking;
    props.cursorMode;
    if (backend) invoke("update", appearance());
  });

  onMount(async () => {
    cssTheme = getCssTheme(element);
    try {
      const instance = await factory({
        element,
        size: { cols: props.cols, rows: props.rows },
        appearance: appearance(),
      });
      if (disposed) {
        instance.dispose();
        return;
      }
      backend = instance;
      for (const method of ["write", "resize", "reset", "update", "present", "dispose"]) {
        if (typeof backend?.[method] !== "function") throw new Error(`terminal backend missing ${method}`);
      }
      invoke("update", appearance());
      core.addEventListener("output", output);
      core.addEventListener("reset", reset);
      core.addEventListener("resize", resize);
      ready?.();
    } catch (error) {
      fail(error);
    }
  });

  onCleanup(() => {
    disposed = true;
    cancelAnimationFrame(frame);
    core.removeEventListener("output", output);
    core.removeEventListener("reset", reset);
    core.removeEventListener("resize", resize);
    backend?.dispose?.();
  });

  return <div class="ap-term ap-term-external" style={style()} ref={element} />;
};
