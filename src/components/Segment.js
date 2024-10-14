import { createMemo } from "solid-js";

export default (props) => {
  const codePoint = createMemo(() => {
    if (props.text.length == 1) {
      const cp = props.text.codePointAt(0);

      if ((cp >= 0x2580 && cp <= 0x259f) || cp == 0xe0b0 || cp == 0xe0b2) {
        return cp;
      }
    }
  });

  const text = createMemo(() => (codePoint() ? " " : props.text));

  const style = createMemo(() =>
    buildStyle(props.pen, props.offset, props.width),
  );

  const className = createMemo(() => buildClassName(props.pen, codePoint(), props.extraClass));

  return (
    <span class={className()} style={style()}>
      {text()}
    </span>
  );
};

function buildClassName(attrs, codePoint, extraClass) {
  const fgClass = colorClass(attrs.get("fg"), attrs.get("bold"), "fg-");
  const bgClass = colorClass(attrs.get("bg"), attrs.get("blink"), "bg-");

  let cls = extraClass ?? "";

  if (codePoint !== undefined) {
    cls += ` cp-${codePoint.toString(16)}`;
  }

  if (fgClass) {
    cls += " " + fgClass;
  }

  if (bgClass) {
    cls += " " + bgClass;
  }

  if (attrs.has("bold")) {
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

  return cls;
}

function colorClass(color, intense, prefix) {
  if (typeof color === "number") {
    if (intense && color < 8) {
      color += 8;
    }

    return `${prefix}${color}`;
  }
}

function buildStyle(attrs, offset, width) {
  const fg = attrs.get("fg");
  const bg = attrs.get("bg");

  let style = {
    "--offset": offset,
    width: `${width + 0.01}ch`,
  };

  if (typeof fg === "string") {
    style["--fg"] = fg;
  }

  if (typeof bg === "string") {
    style["--bg"] = bg;
  }

  return style;
}
