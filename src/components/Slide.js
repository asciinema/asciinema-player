import { children, createComputed, createSignal, untrack } from "solid-js";

// Minimal transition component inspired by solid-transition-group. When the
// resolved child element appears it runs the slide-enter class sequence on it; when it
// disappears it keeps the old element mounted, runs the slide-exit sequence, and
// removes it once its CSS transition ends.
export default (props) => {
  const resolved = children(() => props.children);
  const [el, setEl] = createSignal(untrack(resolved));
  let cancel;

  const transition = (element, phase, done) => {
    const classes = [`slide-${phase}`, `slide-${phase}-active`, `slide-${phase}-to`];
    let raf;

    const cleanup = () => {
      cancelAnimationFrame(raf);
      element.removeEventListener("transitionend", onEnd);
      element.classList.remove(...classes);
      cancel = undefined;
    };

    const onEnd = (e) => {
      if (e.target === element) {
        cleanup();
        done?.();
      }
    };

    cancel = cleanup;
    element.classList.add(classes[0], classes[1]);
    element.addEventListener("transitionend", onEnd);

    // two frames so the browser commits the start state before the class swap
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        element.classList.remove(classes[0]);
        element.classList.add(classes[2]);
      });
    });
  };

  createComputed((prev) => {
    const next = resolved();

    if (next !== prev) {
      cancel?.();

      if (next) {
        setEl(next);
        transition(next, "enter");
      } else {
        transition(untrack(el), "exit", () => setEl(undefined));
      }
    }

    return next;
  }, untrack(resolved));

  return el;
};
