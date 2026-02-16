import { For, createMemo } from "solid-js";

export default (props) => {
  const images = createMemo(() => {
    props.imageUpdateSignal();
    return props.core.getAllImages();
  });

  const getImageStyle = (image) => {
    const style = {};
    const displayRows = image.displayRows || 1;

    style.left = `calc(100% * ${image.col} / ${props.cols})`;
    style.top = `calc(100% * ${image.row} / ${props.rows})`;
    style.height = `calc(100% * ${displayRows} / ${props.rows})`;
    style.width = 'auto';
    style['max-width'] = `calc(100% - 100% * ${image.col} / ${props.cols})`;
    style['object-fit'] = image.preserveAspectRatio ? 'contain' : 'fill';

    // Clip top portion when partially scrolled off screen
    if (image.row < 0) {
      const clipTopPct = (-image.row / displayRows) * 100;
      style['clip-path'] = `inset(${clipTopPct}% 0 0 0)`;
    }

    return style;
  };

  return (
    <div class="ap-image-overlay">
      <For each={images()}>
        {(image) => {
          const blobUrl = props.core.getImageBlobUrl(image.id);
          if (!blobUrl) return null;

          return (
            <img
              src={blobUrl}
              alt={image.name || 'Inline image'}
              style={getImageStyle(image)}
              loading="lazy"
            />
          );
        }}
      </For>
    </div>
  );
};
