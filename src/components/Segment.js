import { createMemo } from "solid-js";

export default (props) => {
  const codePoint = createMemo(() => {
    if (props.t.length == 1) {
      const cp = props.t.codePointAt(0);

      // box drawing chars, block elements and some Powerline symbols
      // are rendered with CSS classes (cp-<codepoint>)
      if ((cp >= 0x2580 && cp <= 0x259f) || (cp >= 0xe0b0 && cp <= 0xe0b3)) {
        return cp;
      }
    }
  });

  const text = createMemo(() => (codePoint() ? " " : props.t));
  const style = createMemo(() => buildStyle(props.p, props.x, props.w, props.cursor));
  const className = createMemo(() => buildClassName(props.p, codePoint(), props.w, props.cursor));

  return (
    <span class={className()} style={style()}>
      {text()}
    </span>
  );
};

function buildClassName(attrs, codePoint, width, cursor) {
  let cls = cursor ? "ap-cursor" : "";

  if (codePoint !== undefined) {
    cls += ` cp-${codePoint.toString(16)}`;
  }

  if (attrs.has("bold") || isBrightColor(attrs.get("fg"))) {
    cls += " ap-bright";
  }

  if (attrs.has("faint")) {
    cls += " ap-faint";
  }

  if (attrs.has("italic")) {
    cls += " ap-italic";
  }

  if (attrs.has("underline")) {
    cls += " ap-underline";
  }

  if (attrs.has("blink")) {
    cls += " ap-blink";
  }

  if (attrs.get("inverse")) {
    cls += " ap-inverse";
  }

  if (width == 1) {
    cls += " ap-symbol";
  }

  if (cls === "") {
    return undefined;
  } else {
    return cls;
  }
}

function isBrightColor(color) {
  return typeof color === "number" && color >= 8 && color <= 15;
}

function buildStyle(attrs, offset, width, cursor) {
  let style = {
    "--offset": offset,
    width: `${width + 0.01}ch`,
  };

  const fg = colorValue(attrs.get("fg"), attrs.get("bold"));

  if (fg) {
    style["--fg"] = fg;
  }

  if (cursor) {
    const bg = colorValue(attrs.get("bg"), false);

    if (bg) {
      style["--bg"] = bg;
    }
  }

  return style;
}

function colorValue(color, intense) {
  if (typeof color === "number") {
    if (intense && color < 8) {
      color += 8;
    }

    return `var(--term-color-${color})`;
  } else if (typeof color === "string") {
    return color;
  }
}
