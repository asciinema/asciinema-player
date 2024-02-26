export default (props) => {
  return (
    <span
      class={className(props.pen, props.extraClass)}
      style={style(props.pen, props.offset, props.terminalCols)}
    >
      {props.text}
    </span>
  );
};

function className(attrs, extraClass) {
  const fgClass = colorClass(attrs.get("fg"), attrs.get("bold"), "fg-");
  const bgClass = colorClass(attrs.get("bg"), attrs.get("blink"), "bg-");

  let cls = extraClass ?? "";

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
  if (color !== undefined) {
    if (intense && color < 8) {
      color += 8;
    }

    return `${prefix}${color}`;
  }
}

function style(attrs, offset, terminalCols) {
  const fg = attrs.get("fg");
  const bg = attrs.get("bg");

  let style = {
    left: `${(100 * offset) / terminalCols}%`,
  };

  if (typeof fg === "string") {
    style["--fg"] = fg;
  }

  if (typeof bg === "string") {
    style["--bg"] = bg;
  }

  return style;
}
