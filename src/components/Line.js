import Segment from "./Segment";

export default (props) => {
  const segments = () => {
    if (typeof props.cursor === "number") {
      const segs = [];
      let len = 0;
      let i = 0;

      while (i < props.segments.length && len + props.segments[i].text.length - 1 < props.cursor) {
        const seg = props.segments[i];
        segs.push(seg);
        len += seg.text.length;
        i++;
      }

      if (i < props.segments.length) {
        const seg = props.segments[i];
        const inversedPen = new Map(seg.pen);
        inversedPen.set("inverse", !inversedPen.get("inverse"));

        const pos = props.cursor - len;

        if (pos > 0) {
          segs.push({ ...seg, text: seg.text.substring(0, pos) });
        }

        segs.push({
          ...seg,
          text: seg.text[pos],
          offset: seg.offset + pos,
          extraClass: "ap-cursor-a",
        });

        segs.push({
          ...seg,
          text: seg.text[pos],
          offset: seg.offset + pos,
          extraClass: "ap-cursor-b",
          pen: inversedPen,
        });

        if (pos < seg.text.length - 1) {
          segs.push({ ...seg, text: seg.text.substring(pos + 1), offset: seg.offset + pos + 1 });
        }

        i++;

        while (i < props.segments.length) {
          const seg = props.segments[i];
          segs.push(seg);
          i++;
        }
      }

      return segs;
    } else {
      return props.segments;
    }
  };

  return (
    <span class="ap-line" style={{ height: props.height }} role="paragraph">
      <Index each={segments()}>
        {(s) => <Segment terminalCols={props.terminalCols} {...s()} />}
      </Index>
    </span>
  );
};
