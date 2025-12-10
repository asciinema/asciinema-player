import Segment from "./Segment";

export default (props) => {
  const segments = () => {
    if (typeof props.cursor === "number") {
      const segs = [];
      let x = 0;
      let segIndex = 0;

      while (
        segIndex < props.segments.length &&
        x + props.segments[segIndex].w - 1 < props.cursor
      ) {
        const seg = props.segments[segIndex];
        segs.push(seg);
        x += seg.w;
        segIndex++;
      }

      if (segIndex < props.segments.length) {
        const seg = props.segments[segIndex];
        const charWidth = seg.W;
        let cellIndex = props.cursor - x;
        const charIndex = Math.floor(cellIndex / charWidth);
        cellIndex = charIndex * charWidth;
        const chars = Array.from(seg.t);

        if (charIndex > 0) {
          segs.push({ ...seg, t: chars.slice(0, charIndex).join("") });
        }

        segs.push({
          ...seg,
          t: chars[charIndex],
          x: x + cellIndex,
          w: charWidth,
          cursor: true,
        });

        if (charIndex < chars.length - 1) {
          segs.push({
            ...seg,
            t: chars.slice(charIndex + 1).join(""),
            x: x + cellIndex + 1,
            w: seg.w - charWidth,
          });
        }

        segIndex++;

        while (segIndex < props.segments.length) {
          const seg = props.segments[segIndex];
          segs.push(seg);
          segIndex++;
        }
      }

      return segs;
    } else {
      return props.segments;
    }
  };

  return (
    <span class="ap-line" role="paragraph">
      <Index each={segments()}>{(s) => <Segment {...s()} />}</Index>
    </span>
  );
};
