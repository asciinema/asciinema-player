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
  const fg = attrs.get("inverse") ? (attrs.has("bg") ? attrs.get("bg") : "bg") : attrs.get("fg");

  const bg = attrs.get("inverse") ? (attrs.has("fg") ? attrs.get("fg") : "fg") : attrs.get("bg");

  const fgClass = colorClass(fg, attrs.get("bold"), "fg-");
  const bgClass = colorClass(bg, attrs.get("blink"), "bg-");

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

  return cls;
}

function colorClass(color, intense, prefix) {
  if (typeof color === "number") {
    if (intense && color < 8) {
      color += 8;
    }

    return `${prefix}${color}`;
  } else if (color == "fg" || color == "bg") {
    return `${prefix}${color}`;
  }
}

function style(attrs, offset, terminalCols) {
  const fg = attrs.get("inverse") ? attrs.get("bg") : attrs.get("fg");
  const bg = attrs.get("inverse") ? attrs.get("fg") : attrs.get("bg");

  let style = {
    left: `${(100 * offset) / terminalCols}%`,
  };

  if (typeof fg === "string") {
    style["color"] = fg;
  }

  if (typeof bg === "string") {
    style["background-color"] = bg;
  }

  return style;
}
